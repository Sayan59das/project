// Dedicated client for the IMH LVS backend's label extraction API
// (POST /api/labels/extract, open-source Tesseract OCR — see backend/README.md).
// This is the ONLY module that knows the endpoint URL, the multipart
// request shape, or how to talk HTTP — extractionService.ts (the
// ExtractedLabelData mapping layer) and every page/component call
// extractLabel() and never touch fetch/FormData directly.
import { API_BASE_URL } from './apiConfig';

export type LabelExtractionApiResult = {
  marketingCompany: string;
  address: string;
  fssaiNumber: string;
  email: string;
  customerCareNumber: string;
  brand: string;
  flavour: string;
  productName: string;
  packageSize: string;
  manufacturingCompany: string;
};

// Thrown only for transport/server-side problems (network unreachable,
// backend down, unexpected response shape, or a validation rejection from
// the backend itself, e.g. a file type it doesn't support). Never thrown
// just because OCR couldn't confidently read a field — that's a normal
// success response with that field left as "".
export class LabelExtractionError extends Error {}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Posts the file to the backend's OCR endpoint and returns the 8 label
// fields exactly as extracted — empty strings are left empty, never
// guessed or filled in here. Callers decide how to fall back on error.
export async function extractLabel(file: File): Promise<LabelExtractionApiResult> {
  const formData = new FormData();
  formData.append('file', file);

  const extractUrl = `${API_BASE_URL}/api/labels/extract`;

  let response: Response;
  try {
    response = await fetch(extractUrl, { method: 'POST', body: formData });
  } catch (err) {
    // Visible in the browser console/DevTools for diagnosing a
    // misconfigured VITE_API_BASE_URL or an unreachable backend — never
    // shown to the end user, who only sees the message below.
    console.error(`[labelExtractionService] Request to ${extractUrl} failed:`, err);
    throw new LabelExtractionError('Label reading service is currently unavailable. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LabelExtractionError('The label reading service returned an unexpected response.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Record<string, unknown> } | null;

  if (!response.ok || !parsed?.success) {
    throw new LabelExtractionError(readString(parsed?.message) || 'Could not read the label automatically. Please enter the details manually.');
  }

  const data = parsed.data ?? {};
  return {
    marketingCompany: readString(data.marketingCompany),
    address: readString(data.address),
    fssaiNumber: readString(data.fssaiNumber),
    email: readString(data.email),
    customerCareNumber: readString(data.customerCareNumber),
    brand: readString(data.brand),
    flavour: readString(data.flavour),
    productName: readString(data.productName),
    packageSize: readString(data.packageSize),
    manufacturingCompany: readString(data.manufacturingCompany)
  };
}
