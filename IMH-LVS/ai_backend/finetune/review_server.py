"""
Local-only review server for label extraction ground truth.

Replaces the earlier version of this tool, which was a page published to
Claude's hosted Artifact service. That meant every real label image (and
every field a reviewer typed) was uploaded to a server this project does not
control — which breaks this project's own rule that client label artwork
must never leave this machine. This version serves the exact same review UI
and saves to the exact same files, but entirely over 127.0.0.1: nothing this
process does ever reaches past this machine's own network loopback. HOST is
pinned to "127.0.0.1", never "" or "0.0.0.0", specifically so this can't
regress into being reachable from other devices — see
TestServerOnlyBindsToLocalhost in tests/test_review_server.py.

Reads and writes directly to ai_backend/finetune/reviewed/annotations/, the
same files evaluate_adapter.py and the training pipeline already read as
ground truth — there is no separate export step. Opening a page whose slug
already has a file there pre-fills the form with its existing label/isFront
values; "Save & Mark Reviewed" overwrites that file in place with a real
reviewedAt timestamp (milliseconds since epoch, not the placeholder `1`
older annotation files were seeded with).

Run from ai_backend/: `python finetune/review_server.py`
Then open http://127.0.0.1:8850/ in a browser.
"""
import json
import mimetypes
import re
import sys
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_review_page import ensure_review_images  # noqa: E402

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / "images" / "_manifest.tsv"
REVIEW_IMAGES = BASE / "review_images"
REVIEW_FULLRES = BASE / "review_fullres"
ANNOTATIONS = BASE / "reviewed" / "annotations"
TEMPLATE = BASE / "review_page_template.html"

HOST = "127.0.0.1"
PORT = 8850

SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def load_manifest_rows():
    rows = MANIFEST.read_text(encoding="utf-8").splitlines()[1:]
    parsed = []
    for row in rows:
        image_file, source_file, page = row.split("\t")
        parsed.append((Path(image_file).stem, source_file, int(page)))
    return parsed


def read_annotation(slug, annotations_dir=None):
    # annotations_dir defaults to the CURRENT value of the module-level
    # ANNOTATIONS at call time (not a `=ANNOTATIONS` default, which Python
    # would bind once at import time and never see a later reassignment of
    # ANNOTATIONS again — the exact case tests monkeypatch it for).
    path = (annotations_dir or ANNOTATIONS) / f"{slug}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build_pages_response(manifest_rows, annotations_dir=None):
    annotations_dir = annotations_dir or ANNOTATIONS
    page_counts = Counter(source_file for _, source_file, _ in manifest_rows)
    return [
        {
            "slug": slug,
            "sourceFile": source_file,
            "page": page,
            "pageCount": page_counts[source_file],
            "doc": read_annotation(slug, annotations_dir),
        }
        for slug, source_file, page in manifest_rows
    ]


def build_annotation_document(existing, slug, source_file, page, body, clock=lambda: int(time.time() * 1000)):
    """existing: the current on-disk document for this slug, or None (kept
    as a parameter, not read internally, so this stays a pure function to
    test). body: the parsed PUT request JSON: {label, isFront, reviewed}."""
    reviewed = bool(body.get("reviewed"))
    return {
        "image_file": f"{slug}.png",
        "sourceFile": source_file,
        "page": page,
        "reviewed": reviewed,
        "reviewedAt": clock() if reviewed else None,
        "isFront": bool(body.get("isFront")),
        "label": body.get("label") or {},
    }


class ReviewRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        pass  # keep the terminal quiet; nothing here needs an access log

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path):
        if not path.is_file():
            self.send_response(404)
            self.end_headers()
            return
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            self._file(TEMPLATE)
            return
        if path == "/api/pages":
            self._json(200, build_pages_response(load_manifest_rows()))
            return
        m = re.fullmatch(r"/images/(thumb|fullres)/([^/]+)\.jpg", path)
        if m:
            kind, slug = m.group(1), unquote(m.group(2))
            if not SLUG_RE.match(slug):
                self.send_response(400)
                self.end_headers()
                return
            folder = REVIEW_IMAGES if kind == "thumb" else REVIEW_FULLRES
            self._file(folder / f"{slug}.jpg")
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        parsed = urlparse(self.path)
        m = re.fullmatch(r"/api/pages/([^/]+)", parsed.path)
        if not m:
            self.send_response(404)
            self.end_headers()
            return
        slug = unquote(m.group(1))
        if not SLUG_RE.match(slug):
            self.send_response(400)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        rows = {row[0]: row for row in load_manifest_rows()}
        if slug not in rows:
            self.send_response(404)
            self.end_headers()
            return
        _, source_file, page = rows[slug]

        existing = read_annotation(slug)
        doc = build_annotation_document(existing, slug, source_file, page, body)
        ANNOTATIONS.mkdir(parents=True, exist_ok=True)
        (ANNOTATIONS / f"{slug}.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
        self._json(200, doc)


def main() -> None:
    thumbs, fullres = ensure_review_images()
    if thumbs or fullres:
        print(f"Prepared images: {thumbs} new thumbnail(s), {fullres} new full-res image(s).")

    httpd = ThreadingHTTPServer((HOST, PORT), ReviewRequestHandler)
    print(f"Review server running at http://{HOST}:{PORT}/ (localhost only — not reachable from other devices)")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
