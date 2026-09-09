"""
Step 2 of the fine-tuning data pipeline: run the CURRENT (not-yet-fine-tuned)
model over every page image from prepare_dataset.py and save its raw guess
as a draft annotation for a human to correct.

This deliberately reuses app.services.extraction.ExtractionService as-is —
same prompt, same field validators — so the draft is exactly what
production would have extracted, and the corrections a reviewer makes are
exactly the deltas fine-tuning needs to close.

Resumable: a page whose annotation file already exists is skipped, so a
crashed or interrupted run can just be restarted.

Run from the ai_backend directory (needs the CUDA GPU — see
_resolve_inference_device in extraction.py for the ALLOW_CPU_INFERENCE
escape hatch):
    python finetune/generate_drafts.py
"""
import json
from pathlib import Path

from PIL import Image

from app.services.extraction import ExtractionService

IMAGES_DIR = Path(__file__).resolve().parent / "images"
ANNOTATIONS_DIR = Path(__file__).resolve().parent / "annotations"


def main() -> None:
    manifest_path = IMAGES_DIR / "_manifest.tsv"
    if not manifest_path.is_file():
        raise SystemExit(f"{manifest_path} not found — run prepare_dataset.py first")

    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)

    rows = manifest_path.read_text(encoding="utf-8").splitlines()[1:]
    service = ExtractionService(use_mock=False)

    done = 0
    skipped = 0
    for row in rows:
        image_file, source_file, page = row.split("\t")
        slug = Path(image_file).stem
        out_path = ANNOTATIONS_DIR / f"{slug}.json"

        if out_path.exists():
            skipped += 1
            continue

        image = Image.open(IMAGES_DIR / image_file).convert("RGB")
        print(f"Extracting {image_file} ...", flush=True)
        extracted = service.extract_from_image(image)

        record = {
            "image_file": image_file,
            "source_file": source_file,
            "page": int(page),
            "reviewed": False,
            "label": extracted.model_dump(),
        }
        out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        done += 1
        print(f"  -> {out_path.name}")

    print(f"\n{done} draft annotations written, {skipped} already existed and were skipped.")
    print(f"Annotations: {ANNOTATIONS_DIR}")


if __name__ == "__main__":
    main()
