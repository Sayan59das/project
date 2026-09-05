import { Comparison, LabelAttributes } from '../types/comparison';

// Structured label content per artwork — stands in for what OCR/text
// extraction will eventually produce from the actual artwork file (see
// comparisonService.ts). Hand-authored here only for the artworks used in
// demo/seed comparisons and as live cross-company candidates.
export const SEED_LABEL_ATTRIBUTES: LabelAttributes[] = [
  // Vitamin C Gummies — ABC Healthcare — V4 (Approved, reference)
  {
    artworkId: 'ART-0004',
    brandName: 'VitaFit',
    productName: 'Vitamin C Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-123-4567',
    customerCareEmail: 'care@imhealthcare.com',
    colourTheme: 'Green & Orange gradient',
    flavour: 'Orange',
    claims: 'Supports Immunity | High in Vitamin C',
    logo: 'VitaFit Apple Logo v2',
    labelDesign: 'Standard Layout A',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045001234',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Vitamin C Gummies — ABC Healthcare — V5 (Draft, new label)
  {
    artworkId: 'ART-0005',
    brandName: 'VitaFit',
    productName: 'Vitamin C Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-123-4567',
    customerCareEmail: 'care@imhealthcare.com',
    colourTheme: 'Green & Orange gradient (refreshed shade)',
    flavour: 'Orange',
    claims: 'Supports Immunity | High in Vitamin C | Supports Energy',
    logo: 'VitaFit Apple Logo v2',
    labelDesign: 'Standard Layout A (refreshed)',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045001234',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Multivitamin Gummies — XYZ Healthcare — V1 (Approved, reference)
  {
    artworkId: 'ART-0006',
    brandName: 'NutriPlus',
    productName: 'Multivitamin Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-987-6543',
    customerCareEmail: 'support@xyzhealthcare.com',
    colourTheme: 'Purple & Yellow',
    flavour: 'Mixed Berry',
    claims: 'Supports Overall Wellness',
    logo: 'NutriPlus Star Logo',
    labelDesign: 'Standard Layout B',
    nutritionTableFormat: 'Standard (per 1 gummy)',
    fssaiNumber: '10023045001235',
    ingredients: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour'
  },
  // Multivitamin Gummies — XYZ Healthcare — V2 (Under Review, new label)
  {
    artworkId: 'ART-0007',
    brandName: 'NutriPlus',
    productName: 'Multivitamin Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-987-6543',
    customerCareEmail: 'support@xyzhealthcare.com',
    colourTheme: 'Purple & Yellow',
    flavour: 'Mixed Berry',
    claims: 'Supports Overall Wellness Daily',
    logo: 'NutriPlus Star Logo',
    labelDesign: 'Standard Layout B',
    nutritionTableFormat: 'Standard (per 1 gummy)',
    fssaiNumber: '10023045001235',
    ingredients: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour'
  },
  // Vitamin C Gummies — XYZ Healthcare — V1 (cross-company candidate)
  {
    artworkId: 'ART-0011',
    brandName: 'CitraBoost',
    productName: 'Vitamin C Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-555-2222',
    customerCareEmail: 'care@xyzhealthcare.com',
    colourTheme: 'Blue & Orange',
    flavour: 'Orange',
    claims: 'Supports Immunity',
    logo: 'CitraBoost Citrus Logo',
    labelDesign: 'Standard Layout A',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045009911',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Vitamin C Gummies — NutriCare — V1 (cross-company candidate)
  {
    artworkId: 'ART-0012',
    brandName: 'ImmunoBoost',
    productName: 'Vitamin C Gummies',
    address: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
    customerCareNumber: '1800-444-1111',
    customerCareEmail: 'care@nutricare.com',
    colourTheme: 'Red & Yellow',
    flavour: 'Mango',
    claims: 'Boosts Immunity Fast',
    logo: 'ImmunoBoost Shield Logo',
    labelDesign: 'Standard Layout C',
    nutritionTableFormat: 'Detailed (per 100g)',
    fssaiNumber: '10023045009922',
    ingredients: 'Vitamin C, Zinc, Pectin, Sugar, Citric Acid, Natural Mango Flavour'
  }
];

// Pre-computed comparison history (seed). Live comparisons created via the
// "New Comparison" wizard go through the same service functions used to
// generate these.
export const SEED_COMPARISONS: Comparison[] = [
  {
    id: 'CMP-0001',
    productId: 'PRD-0001',
    productName: 'Vitamin C Gummies',
    stage: 'same_company',
    newArtworkId: 'ART-0005',
    newArtworkVersion: 'V5',
    newArtworkCompany: 'ABC Healthcare',
    referenceArtworkId: 'ART-0004',
    referenceArtworkVersion: 'V4',
    referenceArtworkCompany: 'ABC Healthcare',
    parameters: [
      { parameter: 'Brand Name', referenceValue: 'VitaFit', newValue: 'VitaFit', result: 'MATCH' },
      { parameter: 'Product Name', referenceValue: 'Vitamin C Gummies', newValue: 'Vitamin C Gummies', result: 'MATCH' },
      {
        parameter: 'Address',
        referenceValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        newValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        result: 'MATCH'
      },
      { parameter: 'Customer Care Number', referenceValue: '1800-123-4567', newValue: '1800-123-4567', result: 'MATCH' },
      { parameter: 'Customer Care Email', referenceValue: 'care@imhealthcare.com', newValue: 'care@imhealthcare.com', result: 'MATCH' },
      {
        parameter: 'Colour Theme',
        referenceValue: 'Green & Orange gradient',
        newValue: 'Green & Orange gradient (refreshed shade)',
        result: 'SIMILAR'
      },
      { parameter: 'Flavour', referenceValue: 'Orange', newValue: 'Orange', result: 'MATCH' },
      {
        parameter: 'Claims',
        referenceValue: 'Supports Immunity | High in Vitamin C',
        newValue: 'Supports Immunity | High in Vitamin C | Supports Energy',
        result: 'SIMILAR'
      },
      { parameter: 'Logo', referenceValue: 'VitaFit Apple Logo v2', newValue: 'VitaFit Apple Logo v2', result: 'MATCH' },
      { parameter: 'Label Design / Layout', referenceValue: 'Standard Layout A', newValue: 'Standard Layout A (refreshed)', result: 'SIMILAR' },
      {
        parameter: 'Nutrition Table Format',
        referenceValue: 'Standard (per 2 gummies)',
        newValue: 'Standard (per 2 gummies)',
        result: 'MATCH'
      },
      { parameter: 'FSSAI Number', referenceValue: '10023045001234', newValue: '10023045001234', result: 'MATCH' },
      {
        parameter: 'Ingredients',
        referenceValue: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour',
        newValue: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour',
        result: 'MATCH'
      }
    ],
    overallSimilarity: 92,
    overallResult: 'REVIEW REQUIRED',
    status: 'Pending Label Final',
    history: [],
    approvalAssignments: {},
    comparedBy: 'Priya Sharma',
    comparisonDate: '2026-08-15',
    updatedBy: 'Priya Sharma',
    updatedDate: '2026-08-15'
  },
  {
    id: 'CMP-0002',
    productId: 'PRD-0002',
    productName: 'Multivitamin Gummies',
    stage: 'same_company',
    newArtworkId: 'ART-0007',
    newArtworkVersion: 'V2',
    newArtworkCompany: 'XYZ Healthcare',
    referenceArtworkId: 'ART-0006',
    referenceArtworkVersion: 'V1',
    referenceArtworkCompany: 'XYZ Healthcare',
    parameters: [
      { parameter: 'Brand Name', referenceValue: 'NutriPlus', newValue: 'NutriPlus', result: 'MATCH' },
      { parameter: 'Product Name', referenceValue: 'Multivitamin Gummies', newValue: 'Multivitamin Gummies', result: 'MATCH' },
      {
        parameter: 'Address',
        referenceValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        newValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        result: 'MATCH'
      },
      { parameter: 'Customer Care Number', referenceValue: '1800-987-6543', newValue: '1800-987-6543', result: 'MATCH' },
      { parameter: 'Customer Care Email', referenceValue: 'support@xyzhealthcare.com', newValue: 'support@xyzhealthcare.com', result: 'MATCH' },
      { parameter: 'Colour Theme', referenceValue: 'Purple & Yellow', newValue: 'Purple & Yellow', result: 'MATCH' },
      { parameter: 'Flavour', referenceValue: 'Mixed Berry', newValue: 'Mixed Berry', result: 'MATCH' },
      {
        parameter: 'Claims',
        referenceValue: 'Supports Overall Wellness',
        newValue: 'Supports Overall Wellness Daily',
        result: 'SIMILAR'
      },
      { parameter: 'Logo', referenceValue: 'NutriPlus Star Logo', newValue: 'NutriPlus Star Logo', result: 'MATCH' },
      { parameter: 'Label Design / Layout', referenceValue: 'Standard Layout B', newValue: 'Standard Layout B', result: 'MATCH' },
      {
        parameter: 'Nutrition Table Format',
        referenceValue: 'Standard (per 1 gummy)',
        newValue: 'Standard (per 1 gummy)',
        result: 'MATCH'
      },
      { parameter: 'FSSAI Number', referenceValue: '10023045001235', newValue: '10023045001235', result: 'MATCH' },
      {
        parameter: 'Ingredients',
        referenceValue: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour',
        newValue: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour',
        result: 'MATCH'
      }
    ],
    overallSimilarity: 97,
    overallResult: 'MATCH',
    status: 'Completed',
    history: [],
    approvalAssignments: {},
    comparedBy: 'Priya Sharma',
    comparisonDate: '2026-07-31',
    updatedBy: 'Aman Kumar',
    updatedDate: '2026-08-02'
  },
  {
    id: 'CMP-0003',
    productId: 'PRD-0001',
    productName: 'Vitamin C Gummies',
    stage: 'cross_company',
    newArtworkId: 'ART-0004',
    newArtworkVersion: 'V4',
    newArtworkCompany: 'ABC Healthcare',
    referenceArtworkId: 'ART-0012',
    referenceArtworkVersion: 'V1',
    referenceArtworkCompany: 'NutriCare',
    parameters: [
      { parameter: 'Brand Name', referenceValue: 'ImmunoBoost', newValue: 'VitaFit', result: 'CONFLICT' },
      { parameter: 'Product Name', referenceValue: 'Vitamin C Gummies', newValue: 'Vitamin C Gummies', result: 'MATCH' },
      {
        parameter: 'Address',
        referenceValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        newValue: 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019',
        result: 'MATCH'
      },
      { parameter: 'Customer Care Number', referenceValue: '1800-444-1111', newValue: '1800-123-4567', result: 'CONFLICT' },
      { parameter: 'Customer Care Email', referenceValue: 'care@nutricare.com', newValue: 'care@imhealthcare.com', result: 'CONFLICT' },
      { parameter: 'Colour Theme', referenceValue: 'Red & Yellow', newValue: 'Green & Orange gradient', result: 'CONFLICT' },
      { parameter: 'Flavour', referenceValue: 'Mango', newValue: 'Orange', result: 'CONFLICT' },
      { parameter: 'Claims', referenceValue: 'Boosts Immunity Fast', newValue: 'Supports Immunity | High in Vitamin C', result: 'CONFLICT' },
      { parameter: 'Logo', referenceValue: 'ImmunoBoost Shield Logo', newValue: 'VitaFit Apple Logo v2', result: 'CONFLICT' },
      { parameter: 'Label Design / Layout', referenceValue: 'Standard Layout C', newValue: 'Standard Layout A', result: 'CONFLICT' },
      {
        parameter: 'Nutrition Table Format',
        referenceValue: 'Detailed (per 100g)',
        newValue: 'Standard (per 2 gummies)',
        result: 'CONFLICT'
      },
      { parameter: 'FSSAI Number', referenceValue: '10023045009922', newValue: '10023045001234', result: 'CONFLICT' },
      {
        parameter: 'Ingredients',
        referenceValue: 'Vitamin C, Zinc, Pectin, Sugar, Citric Acid, Natural Mango Flavour',
        newValue: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour',
        result: 'SIMILAR'
      }
    ],
    overallSimilarity: 20,
    overallResult: 'CONFLICT',
    status: 'Completed',
    history: [],
    approvalAssignments: {},
    comparedBy: 'Priya Sharma',
    comparisonDate: '2026-08-16',
    updatedBy: 'Priya Sharma',
    updatedDate: '2026-08-16'
  }
];
