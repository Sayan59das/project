# Unit tests for the deterministic, no-fabrication validators in
# app/services/extraction.py. These are pure functions with no GPU/model
# dependency, so they run instantly and don't need use_mock=False or CUDA.
#
# Run from ai_backend/: `python -m pytest tests/test_extraction_validators.py`
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services.extraction import (
    _looks_like_colour_name,
    _resolve_inference_device,
    _validate_colour_theme,
    _validate_fssai_number,
    _validate_logo,
)


class TestLooksLikeColourName:
    def test_common_colour_words_pass(self):
        for word in ["Red", "White", "Blue", "Pink", "Gold"]:
            assert _looks_like_colour_name(word), word

    def test_colours_not_in_any_fixed_vocabulary_still_pass(self):
        # The whole point of this validator: no closed word list, so a
        # colour that would never appear in a hand-picked list is not
        # silently rejected.
        for word in ["Charcoal", "Saffron", "Fuchsia", "Off-White", "Periwinkle"]:
            assert _looks_like_colour_name(word), word

    def test_multi_word_and_joined_colour_descriptions_pass(self):
        for phrase in ["Sky Blue", "Green & Orange", "Pink and Orange"]:
            assert _looks_like_colour_name(phrase), phrase

    def test_short_all_caps_token_reads_as_a_batch_code_stamp(self):
        # The actual observed failure: a batch-code placeholder ("UVZ") read
        # into colour_theme, printed in caps on the label itself.
        for code in ["UVZ", "ABC", "XYZ"]:
            assert not _looks_like_colour_name(code), code

    def test_a_token_containing_digits_is_rejected(self):
        for text in ["222x88mm", "SIZE22", "12345"]:
            assert not _looks_like_colour_name(text), text

    def test_an_overly_long_sentence_fragment_is_rejected(self):
        assert not _looks_like_colour_name("This label uses a vibrant gradient across the entire front panel design")

    def test_blank_is_rejected(self):
        assert not _looks_like_colour_name("")
        assert not _looks_like_colour_name("   ")


class TestValidateColourTheme:
    def test_none_passes_through(self):
        assert _validate_colour_theme(None) is None

    def test_a_list_keeps_only_real_colour_entries(self):
        assert _validate_colour_theme(["Pink", "UVZ", "Orange"]) == ["Pink", "Orange"]

    def test_a_comma_separated_string_is_split_and_filtered(self):
        assert _validate_colour_theme("Red, White, UVZ") == ["Red", "White"]

    def test_all_entries_failing_validation_returns_none_rather_than_an_empty_list(self):
        assert _validate_colour_theme(["UVZ", "222x88mm"]) is None

    def test_empty_list_returns_none(self):
        assert _validate_colour_theme([]) is None


class TestValidateLogo:
    def test_none_passes_through(self):
        assert _validate_logo(None) is None

    def test_a_url_shaped_value_is_rejected(self):
        assert _validate_logo("http://example.com/logo.png") is None
        assert _validate_logo("www.example.com/logo") is None

    def test_a_value_copied_from_another_field_is_rejected(self):
        assert _validate_logo("A Unicare Pharma", {"a unicare pharma"}) is None

    def test_a_genuine_description_mentioning_the_brand_name_is_not_rejected(self):
        # Only an EXACT cross-field copy is rejected — a real description
        # that happens to reference the brand name in passing is not the
        # same failure and must still be reported.
        result = _validate_logo("Green leaf emblem with THULASI PHARMACIES text", {"thulasi pharmacies"})
        assert result == "Green leaf emblem with THULASI PHARMACIES text"


class TestResolveInferenceDevice:
    def test_cuda_is_used_whenever_available_regardless_of_the_opt_in(self):
        assert _resolve_inference_device(cuda_available=True, allow_cpu_env="") == "cuda"
        assert _resolve_inference_device(cuda_available=True, allow_cpu_env="1") == "cuda"

    def test_no_cuda_and_no_opt_in_raises_rather_than_silently_using_cpu(self):
        with pytest.raises(RuntimeError, match="CUDA GPU not available"):
            _resolve_inference_device(cuda_available=False, allow_cpu_env="")

    def test_no_cuda_with_the_explicit_opt_in_falls_back_to_cpu(self):
        for value in ["1", "true", "True", "yes", "YES"]:
            assert _resolve_inference_device(cuda_available=False, allow_cpu_env=value) == "cpu"

    def test_an_unrecognised_opt_in_value_still_raises(self):
        with pytest.raises(RuntimeError):
            _resolve_inference_device(cuda_available=False, allow_cpu_env="0")


class TestValidateFssaiNumber:
    def test_a_valid_14_digit_number_passes(self):
        assert _validate_fssai_number("12345678901234") == "12345678901234"

    def test_digits_are_extracted_from_surrounding_formatting(self):
        assert _validate_fssai_number("1234-5678-9012-34") == "12345678901234"

    def test_wrong_digit_count_returns_none(self):
        assert _validate_fssai_number("123456789012345") is None  # 15 digits
        assert _validate_fssai_number("1234567890123") is None  # 13 digits

    def test_none_passes_through(self):
        assert _validate_fssai_number(None) is None
