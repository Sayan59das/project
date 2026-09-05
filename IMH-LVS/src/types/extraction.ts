// Extraction layer contract for label-driven product creation.
//
// IMPORTANT: there is no OCR/text-extraction engine wired up yet. IMH-LVS is
// a localStorage-backed prototype with no backend to host a real OCR
// service, so services/extractionService.ts's extractLabelData() is a
// clearly-labeled placeholder — it never fabricates label content. Every
// field starts blank with status 'Pending' and must be confirmed/typed by
// the user in the Verification step before the label can be saved (see
// ArtworkPage's Upload Artwork form). Swapping in a real OCR/AI service
// later only means replacing extractLabelData()'s body — its signature and
// the ExtractedLabelData shape below are the intended integration point.

export type ExtractionFieldStatus = 'Verified' | 'Pending' | 'Fixed';

export type ExtractedField = {
  value: string;
  status: ExtractionFieldStatus;
};

export type ExtractedLabelFieldKey =
  | 'productName'
  | 'marketingCompanyName'
  | 'address'
  | 'fssaiNumber'
  | 'email'
  | 'customerCareNumber'
  | 'brand'
  | 'flavour'
  | 'packageSize';

export type ExtractedLabelData = Record<ExtractedLabelFieldKey, ExtractedField> & {
  // Manufacturing Company is never read from the label — it is fixed to
  // FIXED_MANUFACTURING_COMPANY below and always reported 'Fixed'.
  manufacturingCompany: ExtractedField;
};

// Manufacturing Company requirement: IMH-LVS labels are always manufactured
// by IM Healthcare Pvt. Ltd. — see masterService.getOrCreateManufacturingCompany.
export const FIXED_MANUFACTURING_COMPANY = 'IM Healthcare Pvt. Ltd.';

export const EXTRACTED_FIELD_LABELS: Record<ExtractedLabelFieldKey, string> = {
  marketingCompanyName: 'Party',
  address: 'Address',
  fssaiNumber: 'FSSAI Number',
  email: 'Email',
  customerCareNumber: 'Customer Care Number',
  brand: 'Brand',
  flavour: 'Flavour',
  productName: 'Product Name',
  packageSize: 'Package Size'
};
