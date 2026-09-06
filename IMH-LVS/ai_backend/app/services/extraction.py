import os
import io
import json
import torch
from PIL import Image
from pdf2image import convert_from_bytes
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from app.schemas.label import ExtractedLabel

class ExtractionService:
    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock
        self.model = None
        self.processor = None

    def _load_model(self):
        """Lazy load the Qwen2-VL-2B model to stay within 6GB VRAM limit. 
        Only loads when an actual inference request is made."""
        if self.model is None and not self.use_mock:
            print("Lazy loading Qwen2-VL-2B model into GPU... This will use HF_HOME cache.")
            model_path = "Qwen/Qwen2-VL-2B-Instruct"
            self.processor = AutoProcessor.from_pretrained(model_path)
            
            # Using bfloat16 or float16 to fit in 6GB VRAM
            self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                model_path, 
                torch_dtype=torch.float16,
                device_map="auto"
            )

    def extract_from_image(self, image: Image.Image) -> ExtractedLabel:
        if not self.use_mock:
            self._load_model()
            
            # Real VLM Inference Logic
            # Instruct the model to extract fields deterministically without self-reported confidence
            prompt = (
                "Analyze this product label image. Extract the following fields as a JSON object: "
                "brand_name, product_name, colour_theme, flavour, claims, logo, layout, "
                "nutrition_table, fssai_number, ingredients, marketing_company, address, "
                "customer_care_number, customer_care_email, package_size, manufacturing_company. "
                "If a field is not present in the image, set its value to null. "
                "Return ONLY a valid JSON dictionary."
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
                generated_ids = self.model.generate(**inputs, max_new_tokens=1024)
                
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
        
        # We use model_validate/parse_obj to safely ignore extra fields and enforce types
        return ExtractedLabel(**label_data)

    def process_file(self, file_bytes: bytes, filename: str) -> ExtractedLabel:
        if filename.lower().endswith(".pdf"):
            images = convert_from_bytes(file_bytes)
            target_image = images[0]
        else:
            target_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            
        return self.extract_from_image(target_image)
