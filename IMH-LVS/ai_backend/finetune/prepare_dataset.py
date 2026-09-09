"""
Step 1 of the fine-tuning data pipeline: turn Final_dataset's raw label
files (PDFs and images) into one page-level PNG per printed face.

A single PDF here is often a multi-page scan of ONE physical label with a
front face (brand/product/colour/claims/logo) on page 1 and a back face
(nutrition table/ingredients/FSSAI/address) on later pages — confirmed via
`pdfinfo` against this dataset (several files are 2-3 pages). The
production extraction prompt already treats one call as "extract only
what's visible on THIS image, null everything else" (see
app/services/extraction.py's prompt), so each page becomes its own
training example rather than trying to merge pages into one target — that
matches the contract the model is actually asked to fulfil at inference
time and requires no change to the single-image extraction path.

Run from the ai_backend directory:
    python finetune/prepare_dataset.py
"""
import re
from pathlib import Path

from pdf2image import convert_from_path
from PIL import Image

SOURCE_DIR = Path(__file__).resolve().parent.parent.parent / "Final_dataset"
OUTPUT_DIR = Path(__file__).resolve().parent / "images"


def slugify(stem: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    return slug.lower()


def main() -> None:
    if not SOURCE_DIR.is_dir():
        raise SystemExit(f"Final_dataset not found at {SOURCE_DIR}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_lines = []
    source_files = sorted(
        p for p in SOURCE_DIR.iterdir()
        if p.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png")
    )

    for source in source_files:
        slug = slugify(source.stem)

        if source.suffix.lower() == ".pdf":
            pages = convert_from_path(str(source), dpi=200)
        else:
            pages = [Image.open(source).convert("RGB")]

        for page_number, page_image in enumerate(pages, start=1):
            out_name = f"{slug}_p{page_number}.png"
            out_path = OUTPUT_DIR / out_name
            page_image.save(out_path, "PNG")
            manifest_lines.append(f"{out_name}\t{source.name}\t{page_number}")
            print(f"  wrote {out_name}  (from {source.name}, page {page_number}/{len(pages)})")

    manifest_path = OUTPUT_DIR / "_manifest.tsv"
    manifest_path.write_text(
        "image_file\tsource_file\tpage\n" + "\n".join(manifest_lines) + "\n",
        encoding="utf-8",
    )
    print(f"\n{len(manifest_lines)} page images written to {OUTPUT_DIR}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
