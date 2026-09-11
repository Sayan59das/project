# Unit + smoke tests for finetune/review_server.py, the fully-local review
# tool that replaced the Claude-Artifact-hosted version — real label images
# and extracted field data must never leave this machine, so the most
# important property here is that the server only ever binds to 127.0.0.1.
#
# Run from ai_backend/: `python -m pytest tests/test_review_server.py`
import http.client
import json
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "finetune"))

import pytest

from review_server import (
    HOST,
    ReviewRequestHandler,
    build_annotation_document,
    build_pages_response,
)


class TestBuildAnnotationDocument:
    def test_marking_reviewed_stamps_a_real_millisecond_timestamp(self):
        doc = build_annotation_document(
            existing=None, slug="s1", source_file="s1.pdf", page=1,
            body={"label": {"brand_name": "X"}, "isFront": True, "reviewed": True},
            clock=lambda: 1234567890,
        )
        assert doc["reviewedAt"] == 1234567890
        assert doc["reviewed"] is True

    def test_marking_unreviewed_clears_the_timestamp(self):
        doc = build_annotation_document(
            existing={"reviewed": True, "reviewedAt": 999}, slug="s1", source_file="s1.pdf", page=1,
            body={"label": {}, "isFront": False, "reviewed": False},
            clock=lambda: 1234567890,
        )
        assert doc["reviewed"] is False
        assert doc["reviewedAt"] is None

    def test_carries_the_is_front_flag_through(self):
        doc = build_annotation_document(
            existing=None, slug="s1", source_file="s1.pdf", page=2,
            body={"label": {}, "isFront": True, "reviewed": False},
            clock=lambda: 1,
        )
        assert doc["isFront"] is True

    def test_writes_the_same_shape_the_repo_s_existing_annotation_files_use(self):
        doc = build_annotation_document(
            existing=None, slug="my_slug_p1", source_file="My Label.pdf", page=1,
            body={"label": {"brand_name": "X"}, "isFront": True, "reviewed": True},
            clock=lambda: 42,
        )
        assert doc == {
            "image_file": "my_slug_p1.png",
            "sourceFile": "My Label.pdf",
            "page": 1,
            "reviewed": True,
            "reviewedAt": 42,
            "isFront": True,
            "label": {"brand_name": "X"},
        }


class TestBuildPagesResponse:
    def test_a_page_with_no_saved_annotation_gets_a_null_doc(self, tmp_path):
        pages = build_pages_response([("s1", "s1.pdf", 1)], annotations_dir=tmp_path)
        assert pages == [{"slug": "s1", "sourceFile": "s1.pdf", "page": 1, "pageCount": 1, "doc": None}]

    def test_an_existing_annotation_file_is_attached_as_doc(self, tmp_path):
        (tmp_path / "s1.json").write_text(json.dumps({"reviewed": True, "label": {}}), encoding="utf-8")
        pages = build_pages_response([("s1", "s1.pdf", 1)], annotations_dir=tmp_path)
        assert pages[0]["doc"] == {"reviewed": True, "label": {}}

    def test_page_count_is_shared_across_pages_of_the_same_source_file(self, tmp_path):
        rows = [("s1", "multi.pdf", 1), ("s2", "multi.pdf", 2), ("s3", "other.pdf", 1)]
        pages = build_pages_response(rows, annotations_dir=tmp_path)
        assert [p["pageCount"] for p in pages] == [2, 2, 1]


class TestServerOnlyBindsToLocalhost:
    def test_server_address_is_127_0_0_1_never_a_network_interface(self):
        # The whole point of moving off the hosted artifact was that real
        # label data must never leave this machine. Binding to "" or
        # "0.0.0.0" would make this server reachable from other devices on
        # the network -- this pins the constant so that can't regress
        # silently.
        assert HOST == "127.0.0.1"


class TestReviewApiRoundTrip:
    """A real server on an ephemeral localhost port, exercised end to end."""

    @pytest.fixture
    def server(self, tmp_path, monkeypatch):
        import review_server

        annotations_dir = tmp_path / "annotations"
        annotations_dir.mkdir()
        monkeypatch.setattr(review_server, "ANNOTATIONS", annotations_dir)
        manifest_rows = [("s1", "s1.pdf", 1)]
        monkeypatch.setattr(review_server, "load_manifest_rows", lambda: manifest_rows)

        from http.server import ThreadingHTTPServer
        httpd = ThreadingHTTPServer((HOST, 0), ReviewRequestHandler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield port
        finally:
            httpd.shutdown()
            thread.join(timeout=5)

    def test_get_pages_then_put_a_review_then_see_it_reflected(self, server):
        port = server
        conn = http.client.HTTPConnection(HOST, port, timeout=5)

        conn.request("GET", "/api/pages")
        resp = conn.getresponse()
        assert resp.status == 200
        pages = json.loads(resp.read())
        assert pages == [{"slug": "s1", "sourceFile": "s1.pdf", "page": 1, "pageCount": 1, "doc": None}]

        body = json.dumps({"label": {"brand_name": "Y"}, "isFront": True, "reviewed": True})
        conn.request("PUT", "/api/pages/s1", body=body)
        put_resp = conn.getresponse()
        assert put_resp.status == 200
        put_resp.read()

        conn.request("GET", "/api/pages")
        resp2 = conn.getresponse()
        pages2 = json.loads(resp2.read())
        assert pages2[0]["doc"]["label"] == {"brand_name": "Y"}
        assert pages2[0]["doc"]["isFront"] is True
        assert pages2[0]["doc"]["reviewed"] is True
        conn.close()

    def test_an_unsafe_slug_is_rejected_rather_than_touching_the_filesystem(self, server):
        port = server
        conn = http.client.HTTPConnection(HOST, port, timeout=5)
        conn.request("PUT", "/api/pages/..%2f..%2fetc%2fpasswd", body="{}")
        resp = conn.getresponse()
        assert resp.status == 400
        conn.close()
