from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

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
