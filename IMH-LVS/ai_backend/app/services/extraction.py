import os
import io
import json
import re
import sys
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
    "address": (
        "address: a single plain string exactly as printed (e.g. 'Village Doduwal, Tehsil Baddi "
        "(H.P.) INDIA - 173 205'), never an object broken into sub-fields like city/state/country."
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


def _has_content(value):
    """Whether a completion/tile answer is a real value worth keeping, as
    opposed to a hollow non-answer that happens not to be a bare None.

    Two shapes have been observed in place of a clean null when the model
    could not find a field: a blank string, and — for address specifically —
    a dict of the right-looking sub-fields with every one of them blank,
    e.g. {"city": "", "state": "", "country": ""}. That second shape matters
    because it would otherwise survive into the schema's own dict-to-string
    coercion (_as_scalar in schemas/label.py) as "city: , state: , country:
    " — a value that reads as answered but says nothing, worse than the null
    it should have been. Recurses so a list or dict of blanks at any depth
    is caught the same way."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(_has_content(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_content(v) for v in value)
    return True  # numbers, bools: never observed blank-shelled, taken as real


def _normalize_literal_null_strings(data):
    """Turns a top-level value the model spelled out as the STRING "null"
    into the actual JSON null it was clearly trying to write.

    Observed concretely on a real label's fssai_number: the model's raw JSON
    contained `"fssai_number": "null"` — quoted, a real 4-character string —
    rather than the unquoted `null` literal the prompt asks for. That string
    is non-blank, so _has_content sees it as real content and every recovery
    path below (the completion retry, the tile fallback) skips the field
    entirely, leaving it to be caught only by _validate_fssai_number at the
    very end — which rejects it correctly, but without ever giving the model
    the same second look a genuinely omitted field gets. Normalizing here,
    right after parsing, means a quoted "null" is indistinguishable from the
    real thing everywhere downstream."""
    return {
        key: None if isinstance(value, str) and value.strip().lower() == "null" else value
        for key, value in data.items()
    }


# Anchors and size for the tiling fallback below: a 3x3 grid of overlapping
# ~40%-of-the-page crops. Confirmed empirically, not guessed — a label was
# found where marketing_company, address, customer_care_number and
# manufacturing_company all came back blank through the whole-page
# completion retry, an explicit "look after the words 'Marketed by:'"
# textual anchor, AND doubling the whole page's resolution, and cropping
# just that one panel out of the page correctly recovered every one of
# them. A production label's layout isn't known in advance, so this grid
# stands in for that manual crop: dense compliance-text blocks are
# consistently large enough to land mostly inside one ~40% tile, and the
# 0/33/67% anchors with a 40% size give neighbouring tiles enough overlap
# that a block near a boundary still lands fully inside at least one of
# them rather than being split across two partial views.
_TILE_STARTS = (0.0, 0.33, 0.67)
_TILE_SIZE_FRACTION = 0.40

# manufacturing_company specifically, excluded from the tile fallback above —
# not the others. Confirmed directly, twice, on the same real label: asked
# about manufacturing_company in isolation, 7 of 9 tiles (and separately,
# with a much stronger "return null unless the exact words 'Manufactured
# By:' are visible in THIS crop" instruction, still 4 of 9 tiles) answered
# with a brand wordmark or logo text visible in that crop ("Homeo-Vita",
# "UC HOMOEOPATHY", "GNC") rather than the null the prompt asked for when
# the real answer wasn't there. marketing_company, address,
# customer_care_number and customer_care_email showed no such pattern in
# any tile across every test run on this same label — this is a field-
# specific, evidence-based exclusion, not a blanket distrust of tiling. A
# fabricated manufacturer name accepted as if verified is a worse outcome
# for a compliance system than the blank field this exclusion falls back
# to; still eligible for the safer whole-page retry above, which showed no
# hallucination in the same testing.
_TILE_INELIGIBLE_FIELDS = frozenset({"manufacturing_company"})


def _tile_image(image):
    """The 9 overlapping crops _TILE_STARTS/_TILE_SIZE_FRACTION describe."""
    width, height = image.size
    tiles = []
    for y_start in _TILE_STARTS:
        for x_start in _TILE_STARTS:
            x0, y0 = int(x_start * width), int(y_start * height)
            x1 = min(width, int(x0 + _TILE_SIZE_FRACTION * width))
            y1 = min(height, int(y0 + _TILE_SIZE_FRACTION * height))
            tiles.append(image.crop((x0, y0, x1, y1)))
    return tiles


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

            # Overridable so the same service can be pointed at a bigger
            # fine-tune (e.g. evaluate_adapter.py checking a 7B adapter
            # trained on a Colab T4) without touching what a normal, unset
            # local run loads — mirrors the same FINETUNE_MODEL_PATH pattern
            # finetune/train_lora.py already uses, and for the same reason.
            model_path = os.environ.get("FINETUNE_MODEL_PATH", "Qwen/Qwen2-VL-2B-Instruct")
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
            #
            # repetition_penalty alone was not enough: fine-tuning eval runs kept
            # reproducing the same loop (a "Pale [colour]"/"Food Dyes Detergent..."-style
            # list that never terminates) even with it set. no_repeat_ngram_size is a hard
            # constraint rather than a soft reweighting — it makes an N-token sequence
            # literally impossible to repeat — so the two work at different strengths on
            # the same failure mode. This was first set to 4, on the theory that 4 was
            # short enough to block the observed loops while long enough not to forbid
            # legitimate short reuse elsewhere in a label. In practice it was too tight:
            # real labels legitimately repeat short phrases (a unit like "100 mg" recurring
            # across different nutrition rows, an ingredient named in both the ingredients
            # list and a claim), and banning the model from ever repeating a 4-token
            # sequence forced it into low-probability tokens to route around those
            # legitimate repeats — producing its own kind of malformed output. 32 is long
            # enough that only a genuine degenerate loop (the same phrase or list fragment
            # repeating for many tokens straight) trips the ban, while ordinary short reuse
            # elsewhere on the label does not.
            generated_ids = self.model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False, repetition_penalty=1.15, no_repeat_ngram_size=32)

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
                return _normalize_literal_null_strings(json.loads(candidate))
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
                return _normalize_literal_null_strings(json.loads(repaired))
        except (json.JSONDecodeError, ValueError):
            # The retry/tile-fallback paths below make this reachable far more
            # often than before (see extract_from_image), and real model output
            # has been observed containing characters (e.g. a Unicode
            # replacement character from a garbled decode) that the console's
            # encoding — cp1252 by default on Windows — cannot print at all,
            # crashing the whole extraction on what should be a logged failure.
            # Re-encoding defensively here keeps this a diagnostic print, never
            # a second point of failure on top of the one it's reporting.
            console_encoding = sys.stdout.encoding or "utf-8"
            safe_text = response_text.encode(console_encoding, errors="replace").decode(console_encoding)
            print(f"Failed to parse VLM output as JSON: {safe_text}")
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
            #
            # The same retry also covers a field the main pass DID mention
            # but left with nothing usable (null, "", or — normalized above
            # — the literal string "null"). That was deliberately excluded
            # at first, on the theory that an explicit null is the model's
            # honest "not legible" and retrying it would just be guessing.
            # Proven wrong on a real label: fssai_number came back blank on
            # the main pass despite being printed on the page, and the retry
            # mechanism only ever looked at omitted keys, so it never got a
            # second look at all. Retrying a field that turns out to
            # genuinely be absent just reconfirms null at the cost of one
            # extra generation — cheap insurance against the alternative,
            # which is a real value silently lost with no second attempt.
            omitted = _missing_fields(label_data, LABEL_FIELDS)
            blank = [key for key in LABEL_FIELDS if not _has_content(label_data.get(key))]
            # Deliberately NOT conditioned on `label_data` being non-empty. A
            # totally empty {} (the first pass produced no parseable JSON at
            # all — observed concretely as a repetition-loop degeneration
            # that runs past max_new_tokens with no closing brace) used to
            # skip retry entirely, on the theory that repeating "all 16
            # fields" would just reproduce the same failure. Proven wrong on
            # real eval runs: that degeneration is provoked by the full
            # page's own complexity/prompt, and the completion retry isn't
            # the same task — it's a much narrower prompt on a 384-token
            # budget (vs 1024), and the tile fallback below crops to a small
            # region — both meaningfully smaller asks with real room to
            # succeed where the whole-page pass looped instead of answering.
            if blank:
                print(f"First pass left {blank} blank ({omitted} of those never mentioned at all) — retrying once for just those fields.")
                completion = self._generate_json(image, _build_completion_prompt(blank), max_new_tokens=384)
                for field in blank:
                    if field in completion and _has_content(completion[field]):
                        label_data[field] = completion[field]
                    else:
                        label_data[field] = None

                # The retry above still shows the model the ENTIRE page — the
                # same busy multi-panel sheet the first pass had, just with a
                # shorter question. Confirmed directly that fields can stay
                # blank through that retry for a different reason than the
                # omission above: the field's own text block is competing
                # for attention with the rest of a large, busy sheet (a front
                # panel, both circular caps, a full nutrition table). Cropping
                # just that one block out of the page and asking ONLY about
                # the crop correctly recovered every field that stayed blank
                # through the whole-page retry, an explicit "look after the
                # words 'Marketed by:'" anchor, AND doubling the whole page's
                # resolution — none of which remove that competition the way
                # an isolated crop does. Production doesn't know in advance
                # where on an arbitrary label's layout the block sits, so the
                # tile grid stands in for that manual crop, stopping the
                # moment every requested field has a real answer.
                still_missing = [
                    field for field in blank
                    if field not in _TILE_INELIGIBLE_FIELDS and not _has_content(label_data.get(field))
                ]
                if still_missing:
                    print(f"Still blank after the whole-page retry: {still_missing} — trying isolated tiles.")
                    for tile in _tile_image(image):
                        if not still_missing:
                            break
                        tile_result = self._generate_json(tile, _build_completion_prompt(still_missing), max_new_tokens=384)
                        for field in list(still_missing):
                            value = tile_result.get(field)
                            if _has_content(value):
                                label_data[field] = value
                                still_missing.remove(field)

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

        # A blank string, or a shell of blank sub-fields (address structured
        # as {"city": "", "state": "", "country": ""} rather than a plain
        # string), is the same "nothing found" answer as an explicit null —
        # observed concretely from BOTH the main pass and a completion/tile
        # retry, not only the latter. Applied here to every field, once,
        # rather than duplicated at each place a value gets set, so a hollow
        # value from the very first pass gets exactly the same treatment as
        # one from a retry, before any of it can reach the schema's own
        # dict-to-string coercion (_as_scalar in schemas/label.py) — which
        # would otherwise turn that address shell into the literal string
        # "city: , state: , country: ": a value that reads as answered but
        # says nothing.
        for key in LABEL_FIELDS:
            if not _has_content(label_data.get(key)):
                label_data[key] = None

        # A marketing/manufacturing company name that exactly matches the
        # brand or product name is the same confusion observed directly in
        # testing (a completion/tile answer reporting the brand wordmark or
        # logo text — "Homeo-Vita" — as if it were manufacturing_company,
        # the field's own dedicated block never actually visible in that
        # crop). The company recovery mechanisms above are the ones known to
        # reach this specific confusion, but the check is applied to every
        # extraction, the same way _validate_logo's equivalent check below
        # is not limited to values that came from a retry.
        brand_or_product_values = {
            str(label_data.get(key)).strip().lower()
            for key in ("brand_name", "product_name")
            if label_data.get(key)
        }
        for company_field in ("marketing_company", "manufacturing_company"):
            value = label_data.get(company_field)
            if value and str(value).strip().lower() in brand_or_product_values:
                label_data[company_field] = None

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
