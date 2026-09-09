import os
import io
import json
import re
import torch
from PIL import Image
from pdf2image import convert_from_bytes
from transformers import BitsAndBytesConfig, Qwen2VLForConditionalGeneration, AutoProcessor
from app.schemas.label import ExtractedLabel


# The one prompt this system extracts with. Module-level, and imported by the
# fine-tuning data builder (finetune/build_training_set.py) rather than
# duplicated there: a fine-tuned adapter is trained to answer THIS wording, so
# a prompt that drifted from the one training used would silently degrade the
# very accuracy the fine-tune bought.
#
# Instructs the model to extract fields deterministically without self-reported
# confidence. The field-specific rules below each target a real failure mode
# observed in testing — not hypothetical ones — so keep them if the underlying
# model changes rather than trimming back to a generic prompt.
EXTRACTION_PROMPT = (
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
    "- logo: look for a distinct icon, emblem, or symbol near the brand name (e.g. a leaf, "
    "shield, circular badge, mascot) — this is separate from the brand name's own stylised "
    "text, and separate from the marketing/manufacturing company name. Describe its actual "
    "shape and colour only if you can clearly see it; return null rather than guess if you "
    "are not confident, or if what you'd describe is really just repeating another field "
    "(e.g. a company name) rather than a distinct graphic. It is a graphic, never a URL or "
    "web link — never output anything starting with 'http' or 'www'.\n"
    "- colour_theme: name only the actual print/branding colours of the packaging design "
    "itself (background colours, headline text colours) — at most 3-4 colour words. Never "
    "read a printed code, batch number, or placeholder text (e.g. inside a Batch No./Pkg. "
    "Date box) as if it were a colour.\n"
    "- package_size: the net content/weight/count actually sold (e.g. '30 Gummies', '150 g', "
    "'500 ml'). This is NOT a print/die-cut dimension annotation such as 'SIZE: 222x88mm' that "
    "may appear as a production mark on the artwork — ignore those.\n"
    "- claims and ingredients: each is a list of separate items. Never join two claims, or two "
    "ingredients, into one string.\n"
    "- If a field is not present or not legible on the image, set its value to null.\n"
    "Return ONLY the JSON object, no other text."
)

# The image-resolution cap the processor is loaded with, shared with training
# for the same train/serve-parity reason as the prompt above — an adapter
# trained at one visual token budget degrades if inference uses another.
MIN_PIXELS = 256 * 28 * 28
MAX_PIXELS = 1280 * 28 * 28

# The 16 fields EXTRACTION_PROMPT asks for, in the order it lists them.
# Module-level (and imported by finetune/build_training_set.py) for the same
# reason as EXTRACTION_PROMPT: one place that both the parser's completeness
# check and the training target's key order agree on.
LABEL_FIELDS = [
    "brand_name", "product_name", "colour_theme", "flavour", "claims", "logo",
    "layout", "nutrition_table", "fssai_number", "ingredients",
    "marketing_company", "address", "customer_care_number",
    "customer_care_email", "package_size", "manufacturing_company",
]

# Per-field guidance repeated in the completion prompt below, for exactly the
# fields it can be asked to recover. Deliberately not sourced from
# EXTRACTION_PROMPT by slicing its text apart — that string is intentionally
# opaque (see its own comment on why it must not drift), so this instead
# restates the same guidance in its own small, independent copy.
_COMPLETION_FIELD_NOTES = {
    "fssai_number": (
        "fssai_number: an Indian FSSAI license number is ALWAYS exactly 14 digits. If more than "
        "one is printed, extract the one for the Marketed By / brand-owner company. If you cannot "
        "read all 14 digits with certainty, return null rather than padding or guessing a digit."
    ),
    "package_size": (
        "package_size: the net content/weight/count actually sold (e.g. '30 Gummies', '150 g'). "
        "This is NOT a print/die-cut dimension annotation such as 'SIZE: 222x88mm'."
    ),
    "logo": (
        "logo: a distinct icon or emblem near the brand name, separate from stylised brand text or "
        "a company name. Return null rather than guess, and never a URL."
    ),
    "colour_theme": (
        "colour_theme: only the actual print/branding colours of the packaging design, at most "
        "3-4 colour words."
    ),
}
_COMPLETION_FIELD_NOTES["claims"] = _COMPLETION_FIELD_NOTES["ingredients"] = (
    "claims and ingredients: each is a list of separate items, never joined into one string."
)


def _build_completion_prompt(missing_fields):
    """A second, narrower prompt asking only for the fields the first pass
    never mentioned at all — see _missing_fields for why that is a distinct,
    worse failure than the model explicitly writing one of them as null.

    Deliberately small: fewer fields to hold in mind at once is the intended
    fix for a model that stopped partway through a 16-field list, and a
    shorter expected answer is itself less likely to run into the same
    problem again."""
    notes = []
    seen = set()
    for field in missing_fields:
        note = _COMPLETION_FIELD_NOTES.get(field)
        if note and note not in seen:
            notes.append("- " + note)
            seen.add(note)
    notes_block = ("\n\nField-specific rules:\n" + "\n".join(notes)) if notes else ""
    fields_list = ", ".join(missing_fields)
    return (
        "You are extracting structured data from a product label image for a pharmaceutical/"
        "health-supplement compliance system. This is a FOLLOW-UP request: an earlier pass over "
        "this same image already extracted some fields, and these specific fields still need "
        "values. Extract ONLY what is visibly printed on the label — never guess, invent, or fill "
        "in a plausible-sounding value.\n\n"
        f"Return a single JSON object with EXACTLY these fields, and no others: {fields_list}."
        f"{notes_block}\n"
        "If a field is not present or not legible on the image, set its value to null.\n"
        "Return ONLY the JSON object, no other text."
    )


def _missing_fields(label_data, expected_keys):
    """Keys the model never wrote at all, as distinct from a key it wrote
    with an explicit null. The prompt's own instruction is 'if a field is
    not legible, set its value to null' — a model following that instruction
    still emits the key. A key that is simply ABSENT means generation ended
    (or the object closed) before the model ever considered it, which has
    been observed concretely: one response covered the first 10 of 16 fields
    and closed its closing brace right after the 10th, never attempting the
    other 6. Treating that omission as an honest 'not legible' silently
    turns a generation bug into what looks like a confident null to a
    reviewer — this distinction is what makes the completion retry possible
    without guessing at content."""
    return [key for key in expected_keys if key not in label_data]


def _adapter_path():
    """The configured fine-tuned adapter directory, or "" when the service
    should run the base model. Read in two places (the loader picks the base
    precision from it, and _apply_adapter attaches it), so it lives here
    rather than being re-derived from the environment twice."""
    path = os.environ.get("LABEL_LORA_ADAPTER", "").strip()
    return path if path and os.path.isdir(path) else ""

_UNQUOTED_NUMERIC_UNIT_VALUE = re.compile(r':(\s*)(-?\d+(?:\.\d+)?\s+[^,{}\[\]"]*?)\s*(?=[,}])')


def _quote_unquoted_numeric_unit_values(text):
    """Observed failure shape: the model writes a nutrition-table value like
    3.2 g or 300 IU (0.03 g of Vitamin D = 0.03 mg) without the quotes JSON
    requires for a string, which json.loads rejects outright. A generic JSON
    repair library fixes the syntax by discarding everything after the
    leading digits, silently turning "3.2 g" into the bare number 3.2 — for
    a nutrition panel, dropping the unit is dropping real label content, the
    exact silent-data-loss this system's other field validators (see
    _validate_fssai_number, _validate_logo) are built to avoid. This instead
    quotes the value as-is, keeping the unit text intact, and touches
    nothing that was already valid JSON (a bare number with no trailing
    text, e.g. "Calories": 120, has no space before the comma and is left
    for json.loads to parse as a number)."""
    return _UNQUOTED_NUMERIC_UNIT_VALUE.sub(lambda m: ':' + m.group(1) + '"' + m.group(2).replace('"', '\\"') + '"', text)


_MERGED_KEY_VALUE = re.compile(r'^(\s*)"([^"]+?):[ \t]*([^"]*)"(,?)[ \t]*$', re.MULTILINE)


def _split_merged_key_value_pairs(text):
    """Observed failure shape: inside nutrition_table the model writes a
    whole entry as ONE string, dropping the quote-colon-quote that separates
    key from value:

        "Biotin (per serving)": "6 mg",              <- correct
        "Calcium (as Calcium Carbonate): <0.01% DV", <- collapsed

    json.loads rejects the second form with "Expecting ':' delimiter", and
    because it happens partway through a long nutrition panel the whole
    extraction is lost — the service falls back to an all-null result even
    though every other field on the page was read correctly.

    A line that is already a valid pair is left alone: this only matches a
    string whose colon sits INSIDE the quotes, so "Sodium": "Kids: 10.63 mg"
    (a legitimate value that happens to contain a colon) does not match — the
    character after its key's closing quote is a quote, not a colon."""
    return _MERGED_KEY_VALUE.sub(lambda m: f'{m.group(1)}"{m.group(2)}": "{m.group(3)}"{m.group(4)}', text)


def _validate_fssai_number(value):
    """An Indian FSSAI license number is always exactly 14 digits. Rather than
    trust a misread digit count (the model has been observed to pad or drop
    one), treat anything else as unread — the no-fabrication rule this whole
    system is built on."""
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits if len(digits) == 14 else None


def _validate_logo(value, other_fields=()):
    """The logo field describes a graphic on the label, never a link or a
    restated company name. The model has been observed to fabricate a
    plausible-looking placeholder URL when it can't describe the logo
    confidently, and separately to copy another field's value (e.g. the
    marketing company name) into logo instead of admitting it can't
    describe a graphic — reject both rather than pass either through as if
    it were a real logo description. other_fields is the set of this same
    extraction's other string field values, normalised the same way, so an
    exact cross-field copy can be caught regardless of which field it came
    from."""
    if value is None:
        return None
    text = str(value)
    if re.match(r"^\s*(https?://|www\.)", text, re.IGNORECASE):
        return None
    if text.strip().lower() in other_fields:
        return None
    return value


def _looks_like_colour_name(text):
    """Structural check, not a word list — a fixed vocabulary of English
    colour words is the same hardcoding the brief's §3 forbids (and already
    removed for flavours), and it would silently reject perfectly real
    colours like "charcoal", "saffron", "fuchsia" or "off-white" just for
    not appearing in whoever wrote the list's head. Instead this rejects the
    actual observed failure shape: the model reading an unrelated printed
    code (a batch-code placeholder stamp like "UVZ") into this field.

    - A dimension/date/batch code contains digits; a colour name never does.
    - A short (<=3 letter) ALL-CAPS alphabetic token reads as a stamped
      placeholder code, not a colour description — every colour name this
      model has actually produced in testing came back in Title Case
      ("Red", "White", "Green & Orange"), never as a bare short all-caps
      token, which is how "UVZ" was rendered because that is how it is
      printed on the label itself. This is an initial, documented
      calibration against the one real failure seen so far, not a proof;
      revisit if a genuine false rejection shows up against real data.
    - A long, multi-word string reads as a sentence fragment, not a colour
      name.
    """
    text = text.strip()
    if not text or len(text) > 30:
        return False
    if any(ch.isdigit() for ch in text):
        return False
    words = [w for w in re.split(r"[\s/&-]+", text) if w]
    if not words or len(words) > 4:
        return False
    for word in words:
        if word.isalpha() and word.isupper() and len(word) <= 3:
            return False
    return True


def _validate_colour_theme(value):
    """colour_theme should name print/branding colours actually used on the
    packaging design. See _looks_like_colour_name for what "looks like a
    colour" means structurally — drop anything that doesn't, rather than
    pass a non-colour value through as if it were real data."""
    if value is None:
        return None
    items = value if isinstance(value, list) else [part.strip() for part in str(value).split(",") if part.strip()]
    kept = [item for item in items if _looks_like_colour_name(str(item))]
    return kept if kept else None

def _resolve_inference_device(cuda_available, allow_cpu_env):
    """Which device _load_model should use, or raises if neither a GPU nor
    the explicit ALLOW_CPU_INFERENCE opt-in is available. Pure and
    parameter-driven (rather than reading torch.cuda.is_available()/
    os.environ itself) so this decision is testable without a real GPU or
    loading the actual model."""
    if cuda_available:
        return "cuda"
    if allow_cpu_env.strip().lower() in ("1", "true", "yes"):
        return "cpu"
    raise RuntimeError(
        "CUDA GPU not available — refusing to fall back to CPU inference. "
        "Install the CUDA build of torch (e.g. `pip install torch --index-url "
        "https://download.pytorch.org/whl/cu128`) and verify with "
        "`torch.cuda.is_available()` before retrying. To explicitly allow slow "
        "CPU-only inference instead (e.g. for smoke-testing on a machine with no "
        "GPU), set ALLOW_CPU_INFERENCE=1."
    )


class ExtractionService:
    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock
        self.model = None
        self.processor = None

    def _load_model(self):
        """Lazy load the Qwen2-VL-2B model to stay within 6GB VRAM limit.
        Only loads when an actual inference request is made.

        This deployment only ever runs on this machine's own GPU — never
        SILENTLY on CPU. device_map="auto" would otherwise let accelerate
        quietly place the model on CPU (or split it CPU/GPU) whenever CUDA
        isn't available, which already happened once from a CPU-only torch
        build and made inference unusably slow without any visible error.
        Failing loudly here surfaces that misconfiguration immediately
        instead of degrading silently.

        The one deliberate escape hatch is ALLOW_CPU_INFERENCE=1: without
        it, this service cannot start inference at all on a machine with no
        NVIDIA GPU, which blocks anyone from smoke-testing it on a laptop
        without one. Setting it is an explicit, opt-in choice to accept
        CPU's much slower inference — never the default — and it still logs
        a loud warning every time, so it's obvious from the console output
        that a real deployment is not accidentally running this way."""
        if self.model is None and not self.use_mock:
            device = _resolve_inference_device(torch.cuda.is_available(), os.environ.get("ALLOW_CPU_INFERENCE", ""))

            model_path = "Qwen/Qwen2-VL-2B-Instruct"
            # Qwen2-VL's image processor has no resolution cap by default
            # (longest_edge defaults to ~12.8 megapixels) — a label scanned
            # at 200 DPI easily exceeds that untouched, producing thousands
            # of vision tokens. Measured directly on this deployment's GPU:
            # an uncapped ~6.7MP label (2560x2623) produced ~8,500 image
            # tokens and made a single extraction take 30+ minutes at 100%
            # GPU utilisation; capping to Qwen's own documented 256-1280
            # token range ("to balance performance and cost") brought the
            # same label down to ~1,300 total tokens and a few seconds.
            # 1280*28*28 keeps print small enough to read (FSSAI digits,
            # nutrition-table rows) while fitting comfortably in 6GB VRAM.
            self.processor = AutoProcessor.from_pretrained(
                model_path,
                min_pixels=MIN_PIXELS,
                max_pixels=MAX_PIXELS
            )

            if device == "cuda":
                print(f"Lazy loading Qwen2-VL-2B model into GPU ({torch.cuda.get_device_name(0)})... This will use HF_HOME cache.")
                # Pinned to the single local GPU (device_map={"": 0}) rather
                # than "auto" — "auto" is meant for multi-GPU/CPU-offload
                # setups and can silently split the model onto CPU under VRAM
                # pressure instead of erroring.
                if _adapter_path():
                    # The adapter was trained by QLoRA against a 4-bit NF4
                    # base, and its weights only mean anything relative to
                    # those quantised weights: they encode a correction to
                    # the quantised model, not to the full-precision one.
                    # Serving the same adapter on float16 weights is not a
                    # slight mismatch but a broken model — measured on a
                    # held-out page, float16 + adapter degenerated into a
                    # repeating counting sequence that filled the whole token
                    # budget and parsed to nothing, while the identical
                    # adapter on the 4-bit base returned correct, complete
                    # JSON. Match the training precision.
                    self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                        model_path,
                        quantization_config=BitsAndBytesConfig(
                            load_in_4bit=True,
                            bnb_4bit_quant_type="nf4",
                            bnb_4bit_use_double_quant=True,
                            bnb_4bit_compute_dtype=torch.float16,
                        ),
                        device_map={"": 0},
                    )
                else:
                    # No adapter: float16, which fits the 6GB budget and
                    # avoids quantisation error the base model never had.
                    self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                        model_path,
                        torch_dtype=torch.float16,
                        device_map={"": 0}
                    )
            else:
                print(
                    "WARNING: ALLOW_CPU_INFERENCE=1 is set and no CUDA GPU is available — "
                    "loading Qwen2-VL-2B onto CPU. This is dramatically slower than GPU "
                    "inference (minutes per label, not seconds) and is intended for "
                    "smoke-testing only, never a real deployment."
                )
                # float32, not float16: CPU kernels for float16 are either
                # unsupported or far slower on most CPUs than float32.
                self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                    model_path,
                    torch_dtype=torch.float32,
                    device_map="cpu"
                )

            self._apply_adapter()

    def _apply_adapter(self):
        """Loads the LoRA adapter fine-tuned on this company's own labels, when
        one has been trained and LABEL_LORA_ADAPTER points at it.

        Opt-in by design: the base model must keep working on a machine that
        has never run training, so an unset or missing path is a normal state
        that logs and continues rather than failing startup. Loading is also
        the LAST step of _load_model, so a broken adapter cannot leave a
        half-initialised model behind — self.model is already a working base
        model by the time this runs."""
        configured = os.environ.get("LABEL_LORA_ADAPTER", "").strip()
        adapter_path = _adapter_path()
        if not adapter_path:
            if configured:
                print(f"WARNING: LABEL_LORA_ADAPTER is set to '{configured}' but no such directory exists — running the base model.")
            return
        from peft import PeftModel
        print(f"Loading fine-tuned LoRA adapter from {adapter_path}")
        self.model = PeftModel.from_pretrained(self.model, adapter_path)
        self.model.eval()

    def _generate_json(self, image: Image.Image, prompt: str, max_new_tokens: int = 1024) -> dict:
        """One generation pass over `image` with `prompt`, returning the
        parsed JSON object (or {} if nothing usable could be parsed even
        after the narrow repairs below). Shared by the main extraction pass
        and the completion retry in extract_from_image, so both go through
        the same decoding settings and the same repair helpers."""
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
            #
            # repetition_penalty is a separate axis from sampling — it reweights logits
            # before the (still-greedy) argmax rather than adding randomness, so it doesn't
            # reopen that risk. It's here because greedy decoding was observed getting stuck
            # repeating one ingredient ("Gum Arabic", "Gum Arabic", ...) for the full
            # max_new_tokens budget, cutting the response off mid-string with no closing
            # brace — truncated JSON no repair can safely complete without guessing content.
            # 1.15 is the standard mitigation value for this exact failure shape.
            generated_ids = self.model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False, repetition_penalty=1.15)

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
            candidate = response_text[start_idx:end_idx]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                # Retry against the observed, narrowly-scoped repairs
                # rather than giving up immediately — see each helper for
                # the specific malformation it targets. These are not a
                # general-purpose JSON repair: each one exists because
                # this model was seen producing that exact shape, and
                # each preserves the printed text rather than discarding
                # the part it cannot parse.
                repaired = _quote_unquoted_numeric_unit_values(candidate)
                repaired = _split_merged_key_value_pairs(repaired)
                return json.loads(repaired)
        except (json.JSONDecodeError, ValueError):
            print(f"Failed to parse VLM output as JSON: {response_text}")
            return {}

    def extract_from_image(self, image: Image.Image) -> ExtractedLabel:
        if not self.use_mock:
            self._load_model()

            label_data = self._generate_json(image, EXTRACTION_PROMPT)

            # A key the model never wrote at all (not even as null) means
            # generation ended before it considered that field — observed
            # concretely on a real label where a long claims/nutrition
            # section pushed the response to close after the 10th of 16
            # fields, silently dropping marketing_company, address,
            # customer_care_number, customer_care_email, package_size and
            # manufacturing_company. One smaller, focused follow-up over the
            # SAME image asking only for what was skipped gives the model a
            # real second attempt rather than papering over the gap with
            # None — and because it is still reading the actual image for an
            # actual value, a field that genuinely isn't legible still comes
            # back null afterward, exactly as it should.
            omitted = _missing_fields(label_data, LABEL_FIELDS)
            if omitted and label_data:
                print(f"First pass never mentioned {omitted} — retrying once for just those fields.")
                completion = self._generate_json(image, _build_completion_prompt(omitted), max_new_tokens=384)
                for field in omitted:
                    if field not in completion:
                        continue
                    value = completion[field]
                    # A blank string is the same "nothing found" answer as an
                    # explicit null — the completion prompt has been observed
                    # returning "" for a field it could not locate rather
                    # than writing null as asked. Normalising it here means
                    # the field ends up truly absent instead of a hollow
                    # empty value that could display as answered.
                    if isinstance(value, str) and not value.strip():
                        value = None
                    label_data[field] = value

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
        for key in LABEL_FIELDS:
            if key not in label_data:
                label_data[key] = None

        # Deterministic checks the prompt can request but not guarantee — reject
        # rather than trust a value that fails them outright.
        label_data["fssai_number"] = _validate_fssai_number(label_data.get("fssai_number"))
        other_field_values = {
            str(label_data.get(key)).strip().lower()
            for key in ("brand_name", "marketing_company", "manufacturing_company", "product_name")
            if label_data.get(key)
        }
        label_data["logo"] = _validate_logo(label_data.get("logo"), other_field_values)
        label_data["colour_theme"] = _validate_colour_theme(label_data.get("colour_theme"))

        # We use model_validate/parse_obj to safely ignore extra fields and enforce types
        return ExtractedLabel(**label_data)

    def process_file(self, file_bytes: bytes, filename: str) -> ExtractedLabel:
        if filename.lower().endswith(".pdf"):
            images = convert_from_bytes(file_bytes)
            target_image = images[0]
        else:
            target_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            
        return self.extract_from_image(target_image)
