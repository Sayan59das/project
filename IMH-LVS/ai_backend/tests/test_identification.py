# Unit tests for the product-identification matching rule — a pure
# function with no FastAPI/network dependency, extracted out of the
# /identify-product endpoint so this rule can be tested directly.
#
# Run from ai_backend/: `python -m pytest tests/test_identification.py`
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas.label import ExtractedLabel, Product
from app.services.identification import find_matching_product


def _product(**overrides):
    defaults = dict(
        product_id="p1",
        brand_name="Brand",
        product_name="Multivitamin Gummies",
        marketing_company="Acme Health Pvt Ltd",
        fssai_number="12345678901234",
    )
    defaults.update(overrides)
    return Product(**defaults)


def _label(**overrides):
    defaults = dict(
        product_name="Multivitamin Gummies",
        marketing_company="Acme Health Pvt Ltd",
        fssai_number="12345678901234",
    )
    defaults.update(overrides)
    return ExtractedLabel(**defaults)


class TestFindMatchingProduct:
    def test_matches_on_exact_product_name_and_company(self):
        assert find_matching_product(_label(), [_product()]) is not None

    def test_matching_is_case_and_whitespace_insensitive(self):
        existing = _product(product_name="  MULTIVITAMIN GUMMIES ", marketing_company="acme health pvt ltd")
        assert find_matching_product(_label(), [existing]) is not None

    def test_an_fssai_match_never_substitutes_for_a_different_product_name(self):
        # Same company's FSSAI licence, but a genuinely different product —
        # one company can, and in this project's own data does, sell
        # several distinct products under the same FSSAI licence, so a
        # shared FSSAI number must never be read as "same product".
        existing = _product(product_name="Calcium Gummies")
        label = _label(product_name="Multivitamin Gummies")
        assert find_matching_product(label, [existing]) is None

    def test_an_fssai_match_does_stand_in_for_a_mismatched_company_name(self):
        # Company name text differs (OCR/formatting variance between the
        # label and the stored record) but the FSSAI licence and product
        # name both agree — an FSSAI licence identifies a company far more
        # reliably than free-text string equality does, so this should
        # still be treated as the same product.
        existing = _product(marketing_company="Acme Health Private Limited")
        label = _label(marketing_company="Acme Health Pvt. Ltd.")
        assert find_matching_product(label, [existing]) is not None

    def test_no_match_without_either_fssai_or_company_agreement(self):
        existing = _product(marketing_company="Different Co", fssai_number="99999999999999")
        assert find_matching_product(_label(), [existing]) is None

    def test_returns_none_when_the_extracted_product_name_is_missing(self):
        assert find_matching_product(_label(product_name=None), [_product()]) is None

    def test_returns_none_when_the_extracted_marketing_company_is_missing(self):
        assert find_matching_product(_label(marketing_company=None), [_product()]) is None

    def test_no_existing_products_returns_none(self):
        assert find_matching_product(_label(), []) is None

    def test_picks_the_first_matching_product_when_several_are_given(self):
        no_match = _product(product_id="p0", product_name="Calcium Gummies")
        match = _product(product_id="p1")
        result = find_matching_product(_label(), [no_match, match])
        assert result is match
