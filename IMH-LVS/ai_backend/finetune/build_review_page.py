"""
Makes sure every manifest page has both a small thumbnail (review_images/,
for the grid) and a much sharper full-resolution JPEG (review_fullres/, for
the zoom view) — generating whichever is missing from the source PNG in
images/. Both are served as plain static files by review_server.py; neither
is uploaded anywhere. Real label images and the review page they're shown on
stay entirely on this machine (see review_server.py's own docstring for why
that matters here) — this script never sends a network request.

Usually you don't need to run this directly: review_server.py calls
ensure_review_images() itself on startup. Run this on its own only to
pre-generate images without starting the server.

Run from the ai_backend directory:
    python finetune/build_review_page.py
"""
from collections import Counter
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / "images" / "_manifest.tsv"
SOURCE_IMAGES = BASE / "images"
REVIEW_IMAGES = BASE / "review_images"
REVIEW_FULLRES = BASE / "review_fullres"

# Matches the width every existing review_images/*.jpg thumbnail was already
# generated at — new thumbnails need to look consistent with those, not
# introduce a second size in the same grid.
THUMB_WIDTH = 900
THUMB_QUALITY = 82

# Long enough that small print (an FSSAI number, a nutrition-table row) is
# actually legible when a reviewer zooms in.
FULLRES_MAX_DIM = 2400
FULLRES_QUALITY = 80


def load_manifest_rows():
    rows = MANIFEST.read_text(encoding="utf-8").splitlines()[1:]
    parsed = []
    for row in rows:
        image_file, source_file, page = row.split("\t")
        parsed.append((Path(image_file).stem, source_file, int(page)))
    return parsed


def _ensure_resized(source_png: Path, dest_jpg: Path, *, max_width: int = None, max_dim: int = None, quality: int) -> None:
    if dest_jpg.exists():
        return
    dest_jpg.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(source_png).convert("RGB")
    w, h = image.size
    if max_width is not None:
        scale = min(1.0, max_width / w)
    else:
        scale = min(1.0, max_dim / max(w, h))
    if scale < 1.0:
        image = image.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    image.save(dest_jpg, format="JPEG", quality=quality, optimize=True)


def ensure_review_images(manifest_rows=None) -> tuple[int, int]:
    """Generates any missing thumbnail/full-res file for every manifest
    page. Returns (thumbnails_written, fullres_written). Safe to call every
    time the server starts — existing files are left alone (see
    _ensure_resized), so this is fast after the first run."""
    if manifest_rows is None:
        manifest_rows = load_manifest_rows()

    thumbs_written = 0
    fullres_written = 0
    for slug, _source_file, _page in manifest_rows:
        source_png = SOURCE_IMAGES / f"{slug}.png"
        thumb_path = REVIEW_IMAGES / f"{slug}.jpg"
        fullres_path = REVIEW_FULLRES / f"{slug}.jpg"

        if not thumb_path.exists():
            _ensure_resized(source_png, thumb_path, max_width=THUMB_WIDTH, quality=THUMB_QUALITY)
            thumbs_written += 1
        if not fullres_path.exists():
            _ensure_resized(source_png, fullres_path, max_dim=FULLRES_MAX_DIM, quality=FULLRES_QUALITY)
            fullres_written += 1

    return thumbs_written, fullres_written


def main() -> None:
    manifest_rows = load_manifest_rows()
    thumbs_written, fullres_written = ensure_review_images(manifest_rows)
    fullres_total_mb = sum(f.stat().st_size for f in REVIEW_FULLRES.glob("*.jpg")) / 1024 / 1024
    print(f"{len(manifest_rows)} manifest pages")
    print(f"  {thumbs_written} new thumbnail(s), {fullres_written} new full-res image(s) generated")
    print(f"  {REVIEW_FULLRES} now holds {len(list(REVIEW_FULLRES.glob('*.jpg')))} files, {fullres_total_mb:.1f} MB total")
    print("Run `python finetune/review_server.py` to review these locally.")


if __name__ == "__main__":
    main()
