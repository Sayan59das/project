from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from typing import List
from app.schemas.label import ExtractedLabel, Version
from app.services.extraction import ExtractionService
from app.services.comparison import ComparisonService
from app.services.reporting import ReportingService
import json

router = APIRouter()

extraction_service = ExtractionService()
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

@router.post("/compare-label")
async def compare_label(source_label: ExtractedLabel, approved_version: Version = None, cross_company_labels: List[ExtractedLabel] = []):
    """Phase 3: Comparison Service"""
    response_data = {}
    
    # Stage 1: Version Comparison
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
