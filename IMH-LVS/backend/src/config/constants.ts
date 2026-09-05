// Manufacturing Company is fixed for every label, same rule the frontend
// already applies (see src/types/extraction.ts in the frontend app) — kept
// here too since the backend has no shared package with the frontend yet.
export const FIXED_MANUFACTURING_COMPANY = 'IM Healthcare Pvt. Ltd.';

export const ALLOWED_LABEL_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg'];
