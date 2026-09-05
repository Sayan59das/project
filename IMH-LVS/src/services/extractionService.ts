// Label extraction service — the single integration point for OCR/AI-based
// label reading (see types/extraction.ts for the full rationale).
//
// Now backed by the IMH LVS backend's open-source Tesseract OCR endpoint
// (see services/labelExtractionService.ts for the HTTP/API details — this
// module only maps that result onto the ExtractedLabelData shape the rest
// of the app already expects). No paid AI/OCR provider is used anywhere in
// this path.
//
// Nothing here fabricates label content: any field OCR couldn't confidently
// read comes back as "" with status 'Pending', exactly as before, and the
// user still reads/confirms every field in the Verification step
// (ArtworkPage's Upload Artwork form) before it can be saved.
//
// extractLabelData() itself never throws for a "nothing could be read"
// outcome (that's still a normal, successful call — see below) — it only
// throws (a LabelExtractionError, re-exported below) when the request
// itself failed (backend unreachable, backend rejected the file, an
// unexpected response). Callers (ArtworkPage) decide how to surface that
// to the user and whether to retry; the selected file and any manually
// entered values are never discarded because of it.

import { ExtractedLabelData, FIXED_MANUFACTURING_COMPANY } from '../types/extraction';
import { extractLabel, LabelExtractionError } from './labelExtractionService';

export { LabelExtractionError };

export const EXTRACTION_ENGINE = 'tesseract' as const;

function readField(value: string): { value: string; status: 'Verified' | 'Pending' } {
  return { value, status: value.trim() ? 'Verified' : 'Pending' };
}

export async function extractLabelData(file: File): Promise<ExtractedLabelData> {
  const result = await extractLabel(file);

  return {
    productName: readField(result.productName),
    packageSize: readField(result.packageSize),
    marketingCompanyName: readField(result.marketingCompany),
    address: readField(result.address),
    fssaiNumber: readField(result.fssaiNumber),
    email: readField(result.email),
    customerCareNumber: readField(result.customerCareNumber),
    brand: readField(result.brand),
    flavour: readField(result.flavour),
    // Never taken from the OCR response even though the backend also
    // reports it — always the app's own fixed constant.
    manufacturingCompany: { value: FIXED_MANUFACTURING_COMPANY, status: 'Fixed' }
  };
}
