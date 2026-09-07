import os
import io
import json
import re
import torch
from PIL import Image
from pdf2image import convert_from_bytes
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from app.schemas.label import ExtractedLabel


def _validate_fssai_number(value):
    """An Indian FSSAI license number is always exactly 14 digits. Rather than
    trust a misread digit count (the model has been observed to pad or drop
    one), treat anything else as unread — the no-fabrication rule this whole
    system is built on."""
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits if len(digits) == 14 else None


def _validate_logo(value):
    """The logo field describes a graphic on the label, never a link. The
    model has been observed to fabricate a plausible-looking placeholder URL
    when it can't describe the logo confidently — reject anything URL-shaped
    rather than pass a hallucinated link through as if it were real data."""
    if value is None:
        return None
    if re.match(r"^\s*(https?://|www\.)", str(value), re.IGNORECASE):
        return None
    return value

class ExtractionService:
    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock
        self.model = None
        self.processor = None

    def _load_model(self):
        """Lazy load the Qwen2-VL-2B model to stay within 6GB VRAM limit.
        Only loads when an actual inference request is made.

        This deployment only ever runs on this machine's own GPU — never
        silently on CPU. device_map="auto" would otherwise let accelerate
        quietly place the model on CPU (or split it CPU/GPU) whenever CUDA
        isn't available, which already happened once from a CPU-only torch
        build and made inference unusably slow without any visible error.
        Failing loudly here surfaces that misconfiguration immediately
        instead of degrading silently."""
        if self.model is None and not self.use_mock:
            if not torch.cuda.is_available():
                raise RuntimeError(
                    "CUDA GPU not available — refusing to fall back to CPU inference. "
                    "Install the CUDA build of torch (e.g. `pip install torch --index-url "
                    "https://download.pytorch.org/whl/cu128`) and verify with "
                    "`torch.cuda.is_available()` before retrying."
                )
            print(f"Lazy loading Qwen2-VL-2B model into GPU ({torch.cuda.get_device_name(0)})... This will use HF_HOME cache.")
            model_path = "Qwen/Qwen2-VL-2B-Instruct"
            self.processor = AutoProcessor.from_pretrained(model_path)

            # Using float16 to fit in 6GB VRAM. Pinned to the single local GPU
            # (device_map={"": 0}) rather than "auto" — "auto" is meant for
            # multi-GPU/CPU-offload setups and can silently split the model
            # onto CPU under VRAM pressure instead of erroring.
            self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                model_path,
                torch_dtype=torch.float16,
                device_map={"": 0}
            )

    def extract_from_image(self, image: Image.Image) -> ExtractedLabel:
        if not self.use_mock:
            self._load_model()
            
            # Real VLM Inference Logic
            # Instruct the model to extract fields deterministically without self-reported confidence.
            # The field-specific rules below each target a real failure mode observed in testing —
            # not hypothetical ones — so keep them if the underlying model changes rather than
            # trimming back to a generic prompt.
            prompt = (
                "You are extracting structured data from a product label image for a pharmaceutical/"
                "health-supplement compliance system. Extract ONLY what is visibly printed on the label — "
                "never guess, invent, or fill in a plausible-sounding value. Return a single JSON object "
                "with exactly these fields: brand_name, product_name, colour_theme (list), flavour, "
                "claims (list), logo, layout, nutrition_table (a flat object of nutrient name to amount, "
                "one entry per row of the nutrition panel), fssai_number, ingredients (list), "
                "marketing_company, address, customer_care_number, customer_care_email, package_size, "
                "manufacturing_company.\n\n"
                "Field-specific rules:\n"
                "- fssai_number: an Indian FSSAI license number is ALWAYS exactly 14 digits. If more than "
                "one is printed (e.g. one for the manufacturer, one for the marketer), extract the one for "
                "the Marketed By / brand-owner company. If you cannot read all 14 digits with certainty, "
                "return null rather than padding or guessing a digit.\n"
                "- logo: describe what the logo looks like (shapes, symbols, colours). It is a graphic on "
                "the label, never a URL or web link — never output anything starting with 'http' or 'www'.\n"
                "- package_size: the net content/weight/count actually sold (e.g. '30 Gummies', '150 g', "
                "'500 ml'). This is NOT a print/die-cut dimension annotation such as 'SIZE: 222x88mm' that "
                "may appear as a production mark on the artwork — ignore those.\n"
                "- claims and ingredients: each is a list of separate items. Never join two claims, or two "
                "ingredients, into one string.\n"
                "- If a field is not present or not legible on the image, set its value to null.\n"
                "Return ONLY the JSON object, no other text."
            )
            
            # Format inputs according to Qwen2-VL requirements
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": image},
                        {"type": "text", "text": prompt},
                    ],
                }
            ]
            
            text_prompt = self.processor.apply_chat_template(messages, add_generation_prompt=True)
            inputs = self.processor(text=[text_prompt], images=[image], padding=True, return_tensors="pt").to(self.model.device)
            
            with torch.no_grad():
                # Greedy decoding, not sampling: this is a single-answer extraction task, and
                # sampling's per-token randomness is exactly what let a plausible-looking but
                # fabricated logo URL and a corrupted FSSAI digit through in testing.
                generated_ids = self.model.generate(**inputs, max_new_tokens=1024, do_sample=False)
                
            # Trim the prompt from the output
            generated_ids_trimmed = [
                out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            response_text = self.processor.batch_decode(generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
            
            try:
                # Attempt to parse the JSON output from the model
                start_idx = response_text.find('{')
                end_idx = response_text.rfind('}') + 1
                if start_idx == -1 or end_idx == 0:
                    raise ValueError("No JSON object found")
                label_data = json.loads(response_text[start_idx:end_idx])
            except (json.JSONDecodeError, ValueError):
                print(f"Failed to parse VLM output as JSON: {response_text}")
                label_data = {}

        else:
            # Mock Data fallback for immediate testing without GPU
            label_data = {
                "brand_name": "HealthPlus",
                "product_name": "Vitamin C Gummies",
                "colour_theme": ["Orange", "Yellow"],
                "flavour": "Orange",
                "claims": ["Immunity Booster", "No Added Sugar"],
                "logo": "Orange Shield",
                "layout": "Centered text, top logo",
                "nutrition_table": {"Vitamin C": "50mg"},
                "fssai_number": "12345678901234",
                "ingredients": ["Ascorbic Acid", "Pectin"],
                "marketing_company": "HealthPlus India",
                "address": "123 Health Ave, Mumbai",
                "customer_care_number": "1800-123-456",
                "customer_care_email": "care@healthplus.com",
                "package_size": "30 Gummies",
                "manufacturing_company": "Wellness Mfg Ltd"
            }
        
        # Ensure missing fields are None
        expected_keys = [
            "brand_name", "product_name", "colour_theme", "flavour", "claims", "logo", 
            "layout", "nutrition_table", "fssai_number", "ingredients", "marketing_company", 
            "address", "customer_care_number", "customer_care_email", "package_size", 
            "manufacturing_company"
        ]
        for key in expected_keys:
            if key not in label_data:
                label_data[key] = None

        # Deterministic checks the prompt can request but not guarantee — reject
        # rather than trust a value that fails them outright.
        label_data["fssai_number"] = _validate_fssai_number(label_data.get("fssai_number"))
        label_data["logo"] = _validate_logo(label_data.get("logo"))

        # We use model_validate/parse_obj to safely ignore extra fields and enforce types
        return ExtractedLabel(**label_data)

    def process_file(self, file_bytes: bytes, filename: str) -> ExtractedLabel:
        if filename.lower().endswith(".pdf"):
            images = convert_from_bytes(file_bytes)
            target_image = images[0]
        else:
            target_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            
        return self.extract_from_image(target_image)
