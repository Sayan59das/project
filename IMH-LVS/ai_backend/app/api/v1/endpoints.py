from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from typing import List
from app.schemas.label import ExtractedLabel, Version, Product
from app.services.extraction import ExtractionService
from app.services.comparison import ComparisonService
from app.services.identification import find_matching_product
from app.services.reporting import ReportingService
import json

router = APIRouter()

extraction_service = ExtractionService(use_mock=False)
comparison_service = ComparisonService()
reporting_service = ReportingService()

@router.post("/read-label", response_model=ExtractedLabel)
async def read_label(file: UploadFile = File(...)):
    """Phase 2: Extraction Service. Accepts PDF, JPG, JPEG."""
    if not file.filename.lower().endswith(('.pdf', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, detail="Only PDF, JPG, and JPEG files are supported.")
    
    file_bytes = await file.read()
    extracted_data = extraction_service.process_file(file_bytes, file.filename)
    return extracted_data

@router.post("/identify-product")
async def identify_product(extracted_label: ExtractedLabel, existing_products: List[Product] = []):
    """Step 2: Identify Product API. Returns existing product if matched, else New Product."""
    match = find_matching_product(extracted_label, existing_products)
    if match:
        return {"status": "Existing Product Found", "product": match}
    return {"status": "New Product / No Match", "product": None}

@router.post("/compare-label")
async def compare_label(source_label: ExtractedLabel, all_versions: List[Version] = [], cross_company_labels: List[ExtractedLabel] = []):
    """Phase 3: Comparison Service"""
    response_data = {}
    
    # Stage 1: Version Comparison - Strict Rule: Auto-fetch approved version
    approved_version = None
    if all_versions:
        for v in all_versions:
            if v.is_approved and v.label_data.marketing_company == source_label.marketing_company:
                approved_version = v
                break

    if approved_version:
        response_data["version_comparison"] = comparison_service.evaluate_labels(source_label, approved_version.label_data)
    else:
        response_data["version_comparison"] = "Skipped - No approved version exists"

    # Stage 2: Cross-Company Comparison
    best_match = comparison_service.find_best_cross_company_match(source_label, cross_company_labels)
    if best_match:
        response_data["cross_company_best_match"] = best_match
    else:
        response_data["cross_company_best_match"] = "No Comparison Available"

    return response_data

@router.post("/generate-report")
async def generate_report(evaluation_results: dict, cross_company_match: dict = None):
    """Phase 4: PDF Report Generator"""
    pdf_bytes = reporting_service.generate_pdf_report(evaluation_results, cross_company_match)
    
    return Response(
        content=pdf_bytes, 
        media_type="application/pdf", 
        headers={"Content-Disposition": "attachment; filename=comparison_report.pdf"}
    )
