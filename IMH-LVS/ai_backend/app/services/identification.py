# Product-identification matching rule for the /identify-product endpoint
# (Step 2 of the AI module brief), pulled out into its own pure function so
# it can be unit-tested directly instead of only through the FastAPI route.
#
# An FSSAI licence number identifies a COMPANY (or manufacturing site), not
# a single product — one company can, and in this project's own reviewed
# label data does, sell several distinct products under the same FSSAI
# number. So a matching FSSAI number is strong evidence for "same marketing
# company" (more reliable than string-comparing the company name, which
# free-text/OCR variance makes brittle) but it must never, on its own,
# stand in for a product-name match: an FSSAI match against a different
# product name means "another product from the same company", not "the
# same product, misspelled or reformatted".
from typing import List, Optional

from app.schemas.label import ExtractedLabel, Product


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def find_matching_product(extracted_label: ExtractedLabel, existing_products: List[Product]) -> Optional[Product]:
    """Returns the existing product this label matches, or None. Requires
    both a product name and a marketing company to have been extracted —
    without both, there isn't enough to identify against, so this never
    guesses from a partial read."""
    if not extracted_label.product_name or not extracted_label.marketing_company:
        return None

    extracted_name = _norm(extracted_label.product_name)
    extracted_company = _norm(extracted_label.marketing_company)
    extracted_fssai = (extracted_label.fssai_number or "").strip()

    for product in existing_products:
        if _norm(product.product_name) != extracted_name:
            continue  # FSSAI can never substitute for the product name itself

        company_match = _norm(product.marketing_company) == extracted_company
        fssai_match = bool(
            product.fssai_number and extracted_fssai and product.fssai_number.strip() == extracted_fssai
        )

        if company_match or fssai_match:
            return product

    return None
