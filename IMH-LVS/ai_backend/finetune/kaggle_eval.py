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

Checkpoints after every page to CHECKPOINT_PATH and skips already-done
slugs on startup — both Colab and Kaggle's free sessions have been
observed disconnecting mid-run with no warning (once each, confirmed
live), and this 16-page run takes long enough (~10 min/page with the
retry/tile-fallback path) that losing all of it to one disconnect is a
real, not theoretical, cost. Safe to re-run this same command after any
interruption; it picks back up rather than starting over.

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
CHECKPOINT_PATH = BASE / "eval" / "kaggle_checkpoint.json"

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


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.is_file():
        return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
    return {}


def save_checkpoint(results: dict) -> None:
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")


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

    results = load_checkpoint()
    remaining = [row for row in rows if row["slug"] not in results]

    if not remaining:
        print("All pages already checkpointed — nothing left to run.")
    else:
        print(f"{len(results)} pages already checkpointed, {len(remaining)} left to run.")
        from app.services.extraction import ExtractionService
        service = ExtractionService(use_mock=False)

        for row in remaining:
            predicted = service.extract_from_image(Image.open(row["image"]).convert("RGB")).model_dump()
            results[row["slug"]] = predicted
            save_checkpoint(results)

            expected = json.loads(row["target"])
            page_credit = sum(score_field(f, predicted.get(f), expected.get(f))[0] for f in FIELDS)
            print(f"  {row['slug']}: {page_credit / len(FIELDS):.1%}", flush=True)

    # Final tally always recomputed from the full checkpoint (this run's new
    # pages plus whatever an earlier, interrupted run already saved), so the
    # summary is correct whether this run did 16 pages or just the last 1.
    per_field = {field: [0.0, 0.0] for field in FIELDS}
    blank_results = 0
    for row in rows:
        expected = json.loads(row["target"])
        predicted = results[row["slug"]]
        if all(predicted.get(field) in (None, [], {}) for field in FIELDS):
            blank_results += 1
        for field in FIELDS:
            credit, possible = score_field(field, predicted.get(field), expected.get(field))
            per_field[field][0] += credit
            per_field[field][1] += possible

    total_credit = sum(v[0] for v in per_field.values())
    total_possible = sum(v[1] for v in per_field.values())
    print(f"\ntuned (7B, Kaggle): overall {total_credit / total_possible:.1%} "
          f"across {len(rows)} pages, {blank_results} all-null results")
    print("\nPer field:")
    for field, (credit, possible) in per_field.items():
        print(f"  {field}: {credit / possible:.1%}" if possible else f"  {field}: n/a")


if __name__ == "__main__":
    main()
