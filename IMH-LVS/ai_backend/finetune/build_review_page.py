"""
Splices the embedded page-image data into review_page_template.html and
writes the final, publishable review_page.html.

Images are static, review-only material (not the reviewable data itself),
so they're embedded directly as base64 JPEG data URIs — the artifact's `db`
capability (declared when this page is published) is reserved for the
actual field corrections a reviewer makes, which must NOT be hardcoded into
the page per that capability's own contract.

Run from the ai_backend directory:
    python finetune/build_review_page.py
"""
import base64
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / "images" / "_manifest.tsv"
REVIEW_IMAGES = BASE / "review_images"
TEMPLATE = BASE / "review_page_template.html"
OUTPUT = BASE / "review_page.html"


def main() -> None:
    rows = MANIFEST.read_text(encoding="utf-8").splitlines()[1:]
    parsed = []
    for row in rows:
        image_file, source_file, page = row.split("\t")
        parsed.append((Path(image_file).stem, source_file, int(page)))

    page_counts = Counter(source_file for _, source_file, _ in parsed)

    pages = []
    for slug, source_file, page in parsed:
        jpg_path = REVIEW_IMAGES / f"{slug}.jpg"
        data = jpg_path.read_bytes()
        data_uri = "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")
        pages.append({
            "slug": slug,
            "sourceFile": source_file,
            "page": page,
            "pageCount": page_counts[source_file],
            "image": data_uri,
        })

    pages_js = "const PAGES = " + json.dumps(pages, ensure_ascii=False) + ";"

    template = TEMPLATE.read_text(encoding="utf-8")
    output = template.replace("/*__PAGES_DATA__*/", pages_js)
    OUTPUT.write_text(output, encoding="utf-8")

    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"Wrote {OUTPUT} ({size_mb:.2f} MB, {len(pages)} pages)")


if __name__ == "__main__":
    main()
