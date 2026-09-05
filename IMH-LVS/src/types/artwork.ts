// Artwork master record. Links to an existing Product (by id) and carries a
// denormalized snapshot of Brand/Marketing/Manufacturing Company at upload
// time — the same pattern Product Management already uses for its own
// company/brand fields (plain display strings, not foreign-key ids). This
// keeps Artwork consistent with the rest of the app without retrofitting an
// id-based relationship model that doesn't exist elsewhere yet.
//
// Product → Artwork → Label Version → Comparison → Approval/QA → Final Label
// This module only builds the Artwork link; Comparison is a later module.

export type ArtworkType = 'Full Label' | 'Front Artwork' | 'Back Artwork';

export const ARTWORK_TYPE_OPTIONS: ArtworkType[] = ['Full Label', 'Front Artwork', 'Back Artwork'];

// 'Approved' is a historical/legacy terminal status (pre-dates the Label
// Final -> Technical -> QA -> Manager workflow) kept so existing seed
// artworks stay valid comparison references. 'Final Approved' is the only
// status the Manager-approval stage produces — see comparisonService.ts's
// submitManagerDecision(). 'Revision Required' mirrors the comparison-level
// send-back so Artwork Management reflects the same decision.
export type ArtworkStatus =
  | 'Draft'
  | 'Pending Comparison'
  | 'Under Review'
  | 'Approved'
  | 'Final Approved'
  | 'Revision Required'
  | 'Rejected'
  | 'Archived';

export const ARTWORK_STATUS_OPTIONS: ArtworkStatus[] = [
  'Draft',
  'Pending Comparison',
  'Under Review',
  'Approved',
  'Final Approved',
  'Revision Required',
  'Rejected',
  'Archived'
];

export type Artwork = {
  id: string; // ART-0001, stable for life of the record
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string; // 'V1', 'V2', ...
  artworkType: ArtworkType;
  fileName: string;
  fileType: string;
  fileSize: number; // bytes
  filePath: string; // object URL (this session) or a stored reference string
  status: ArtworkStatus;
  remarks: string;
  uploadedBy: string;
  uploadDate: string;
  updatedBy: string;
  updatedDate: string;
};

// Fields the Upload/Edit form actually collects — id and audit fields are
// managed by the service.
export type ArtworkInput = {
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string;
  artworkType: ArtworkType;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  status: ArtworkStatus;
  remarks: string;
};

export const SUPPORTED_ARTWORK_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const MAX_ARTWORK_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — see artworkService for why this cap matters for the prototype
