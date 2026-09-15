# Unit tests for eval/diff.py — the tool that makes score.py's per-item
# detail actually readable: "what were the 42 wrong product names" instead
# of just "42 wrong". Step 1 of the accuracy-improvement plan; no
# extraction change is allowed until this exists and has been used.
#
# Run from ai_backend/: `python -m pytest tests/test_diff.py`
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "eval"))

import pytest

import diff as diff_module
from diff import format_row, load_details, main


# A fixture of 3 fake labels' worth of detail rows, spanning a scalar field
# (product_name: one correct, one wrong, one missing) and one row for a
# different field, to confirm --field actually filters.
FAKE_DETAILS = [
    {"source_file": "A.pdf", "field": "product_name", "item": None, "predicted": "Calcium Gummies", "expected": "Calcium Gummies", "verdict": "correct"},
    {"source_file": "B.pdf", "field": "product_name", "item": None, "predicted": "Vitamin Gummies", "expected": "Vitamin C Gummies", "verdict": "wrong"},
    {"source_file": "C.pdf", "field": "product_name", "item": None, "predicted": None, "expected": "Iron Gummies", "verdict": "missing"},
    {"source_file": "A.pdf", "field": "brand_name", "item": None, "predicted": "ChewNectar", "expected": "ChewNectar", "verdict": "correct"},
]


@pytest.fixture
def fake_run(tmp_path, monkeypatch):
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()
    (runs_dir / "pipeline.json").write_text(
        json.dumps({"mode": "pipeline", "summary": {}, "conflicts": [], "details": FAKE_DETAILS}),
        encoding="utf-8",
    )
    monkeypatch.setattr(diff_module, "RUNS_DIR", runs_dir)
    return runs_dir


class TestLoadDetails:
    def test_filters_to_just_the_requested_field(self, fake_run):
        rows = load_details("pipeline", "product_name")
        assert len(rows) == 3
        assert all(r["field"] == "product_name" for r in rows)

    def test_a_field_with_no_rows_returns_empty_not_an_error(self, fake_run):
        assert load_details("pipeline", "fssai_number") == []

    def test_missing_run_file_is_a_clear_error_not_a_traceback(self, tmp_path, monkeypatch):
        monkeypatch.setattr(diff_module, "RUNS_DIR", tmp_path / "nonexistent")
        with pytest.raises(SystemExit) as exc_info:
            load_details("pipeline", "product_name")
        assert "score.py" in str(exc_info.value)

    def test_a_run_from_before_details_existed_is_a_clear_error(self, tmp_path, monkeypatch):
        runs_dir = tmp_path / "runs"
        runs_dir.mkdir()
        (runs_dir / "pipeline.json").write_text(
            json.dumps({"mode": "pipeline", "summary": {}, "conflicts": []}), encoding="utf-8"
        )
        monkeypatch.setattr(diff_module, "RUNS_DIR", runs_dir)
        with pytest.raises(SystemExit) as exc_info:
            load_details("pipeline", "product_name")
        assert "re-run" in str(exc_info.value).lower()


class TestFormatRow:
    def test_shows_both_values_for_a_wrong_verdict(self):
        row = {"source_file": "B.pdf", "predicted": "Vitamin Gummies", "expected": "Vitamin C Gummies", "verdict": "wrong"}
        line = format_row(row)
        assert "B.pdf" in line
        assert "Vitamin Gummies" in line
        assert "Vitamin C Gummies" in line

    def test_a_missing_value_renders_as_an_em_dash_not_the_word_none(self):
        row = {"source_file": "C.pdf", "predicted": None, "expected": "Iron Gummies", "verdict": "missing"}
        line = format_row(row)
        assert "None" not in line
        assert "—" in line


class TestMainGroupsByVerdict:
    def test_prints_a_section_per_verdict_with_correct_counts(self, fake_run, capsys):
        main(["--mode", "pipeline", "--field", "product_name"])
        out = capsys.readouterr().out
        assert "WRONG (1)" in out
        assert "MISSING (1)" in out
        assert "CORRECT (1)" in out
        assert "B.pdf" in out
        assert "C.pdf" in out
        assert "A.pdf" in out

    def test_a_field_with_no_matching_rows_says_so_rather_than_printing_nothing(self, fake_run, capsys):
        main(["--mode", "pipeline", "--field", "fssai_number"])
        out = capsys.readouterr().out
        assert "fssai_number" in out
        assert "No rows" in out or "no rows" in out.lower()
