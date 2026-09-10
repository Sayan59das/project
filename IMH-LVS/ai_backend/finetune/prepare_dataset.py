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
# the manifest this writes, not off any one folder name. Final_dataset/ and
# New Data/ were consolidated into one "all labels" folder (84 files,
# including old, new, and byte-identical duplicates across the two original
# batches — file_digest()'s dedup below is what actually handles those, not
# this list).
SOURCE_DIRS = [REPO_ROOT / "all labels"]
OUTPUT_DIR = Path(__file__).resolve().parent / "images"


def slugify(stem: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    return slug.lower()


def file_digest(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


REVIEWED_ANNOTATIONS = Path(__file__).resolve().parent / "reviewed" / "annotations"


def has_reviewed_annotation(slug: str) -> bool:
    return any(REVIEWED_ANNOTATIONS.glob(f"{slug}_p*.json"))


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
    #
    # Which duplicate survives is chosen DELIBERATELY, not by whichever
    # happens to sort first: a reviewed annotation already references one
    # specific slug, and picking the other one silently orphans that real,
    # hand-verified ground truth. Confirmed to actually happen, not just
    # theoretical: consolidating what used to be two separate source folders
    # (each internally sorted) into one merged "all labels" folder reordered
    # this exact Immunogum pair and broke build_training_set.py's lookup.
    by_digest: dict[str, list[Path]] = {}
    for source in source_files:
        by_digest.setdefault(file_digest(source), []).append(source)

    resolved_files = []
    for digest, group in by_digest.items():
        if len(group) == 1:
            resolved_files.append(group[0])
            continue
        reviewed = [f for f in group if has_reviewed_annotation(slugify(f.stem))]
        winner = reviewed[0] if reviewed else sorted(group)[0]
        for loser in sorted(group):
            if loser != winner:
                reason = " (kept: has a reviewed annotation)" if reviewed else ""
                print(f"  skipping {loser.name} — byte-identical to {winner.name}{reason}")
        resolved_files.append(winner)

    for source in sorted(resolved_files):
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
