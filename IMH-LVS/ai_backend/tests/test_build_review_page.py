# Unit tests for finetune/build_review_page.py's image-resizing helper.
# Run from ai_backend/: `python -m pytest tests/test_build_review_page.py`
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "finetune"))

from PIL import Image

from build_review_page import _ensure_resized


def _make_png(path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, "white").save(path, format="PNG")


class TestEnsureResized:
    def test_max_width_scales_down_preserving_aspect_ratio(self, tmp_path):
        source = tmp_path / "src.png"
        _make_png(source, (4000, 2000))
        dest = tmp_path / "out.jpg"

        _ensure_resized(source, dest, max_width=900, quality=80)

        with Image.open(dest) as out:
            assert out.size == (900, 450)

    def test_max_dim_scales_down_the_longer_edge(self, tmp_path):
        source = tmp_path / "src.png"
        _make_png(source, (2000, 4000))  # taller than wide
        dest = tmp_path / "out.jpg"

        _ensure_resized(source, dest, max_dim=2400, quality=80)

        with Image.open(dest) as out:
            assert out.size == (1200, 2400)

    def test_a_source_already_smaller_than_the_target_is_not_upscaled(self, tmp_path):
        source = tmp_path / "src.png"
        _make_png(source, (400, 300))
        dest = tmp_path / "out.jpg"

        _ensure_resized(source, dest, max_width=900, quality=80)

        with Image.open(dest) as out:
            assert out.size == (400, 300)

    def test_an_existing_destination_is_left_alone_not_regenerated(self, tmp_path):
        source = tmp_path / "src.png"
        _make_png(source, (4000, 2000))
        dest = tmp_path / "out.jpg"
        dest.write_bytes(b"already here")

        _ensure_resized(source, dest, max_width=900, quality=80)

        assert dest.read_bytes() == b"already here"
