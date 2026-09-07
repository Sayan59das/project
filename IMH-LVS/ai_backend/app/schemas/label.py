from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any

# Fields the model is asked for as lists — everything else on ExtractedLabel
# is a plain string. VLM JSON output is prompted for, not enforced, and
# testing has seen the shape drift BOTH ways: a list field coming back as a
# bare string (or a comma-separated one), and a string field coming back
# wrapped in a single-item list. _coerce_field_shapes below corrects both
# directions for every field generically, rather than special-casing one
# field at a time as new drift shows up.
_LIST_FIELDS = ("colour_theme", "claims", "ingredients")


def _as_list(value: Any) -> Any:
    if value is None or isinstance(value, list):
        return value
    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",")]
        return [part for part in parts if part]
    return [value]


def _as_dict(value: Any) -> Any:
    if value is None or isinstance(value, dict):
        return value
    if isinstance(value, list):
        # A list of "key: value" strings, or a list of single-key dicts —
        # both shapes the model has been seen to return instead of one dict.
        merged: Dict[str, Any] = {}
        for item in value:
            if isinstance(item, dict):
                merged.update(item)
            elif isinstance(item, str) and ":" in item:
                key, _, val = item.partition(":")
                merged[key.strip()] = val.strip()
        return merged
    return {"value": value}


def _as_scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        # A single-value field the model wrapped in a list — join rather than
        # drop, so multi-item drift is at least visible instead of silently
        # truncated to the first element.
        return ", ".join(str(item) for item in value) if value else None
    if isinstance(value, dict):
        return ", ".join(f"{k}: {v}" for k, v in value.items()) if value else None
    return str(value)


class ExtractedLabel(BaseModel):
    brand_name: Optional[str] = Field(default=None, description="Brand Name of the product. Null if confidence < 0.80")
    product_name: Optional[str] = Field(default=None, description="Name of the product. Null if confidence < 0.80")
    colour_theme: Optional[List[str]] = Field(default=None, description="Extracted colour themes or palettes")
    flavour: Optional[str] = Field(default=None, description="Flavour of the product. Null if confidence < 0.80")
    claims: Optional[List[str]] = Field(default=None, description="List of marketing or health claims present on the label")
    logo: Optional[str] = Field(default=None, description="Description or presence of the brand logo")
    layout: Optional[str] = Field(default=None, description="Description of the overall label layout/structure")
    nutrition_table: Optional[Dict[str, Any]] = Field(default=None, description="Key-value pairs of nutritional information")
    fssai_number: Optional[str] = Field(default=None, description="FSSAI License number. Null if confidence < 0.80")
    ingredients: Optional[List[str]] = Field(default=None, description="List of ingredients")
    marketing_company: Optional[str] = Field(default=None, description="Name of the marketing company")
    address: Optional[str] = Field(default=None, description="Address of the marketing or manufacturing company")
    customer_care_number: Optional[str] = Field(default=None, description="Customer care contact number")
    customer_care_email: Optional[str] = Field(default=None, description="Customer care email address")
    package_size: Optional[str] = Field(default=None, description="Net weight, volume, or package size")
    manufacturing_company: Optional[str] = Field(default=None, description="Name of the manufacturing company")

    @model_validator(mode="before")
    @classmethod
    def _coerce_field_shapes(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        for key, value in list(data.items()):
            if key in _LIST_FIELDS:
                data[key] = _as_list(value)
            elif key == "nutrition_table":
                data[key] = _as_dict(value)
            elif key in cls.model_fields:
                data[key] = _as_scalar(value)
        return data

class Artwork(BaseModel):
    artwork_id: str
    marketing_company: str
    version: str
    label_data: ExtractedLabel
    
class Version(BaseModel):
    version_id: str
    artwork_id: str
    is_approved: bool
    label_data: ExtractedLabel

class Approval(BaseModel):
    approval_id: str
    version_id: str
    status: str
    comments: Optional[str] = None

class Product(BaseModel):
    product_id: str
    brand_name: str
    product_name: str
    marketing_company: str
    fssai_number: Optional[str] = None
