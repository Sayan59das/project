"""
Step 3 of the fine-tuning pipeline: turn the human-verified annotations into
the (image, prompt, target JSON) triples the trainer consumes.

The prompt is IMPORTED from the production extraction service rather than
copied here — the adapter is trained to answer that exact wording, so a
divergent copy would silently cost accuracy at inference time.

Targets are serialised with the field order the prompt asks for, not
Python dict order, so the model learns one stable output shape instead of
having to infer which key comes next from 44 inconsistent examples.

Run from the ai_backend directory:
    python finetune/build_training_set.py
"""
import json
import random
from pathlib import Path

from app.services.extraction import EXTRACTION_PROMPT

BASE = Path(__file__).resolve().parent
REVIEWED = BASE / "reviewed" / "annotations"
IMAGES = BASE / "images"
OUT = BASE / "dataset"

# The order the prompt lists the fields in.
FIELD_ORDER = [
    "brand_name", "product_name", "colour_theme", "flavour", "claims", "logo",
    "layout", "nutrition_table", "fssai_number", "ingredients",
    "marketing_company", "address", "customer_care_number",
    "customer_care_email", "package_size", "manufacturing_company",
]

# Holding out whole SOURCE FILES, never individual pages: this dataset has
# near-duplicate pages (the same artwork re-exported as a colour proof, a
# die-line and a UV separation), so splitting per page would leak an almost
# identical image into validation and report a score the model didn't earn.
VALIDATION_SOURCE_FILES = {
    "Calrio IRN159-1.pdf",
    "HSN VF IRN75-1.pdf",
    "MHJ Lutein Domestic IRN165-1.pdf",
    "Sleeprio IRN157-1.pdf",
}


def canonical_target(label: dict) -> str:
    """The label as the model should emit it: prompt field order, empty
    strings normalised to null (the schema's own 'not present' value, so the
    model isn't taught two different ways to say 'absent'), and no ASCII
    escaping so Indian addresses and ° / ® characters train as themselves."""
    ordered = {}
    for key in FIELD_ORDER:
        value = label.get(key)
        if isinstance(value, str) and not value.strip():
            value = None
        if isinstance(value, (list, dict)) and len(value) == 0:
            value = None
        ordered[key] = value
    return json.dumps(ordered, ensure_ascii=False, indent=2)


def main() -> None:
    records = []
    for path in sorted(REVIEWED.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        data = doc.get("data", doc)
        if not data.get("reviewed"):
            print(f"  skipping {path.stem} — not marked reviewed")
            continue

        image_path = IMAGES / f"{path.stem}.png"
        if not image_path.is_file():
            raise SystemExit(f"No page image for {path.stem} at {image_path}")

        records.append({
            "slug": path.stem,
            "source_file": data["sourceFile"],
            "image": str(image_path),
            "prompt": EXTRACTION_PROMPT,
            "target": canonical_target(data["label"]),
        })

    train = [r for r in records if r["source_file"] not in VALIDATION_SOURCE_FILES]
    val = [r for r in records if r["source_file"] in VALIDATION_SOURCE_FILES]

    random.Random(0).shuffle(train)

    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train", train), ("val", val)):
        out_path = OUT / f"{name}.jsonl"
        with out_path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"{name}: {len(rows)} examples -> {out_path}")


if __name__ == "__main__":
    main()
