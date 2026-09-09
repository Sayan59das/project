# Unit tests for the deterministic, no-fabrication validators in
# app/services/extraction.py. These are pure functions with no GPU/model
# dependency, so they run instantly and don't need use_mock=False or CUDA.
#
# Run from ai_backend/: `python -m pytest tests/test_extraction_validators.py`
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services.extraction import (
    LABEL_FIELDS,
    ExtractionService,
    _build_completion_prompt,
    _looks_like_colour_name,
    _missing_fields,
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


class TestMissingFields:
    """A key the model never wrote at all is a different, worse failure than
    one it wrote as an explicit null — see _missing_fields' own docstring.
    Observed concretely: a real label response covered the first 10 of 16
    fields and closed its object right there, never attempting the other 6."""

    def test_a_key_never_written_is_reported_missing(self):
        data = {"brand_name": "Homeo-Vita"}
        assert _missing_fields(data, LABEL_FIELDS) == [f for f in LABEL_FIELDS if f != "brand_name"]

    def test_a_key_written_as_explicit_null_is_not_missing(self):
        # This is the exact distinction the whole retry depends on: the model
        # followed the "set to null if not legible" instruction, so the key
        # IS present — it must not be treated the same as an omission.
        data = {field: None for field in LABEL_FIELDS}
        assert _missing_fields(data, LABEL_FIELDS) == []

    def test_all_fields_present_reports_nothing_missing(self):
        data = {field: "x" for field in LABEL_FIELDS}
        assert _missing_fields(data, LABEL_FIELDS) == []

    def test_empty_response_reports_every_field_missing(self):
        assert _missing_fields({}, LABEL_FIELDS) == LABEL_FIELDS


class TestBuildCompletionPrompt:
    def test_lists_exactly_the_requested_fields_and_no_others(self):
        prompt = _build_completion_prompt(["marketing_company", "address", "package_size"])
        assert "marketing_company, address, package_size" in prompt
        for field in LABEL_FIELDS:
            if field not in ("marketing_company", "address", "package_size"):
                assert field not in prompt

    def test_includes_the_specific_rule_only_for_a_field_that_has_one(self):
        prompt = _build_completion_prompt(["package_size", "brand_name"])
        assert "package_size:" in prompt and "net content" in prompt
        # brand_name has no dedicated rule in _COMPLETION_FIELD_NOTES; nothing
        # should be fabricated for it.
        assert "brand_name:" not in prompt

    def test_still_instructs_null_for_illegible_fields(self):
        # The retry must not read as "try harder until you find something" —
        # it carries the same permission to say null as the first pass did.
        prompt = _build_completion_prompt(["address"])
        assert "set its value to null" in prompt

    def test_claims_and_ingredients_share_one_note_not_duplicated(self):
        prompt = _build_completion_prompt(["claims", "ingredients"])
        assert prompt.count("never joined into one string") == 1


class TestExtractFromImageCompletionRetry:
    """extract_from_image's orchestration of the completion retry, with
    _generate_json mocked so these run with no GPU and no real model."""

    FIRST_PASS_MISSING_TAIL = {
        "brand_name": "Homeo-Vita", "product_name": "Multivitamin Gummies",
        "colour_theme": ["Red"], "flavour": "Strawberry", "claims": [], "logo": None,
        "layout": None, "nutrition_table": {}, "fssai_number": None, "ingredients": [],
        # marketing_company, address, customer_care_number, customer_care_email,
        # package_size, manufacturing_company: never mentioned at all.
    }

    def _service(self):
        service = ExtractionService(use_mock=False)
        service.model = object()
        service.processor = object()
        return service

    def test_omitted_fields_trigger_exactly_one_retry_for_only_those_fields(self):
        calls = []

        def fake_generate(self, image, prompt, max_new_tokens=1024):
            calls.append(max_new_tokens)
            if len(calls) == 1:
                return dict(TestExtractFromImageCompletionRetry.FIRST_PASS_MISSING_TAIL)
            return {"marketing_company": "Unicare Pharma"}

        with patch.object(ExtractionService, "_load_model", lambda self: None), \
             patch.object(ExtractionService, "_generate_json", fake_generate):
            result = self._service().extract_from_image(object())

        assert len(calls) == 2
        assert calls[1] == 384  # the narrower budget for the focused retry
        assert result.marketing_company == "Unicare Pharma"

    def test_retry_recovers_a_real_value_the_first_pass_never_attempted(self):
        def fake_generate(self, image, prompt, max_new_tokens=1024):
            if "package_size" in prompt:
                return {"package_size": "30 Gummies"}
            return dict(TestExtractFromImageCompletionRetry.FIRST_PASS_MISSING_TAIL)

        with patch.object(ExtractionService, "_load_model", lambda self: None), \
             patch.object(ExtractionService, "_generate_json", fake_generate):
            result = self._service().extract_from_image(object())

        assert result.package_size == "30 Gummies"

    def test_retry_returning_blank_strings_ends_up_null_not_a_hollow_value(self):
        # Observed concretely: the completion prompt sometimes answers a
        # field it could not find with "" instead of the null it was asked
        # for. A blank string must not display as if it were an answer.
        def fake_generate(self, image, prompt, max_new_tokens=1024):
            if len(fake_generate.calls) == 0:
                fake_generate.calls.append(1)
                return dict(TestExtractFromImageCompletionRetry.FIRST_PASS_MISSING_TAIL)
            return {"marketing_company": "", "address": "", "customer_care_number": "",
                    "customer_care_email": "", "package_size": "", "manufacturing_company": ""}
        fake_generate.calls = []

        with patch.object(ExtractionService, "_load_model", lambda self: None), \
             patch.object(ExtractionService, "_generate_json", fake_generate):
            result = self._service().extract_from_image(object())

        assert result.marketing_company is None
        assert result.address is None
        assert result.package_size is None

    def test_no_retry_when_nothing_was_omitted(self):
        calls = []

        def fake_generate(self, image, prompt, max_new_tokens=1024):
            calls.append(1)
            return {field: None for field in LABEL_FIELDS}

        with patch.object(ExtractionService, "_load_model", lambda self: None), \
             patch.object(ExtractionService, "_generate_json", fake_generate):
            self._service().extract_from_image(object())

        assert len(calls) == 1  # no wasted second GPU pass

    def test_no_retry_when_the_first_pass_produced_nothing_at_all(self):
        # A totally empty {} means the first pass failed outright (e.g. no
        # JSON object found at all) rather than stopping partway through a
        # real answer — retrying "all 16 fields" in that case would just
        # repeat a very similar failure, not a meaningfully smaller task.
        calls = []

        def fake_generate(self, image, prompt, max_new_tokens=1024):
            calls.append(1)
            return {}

        with patch.object(ExtractionService, "_load_model", lambda self: None), \
             patch.object(ExtractionService, "_generate_json", fake_generate):
            result = self._service().extract_from_image(object())

        assert len(calls) == 1
        assert result.brand_name is None
