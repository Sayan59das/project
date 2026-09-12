# Unit tests for ai_backend/eval/score.py — the one honest, shared scorer
# every future accuracy number for this project must come from (see
# README.md's "Extraction rebuild plan"). Pure logic only; no model, no GPU.
#
# Run from ai_backend/: `python -m pytest tests/test_score.py`
import sys
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "eval"))

import json

import pytest

import score
from score import aggregate, load_ground_truth, merge_label_pages, normalize, score_field, write_results_md, run_textlayer_mode


class TestNormalize:
    def test_collapses_internal_whitespace_and_case(self):
        assert normalize("  Calcium   125mg  ") == "calcium 125mg"

    def test_empty_or_blank_string_becomes_none(self):
        assert normalize("") is None
        assert normalize("   ") is None

    def test_none_stays_none(self):
        assert normalize(None) is None

    def test_non_string_passes_through(self):
        assert normalize(5) == 5


class TestScoreFieldExact:
    def test_matching_values_are_correct(self):
        assert score_field("brand_name", "ChewNectar", "ChewNectar") == {"correct": 1, "wrong": 0, "missing": 0}

    def test_case_and_whitespace_differences_still_match(self):
        assert score_field("brand_name", "  chewnectar ", "ChewNectar") == {"correct": 1, "wrong": 0, "missing": 0}

    def test_different_values_are_wrong(self):
        assert score_field("brand_name", "Wrong Brand", "ChewNectar") == {"correct": 0, "wrong": 1, "missing": 0}

    def test_predicted_none_when_expected_has_a_value_is_missing(self):
        assert score_field("brand_name", None, "ChewNectar") == {"correct": 0, "wrong": 0, "missing": 1}

    def test_predicted_a_value_when_none_expected_is_wrong_not_correct(self):
        # Hallucinating a value the label doesn't have is a real mistake,
        # not a free pass just because nothing was "missing".
        assert score_field("brand_name", "Made Up", None) == {"correct": 0, "wrong": 1, "missing": 0}

    def test_both_none_is_correct(self):
        assert score_field("brand_name", None, None) == {"correct": 1, "wrong": 0, "missing": 0}


class TestScoreFieldFuzzyText:
    def test_a_shorter_but_contained_description_counts_as_correct(self):
        assert score_field("logo", "leaf icon", "a green leaf icon above the wordmark") == {"correct": 1, "wrong": 0, "missing": 0}

    def test_an_unrelated_description_is_wrong(self):
        assert score_field("logo", "blue star", "green leaf icon") == {"correct": 0, "wrong": 1, "missing": 0}


class TestScoreFieldList:
    def test_every_expected_item_found_is_all_correct(self):
        result = score_field("ingredients", ["Sugar", "Water"], ["Sugar", "Water"])
        assert result == {"correct": 2, "wrong": 0, "missing": 0}

    def test_a_missing_item_is_counted_missing_not_wrong(self):
        result = score_field("ingredients", ["Sugar"], ["Sugar", "Water"])
        assert result == {"correct": 1, "wrong": 0, "missing": 1}

    def test_a_hallucinated_extra_item_is_counted_wrong(self):
        result = score_field("ingredients", ["Sugar", "Water", "Made Up"], ["Sugar", "Water"])
        assert result == {"correct": 2, "wrong": 1, "missing": 0}

    def test_both_empty_is_trivially_correct(self):
        assert score_field("claims", None, None) == {"correct": 1, "wrong": 0, "missing": 0}

    def test_case_and_whitespace_insensitive_item_matching(self):
        result = score_field("ingredients", ["  sugar ", "WATER"], ["Sugar", "Water"])
        assert result == {"correct": 2, "wrong": 0, "missing": 0}


class TestScoreFieldNutritionTable:
    def test_matching_row_is_correct(self):
        result = score_field("nutrition_table", {"Calories": "12 kcal"}, {"Calories": "12 kcal"})
        assert result == {"correct": 1, "wrong": 0, "missing": 0}

    def test_present_key_with_a_wrong_amount_is_wrong_not_missing(self):
        result = score_field("nutrition_table", {"Calories": "99 kcal"}, {"Calories": "12 kcal"})
        assert result == {"correct": 0, "wrong": 1, "missing": 0}

    def test_a_row_never_returned_is_missing(self):
        result = score_field("nutrition_table", {}, {"Calories": "12 kcal"})
        assert result == {"correct": 0, "wrong": 0, "missing": 1}

    def test_a_hallucinated_extra_row_is_wrong(self):
        result = score_field("nutrition_table", {"Calories": "12 kcal", "Fake Row": "5 mg"}, {"Calories": "12 kcal"})
        assert result == {"correct": 1, "wrong": 1, "missing": 0}


class TestMergeLabelPages:
    def test_fields_from_different_pages_combine_into_one_label(self):
        front = {"brand_name": "ChewNectar", "nutrition_table": None}
        back = {"brand_name": None, "nutrition_table": {"Calories": "12 kcal"}}
        merged, conflicts = merge_label_pages([front, back])
        assert merged["brand_name"] == "ChewNectar"
        assert merged["nutrition_table"] == {"Calories": "12 kcal"}
        assert conflicts == []

    def test_a_single_page_label_passes_through_unchanged(self):
        page = {"brand_name": "X", "product_name": "Y"}
        merged, conflicts = merge_label_pages([page])
        assert merged["brand_name"] == "X"
        assert conflicts == []

    def test_conflicting_values_across_pages_keep_the_first_and_report_the_conflict(self):
        # A real case found in this project's own data: a label's front and
        # back panels print two different pack counts. Never silently pick
        # one and hide that the source data disagrees with itself.
        p1 = {"package_size": "10 Gummies"}
        p2 = {"package_size": "30 Gummies"}
        merged, conflicts = merge_label_pages([p1, p2])
        assert merged["package_size"] == "10 Gummies"
        assert conflicts == [("package_size", ["10 Gummies", "30 Gummies"])]

    def test_list_fields_are_unioned_across_pages_not_treated_as_a_conflict(self):
        # Real data: a front panel often shows a few claims and the back
        # panel shows different (not contradictory) ones — the true set of
        # claims for the whole label is everything printed anywhere on it,
        # not just whichever page came first.
        p1 = {"claims": ["Gluten Free", "Great Taste"]}
        p2 = {"claims": ["Cruelty Free"]}
        merged, conflicts = merge_label_pages([p1, p2])
        assert merged["claims"] == ["Gluten Free", "Great Taste", "Cruelty Free"]
        assert conflicts == []

    def test_a_list_item_repeated_on_two_pages_is_not_duplicated(self):
        p1 = {"claims": ["Gluten Free"]}
        p2 = {"claims": ["Gluten Free", "Cruelty Free"]}
        merged, _conflicts = merge_label_pages([p1, p2])
        assert merged["claims"] == ["Gluten Free", "Cruelty Free"]

    def test_nutrition_table_rows_are_unioned_across_pages(self):
        p1 = {"nutrition_table": {"Calories": "12 kcal"}}
        p2 = {"nutrition_table": {"Sodium": "4 mg"}}
        merged, conflicts = merge_label_pages([p1, p2])
        assert merged["nutrition_table"] == {"Calories": "12 kcal", "Sodium": "4 mg"}
        assert conflicts == []

    def test_a_genuinely_conflicting_nutrition_row_is_reported(self):
        p1 = {"nutrition_table": {"Calories": "12 kcal"}}
        p2 = {"nutrition_table": {"Calories": "99 kcal"}}
        merged, conflicts = merge_label_pages([p1, p2])
        assert merged["nutrition_table"] == {"Calories": "12 kcal"}
        assert conflicts == [("nutrition_table.Calories", ["12 kcal", "99 kcal"])]


class TestAggregate:
    def test_sums_correct_wrong_missing_across_records_and_computes_percentages(self):
        records = [
            {"brand_name": {"correct": 1, "wrong": 0, "missing": 0}},
            {"brand_name": {"correct": 0, "wrong": 1, "missing": 0}},
        ]
        summary = aggregate(records)
        assert summary["per_field"]["brand_name"] == {"correct": 1, "wrong": 1, "missing": 0, "total": 2}
        assert summary["overall"]["correct"] == 1
        assert summary["overall"]["total"] == 2
        assert summary["overall"]["accuracy"] == 0.5

    def test_empty_records_gives_zero_accuracy_not_a_crash(self):
        summary = aggregate([])
        assert summary["overall"]["total"] == 0
        assert summary["overall"]["accuracy"] == 0.0


class TestLoadGroundTruth:
    def _write(self, dir_path, filename, doc):
        (dir_path / filename).write_text(json.dumps(doc), encoding="utf-8")

    def test_groups_and_merges_pages_by_source_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr(score, "ANNOTATIONS_DIR", tmp_path)
        self._write(tmp_path, "a_p1.json", {
            "image_file": "a_p1.png", "sourceFile": "A.pdf", "page": 1,
            "label": {"brand_name": "X", "nutrition_table": None},
        })
        self._write(tmp_path, "a_p2.json", {
            "image_file": "a_p2.png", "sourceFile": "A.pdf", "page": 2,
            "label": {"brand_name": None, "nutrition_table": {"Calories": "1 kcal"}},
        })

        grouped = load_ground_truth()

        assert set(grouped.keys()) == {"A.pdf"}
        merged, pages, conflicts = grouped["A.pdf"]
        assert merged["brand_name"] == "X"
        assert merged["nutrition_table"] == {"Calories": "1 kcal"}
        assert pages == [("a_p1", 1), ("a_p2", 2)]
        assert conflicts == []

    def test_two_different_source_files_stay_separate(self, tmp_path, monkeypatch):
        monkeypatch.setattr(score, "ANNOTATIONS_DIR", tmp_path)
        self._write(tmp_path, "a_p1.json", {"image_file": "a_p1.png", "sourceFile": "A.pdf", "page": 1, "label": {"brand_name": "X"}})
        self._write(tmp_path, "b_p1.json", {"image_file": "b_p1.png", "sourceFile": "B.pdf", "page": 1, "label": {"brand_name": "Y"}})

        grouped = load_ground_truth()

        assert set(grouped.keys()) == {"A.pdf", "B.pdf"}

    def test_slug_comes_from_the_filename_not_an_image_file_key(self, tmp_path, monkeypatch):
        # Real data has this exact gap: 44 of the 60 real annotation files
        # predate the image_file field and never got one added. The slug
        # must still resolve, from the JSON filename itself, which every
        # file reliably has.
        monkeypatch.setattr(score, "ANNOTATIONS_DIR", tmp_path)
        self._write(tmp_path, "a_slug_p1.json", {"sourceFile": "A.pdf", "page": 1, "label": {"brand_name": "X"}})

        grouped = load_ground_truth()

        _merged, pages, _conflicts = grouped["A.pdf"]
        assert pages == [("a_slug_p1", 1)]


class TestWriteResultsMd:
    def test_appends_rather_than_overwriting_an_existing_file(self, tmp_path, monkeypatch):
        results_path = tmp_path / "RESULTS.md"
        monkeypatch.setattr(score, "RESULTS_MD", results_path)
        results_path.write_text("# Extraction accuracy — RESULTS\n\nEarlier content stays.\n", encoding="utf-8")

        summary = aggregate([{"brand_name": {"correct": 1, "wrong": 0, "missing": 0}}])
        write_results_md("ai", summary, conflicts=[], label_count=1)

        text = results_path.read_text(encoding="utf-8")
        assert "Earlier content stays." in text
        assert "mode `ai`" in text
        assert "1 labels, 1 fields scored" in text

    def test_reports_ground_truth_conflicts_when_present(self, tmp_path, monkeypatch):
        results_path = tmp_path / "RESULTS.md"
        monkeypatch.setattr(score, "RESULTS_MD", results_path)

        summary = aggregate([{"package_size": {"correct": 1, "wrong": 0, "missing": 0}}])
        write_results_md("ai", summary, conflicts=[("X.pdf", [("package_size", ["10 Gummies", "30 Gummies"])])], label_count=1)

        text = results_path.read_text(encoding="utf-8")
        assert "X.pdf" in text
        assert "10 Gummies" in text and "30 Gummies" in text


class TestRunTextlayerMode:
    def test_extracts_and_returns_predictions_with_normalized_nutrition_table(self, tmp_path, monkeypatch):
        # Mock load_ground_truth to return two labels.
        stub_ground_truth = {
            "A.pdf": ({"brand_name": "X"}, [("a_p1", 1)], []),
            "B.pdf": ({"brand_name": "Y"}, [("b_p1", 1)], []),
        }
        monkeypatch.setattr(score, "load_ground_truth", lambda: stub_ground_truth)

        # Create temp directory with empty PDF files matching ground truth sources.
        pdf_dir = tmp_path / "pdfs"
        pdf_dir.mkdir()
        (pdf_dir / "A.pdf").touch()
        (pdf_dir / "B.pdf").touch()

        # Mock subprocess.run to return canned JSON with one record having null nutrition_table.
        canned_output = json.dumps([
            {
                "source_file": "A.pdf",
                "brand_name": "X",
                "product_name": "Product A",
                "nutrition_table": None,
                "flavour": None,
                "fssai_number": None,
                "marketing_company": None,
                "address": None,
                "customer_care_number": None,
                "customer_care_email": None,
                "package_size": None,
                "manufacturing_company": None,
                "claims": [],
                "ingredients": [],
                "colour_theme": None,
                "logo": None,
                "layout": None,
            },
            {
                "source_file": "B.pdf",
                "brand_name": "Y",
                "product_name": "Product B",
                "nutrition_table": {"Calories": "100 kcal"},
                "flavour": None,
                "fssai_number": None,
                "marketing_company": None,
                "address": None,
                "customer_care_number": None,
                "customer_care_email": None,
                "package_size": None,
                "manufacturing_company": None,
                "claims": [],
                "ingredients": [],
                "colour_theme": None,
                "logo": None,
                "layout": None,
            }
        ])

        mock_subprocess = Mock()
        mock_subprocess.run = Mock(return_value=Mock(stdout=canned_output, returncode=0))
        monkeypatch.setattr(score, "subprocess", mock_subprocess)

        # Set environment variable for PDF directory.
        monkeypatch.setenv("EVAL_LABEL_PDF_DIR", str(pdf_dir))

        # Call the function.
        predictions, ground_truth = run_textlayer_mode()

        # Verify predictions are keyed by source file with nutrition_table normalized.
        assert "A.pdf" in predictions
        assert "B.pdf" in predictions
        assert predictions["A.pdf"]["nutrition_table"] == {}  # null was normalized to {}
        assert predictions["B.pdf"]["nutrition_table"] == {"Calories": "100 kcal"}
        assert predictions["A.pdf"]["brand_name"] == "X"
        assert predictions["B.pdf"]["brand_name"] == "Y"

        # Verify ground truth is returned as-is.
        assert ground_truth == stub_ground_truth

    def test_raises_system_exit_when_no_pdfs_found(self, tmp_path, monkeypatch):
        # Mock load_ground_truth to return ground truth.
        stub_ground_truth = {
            "A.pdf": ({"brand_name": "X"}, [("a_p1", 1)], []),
        }
        monkeypatch.setattr(score, "load_ground_truth", lambda: stub_ground_truth)

        # Create an empty PDF directory (no PDFs for the ground truth files).
        pdf_dir = tmp_path / "empty_pdfs"
        pdf_dir.mkdir()

        monkeypatch.setenv("EVAL_LABEL_PDF_DIR", str(pdf_dir))

        # Should raise SystemExit with a message naming the directory.
        with pytest.raises(SystemExit) as exc_info:
            run_textlayer_mode()

        assert str(pdf_dir) in str(exc_info.value)
