"""
Standalone accuracy check for running on Kaggle instead of Colab, once
Colab's free GPU quota is exhausted. Skips prepare_dataset.py/
build_training_set.py entirely — those rasterize and split ALL 84 raw
label files, which would mean re-uploading the whole large "all labels"
zip again. Here we already know exactly which 16 pages are the
validation set (dataset/val.jsonl's own list, from the last real Colab
run), so this only needs those 16 page images (a small, separate zip)
plus the reviewed annotations already committed to this repo — both far
smaller than the full raw-file set.

Expects, run from ai_backend/:
    - finetune/images/<slug>.png for each of the 16 validation slugs
      below (extract val_images.zip there first)
    - finetune/reviewed/annotations/<slug>.json (already in the repo)

Run:
    PYTHONPATH=. python finetune/kaggle_eval.py
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent
IMAGES = BASE / "images"
ANNOTATIONS = BASE / "reviewed" / "annotations"

sys.path.insert(0, str(BASE))
from build_training_set import canonical_target  # noqa: E402
from evaluate_adapter import FIELDS, score_field  # noqa: E402

# The exact 16 validation slugs from the Colab run's dataset/val.jsonl —
# copied here, not re-derived, so this checks the SAME held-out pages
# that run's numbers refer to.
VAL_SLUGS = [
    "calrio_gummies_2_p1", "calrio_irn159_1_p1",
    "eye_wellness_domestic_label_mhj_p1", "eye_wellness_domestic_label_mhj_p2",
    "hsn_irn75_1_p1", "hsn_vf_irn75_1_p1", "hsn_vf_irn75_1_p2",
    "immunogum_4s_irn131_1_p1",
    "iron_irn121_1_p1", "iron_irn121_2_p1", "iron_irn121_3_p1", "iron_irn121_4_p1",
    "mhj_lutein_domestic_irn165_1_p1", "mhj_lutein_domestic_irn165_1_p2",
    "sleeprio_gummies_p1", "sleeprio_irn157_1_p1",
]


def main() -> None:
    # ExtractionService picks 4-bit vs. fp16 loading, and whether to attach
    # an adapter at all, from LABEL_LORA_ADAPTER specifically — not the
    # FINETUNE_ADAPTER_OUT this script (and train_lora.py) otherwise uses.
    # Missing this the first time meant the 7B base loaded in full fp16 with
    # no adapter, which alone is enough to exceed a 16GB GPU: real OOM
    # ("14.56 GiB... 14.81 MiB free") confirmed live on Kaggle before any
    # inference ran.
    adapter_out = os.environ.get("FINETUNE_ADAPTER_OUT", "")
    if adapter_out:
        os.environ["LABEL_LORA_ADAPTER"] = adapter_out

    from app.services.extraction import EXTRACTION_PROMPT, ExtractionService

    rows = []
    for slug in VAL_SLUGS:
        image_path = IMAGES / f"{slug}.png"
        annotation_path = ANNOTATIONS / f"{slug}.json"
        if not image_path.is_file():
            raise SystemExit(f"Missing validation image: {image_path}")
        if not annotation_path.is_file():
            raise SystemExit(f"Missing annotation: {annotation_path}")
        doc = json.loads(annotation_path.read_text(encoding="utf-8"))
        label = doc.get("data", doc)["label"]
        rows.append({"slug": slug, "image": str(image_path), "target": canonical_target(label)})

    service = ExtractionService(use_mock=False)
    per_field = {field: [0.0, 0.0] for field in FIELDS}
    blank_results = 0

    for row in rows:
        expected = json.loads(row["target"])
        predicted = service.extract_from_image(Image.open(row["image"]).convert("RGB")).model_dump()

        if all(predicted.get(field) in (None, [], {}) for field in FIELDS):
            blank_results += 1

        page_credit = 0.0
        for field in FIELDS:
            credit, possible = score_field(field, predicted.get(field), expected.get(field))
            per_field[field][0] += credit
            per_field[field][1] += possible
            page_credit += credit

        print(f"  {row['slug']}: {page_credit / len(FIELDS):.1%}", flush=True)

    total_credit = sum(v[0] for v in per_field.values())
    total_possible = sum(v[1] for v in per_field.values())
    print(f"\ntuned (7B, Kaggle): overall {total_credit / total_possible:.1%} "
          f"across {len(rows)} pages, {blank_results} all-null results")
    print("\nPer field:")
    for field, (credit, possible) in per_field.items():
        print(f"  {field}: {credit / possible:.1%}" if possible else f"  {field}: n/a")


if __name__ == "__main__":
    main()
