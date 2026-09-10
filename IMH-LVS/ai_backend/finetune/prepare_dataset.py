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
import hashlib
import re
from pathlib import Path

from pdf2image import convert_from_path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
# Every folder of raw label files the company has supplied, oldest first.
# Adding a batch is adding a line here — the rest of the pipeline keys off
# the manifest this writes, not off any one folder name.
SOURCE_DIRS = [REPO_ROOT / "Final_dataset", REPO_ROOT / "New Data"]
OUTPUT_DIR = Path(__file__).resolve().parent / "images"


def slugify(stem: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    return slug.lower()


def file_digest(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def main() -> None:
    present = [d for d in SOURCE_DIRS if d.is_dir()]
    if not present:
        raise SystemExit(f"No source folder found. Looked for: {[str(d) for d in SOURCE_DIRS]}")
    for missing in [d for d in SOURCE_DIRS if not d.is_dir()]:
        print(f"  note: {missing.name} not present, skipping")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_lines = []
    source_files = []
    for source_dir in present:
        source_files.extend(sorted(
            p for p in source_dir.iterdir()
            if p.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png")
        ))

    # Byte-identical files supplied twice under different names are one
    # label, not two. Confirmed real in this data: "INMUNOGUM X 4.pdf" and
    # "Immunogum 4S IRN131-1.pdf" share an MD5. Rasterising both would
    # double-weight that page in training and, worse, could put one copy in
    # train and its twin in validation — leakage that reads as a good score.
    seen_digests: dict[str, Path] = {}

    for source in source_files:
        digest = file_digest(source)
        if digest in seen_digests:
            print(f"  skipping {source.name} — byte-identical to {seen_digests[digest].name}")
            continue
        seen_digests[digest] = source

        slug = slugify(source.stem)

        if source.suffix.lower() == ".pdf":
            pages = convert_from_path(str(source), dpi=200)
        else:
            pages = [Image.open(source).convert("RGB")]

        for page_number, page_image in enumerate(pages, start=1):
            out_name = f"{slug}_p{page_number}.png"
            out_path = OUTPUT_DIR / out_name
            # Drop any embedded ICC profile before saving. A camera/press JPEG
            # (confirmed on a real supplied file, a CMYK photo) can carry a
            # profile large enough that Pillow's own PNG reader later refuses
            # to load the file it just wrote ("Decompressed data too large for
            # PngImagePlugin.MAX_TEXT_CHUNK") — a silent pipeline-killer three
            # steps downstream (draft generation, training) that only shows up
            # when this exact file is reached. This pipeline only needs raw
            # RGB pixels for OCR/vision, never colour-managed output, so the
            # profile carries no value here.
            page_image.info.pop("icc_profile", None)
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
