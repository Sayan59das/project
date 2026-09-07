// Label-driven product intake pipeline:
//
//   Upload Label -> Read Label Information -> Extract Details ->
//   Identify/Create Product -> Save Product + Artwork -> Continue to
//   Comparison Workflow (unchanged — see comparisonService.ts)
//
// This is now the ONLY path that creates a Product record — manual
// "Add Product" has been removed from Product Management (see
// ProductsPage). It never creates a duplicate product: an exact Product
// Name + Brand + Marketing Company match (the same identity rule Product
// Management already used for its own duplicate check) reuses the existing
// product; anything short of that is surfaced to the caller (ArtworkPage)
// as either an exact match or a list of "possible" matches so the account
// manager resolves the ambiguity explicitly instead of the system guessing.

import { RoleId } from '../auth/permissions';
import { Artwork, ArtworkType } from '../types/artwork';
import { Product, ProductInput } from '../types/product';
import { LabelAttributes } from '../types/comparison';
import { FIXED_MANUFACTURING_COMPANY } from '../types/extraction';
import { createArtwork } from './artworkService';
import {
  createProduct,
  findPossibleDuplicate,
  getProductById,
  selectByBrandAndCompany,
  selectExactMatch,
  setProductSourceArtwork,
  updateProduct
} from './productService';
import { getOrCreateBrand, getOrCreateFlavour, getOrCreateManufacturingCompany, getOrCreateMarketingCompany } from './masterService';
import { saveLabelAttributes } from './comparisonService';

export type LabelIntakeExtractedFields = {
  productName: string;
  marketingCompanyName: string;
  address: string;
  fssaiNumber: string;
  email: string;
  customerCareNumber: string;
  brand: string;
  flavour: string;
  packageSize: string;
};

export type LabelIntakeFile = {
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
};

export type LabelIntakeInput = {
  extracted: LabelIntakeExtractedFields;
  artworkType: ArtworkType;
  remarks: string;
  file: LabelIntakeFile;
  // Set when the caller (ArtworkPage) already had the user resolve which
  // existing product this label belongs to — e.g. picked one from the
  // "possible matches" list. Skips the exact-match auto-detect below.
  linkToProductId?: string;
};

export type LabelIntakeResult = {
  product: Product;
  artwork: Artwork;
  isNewProduct: boolean;
};

export type Actor = { id: string; name: string; role: RoleId };

const REQUIRED_FIELD_LABELS: [keyof LabelIntakeExtractedFields, string][] = [
  ['productName', 'Product Name'],
  ['marketingCompanyName', 'Party'],
  ['brand', 'Brand'],
  ['flavour', 'Flavour'],
  ['packageSize', 'Package Size'],
  ['fssaiNumber', 'FSSAI Number'],
  ['email', 'Email'],
  ['customerCareNumber', 'Customer Care Number'],
  ['address', 'Address']
];

// Exact identity match only — Product Name + Brand + Marketing Company, the
// same rule Product Management uses for its own duplicate check.
//
// A SELECTOR over a list the caller already holds, not a lookup request. The
// upload form re-runs this on every keystroke in three fields; against the API
// that would be a request per character, and the answer is in rows the page has
// already fetched. The server's /products/possible-duplicate exists for callers
// that hold no list (see productService.findPossibleDuplicate).
export function findExactProductMatch(products: Product[], extracted: LabelIntakeExtractedFields): Product | undefined {
  if (!extracted.productName.trim() || !extracted.brand.trim() || !extracted.marketingCompanyName.trim()) return undefined;
  return selectExactMatch(products, {
    productName: extracted.productName,
    brandName: extracted.brand,
    marketingCompany: extracted.marketingCompanyName
  });
}

// Same Brand + Marketing Company but not an exact identity match (different
// or not-yet-entered Product Name) — plausible matches ("multiple possible
// products match", per the task's error-handling requirements) that need a
// human decision, never an automatic pick.
export function findPossibleProductMatches(products: Product[], extracted: LabelIntakeExtractedFields): Product[] {
  if (!extracted.brand.trim() || !extracted.marketingCompanyName.trim()) return [];
  const exact = findExactProductMatch(products, extracted);
  return selectByBrandAndCompany(products, extracted.brand, extracted.marketingCompanyName).filter(
    (product) => product.id !== exact?.id
  );
}

// Async because the masters it reuses live in the database now. Everything
// after that step is still synchronous localStorage (products, artworks) and is
// the next thing to move; the await is deliberately at the top so a masters
// failure aborts BEFORE any product or artwork row is written, rather than
// leaving an artwork pointing at a brand that was never created.
export async function submitLabelIntake(input: LabelIntakeInput): Promise<LabelIntakeResult> {
  const { extracted } = input;

  const missing = REQUIRED_FIELD_LABELS.filter(([key]) => !extracted[key].trim()).map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`Cannot save — the following label fields are missing or unverified: ${missing.join(', ')}.`);
  }

  // Reuse existing Masters wherever possible; only create a new master record
  // when the extracted name genuinely doesn't exist yet. No actor argument —
  // the server records who did this from the session.
  //
  // Sequential, not Promise.all: the brand's marketing company must exist
  // before the brand referencing it by name can be inserted (that reference is
  // a foreign key onto marketing_companies.company_name), and running them
  // together loses that ordering.
  await getOrCreateManufacturingCompany(FIXED_MANUFACTURING_COMPANY);
  await getOrCreateMarketingCompany(extracted.marketingCompanyName);
  await getOrCreateBrand(extracted.brand, extracted.marketingCompanyName);
  await getOrCreateFlavour(extracted.flavour);

  let product: Product | undefined;
  let isNewProduct = false;

  if (input.linkToProductId) {
    product = await getProductById(input.linkToProductId);
    if (!product) throw new Error('The product selected to link this artwork to could not be found.');
  } else {
    // Matched against the server's own answer rather than the list the form was
    // showing: the upload form's copy can be minutes old, and creating a second
    // product for a label somebody else just uploaded is exactly what this
    // check exists to prevent.
    product = await findPossibleDuplicate({
      productName: extracted.productName,
      brandName: extracted.brand,
      marketingCompany: extracted.marketingCompanyName
    });
  }

  if (product) {
    // Existing product — never duplicated. Bring its Flavour/FSSAI/Package
    // Size in line with what this label actually shows, since that's the
    // more current source of truth, without touching its identity fields.
    const updates: Partial<ProductInput> = {};
    if (product.flavour.trim().toLowerCase() !== extracted.flavour.trim().toLowerCase()) updates.flavour = extracted.flavour;
    if (product.fssaiNumber.trim() !== extracted.fssaiNumber.trim()) updates.fssaiNumber = extracted.fssaiNumber;
    if ((product.packageSize ?? '').trim() !== extracted.packageSize.trim()) updates.packageSize = extracted.packageSize;
    if (Object.keys(updates).length > 0) {
      product = (await updateProduct(product.id, updates)) ?? product;
    }
  } else {
    const newProductInput: ProductInput = {
      productName: extracted.productName,
      brandName: extracted.brand,
      marketingCompany: extracted.marketingCompanyName,
      manufacturingCompany: FIXED_MANUFACTURING_COMPANY,
      flavour: extracted.flavour,
      fssaiNumber: extracted.fssaiNumber,
      packageSize: extracted.packageSize,
      status: 'Active'
    };
    product = await createProduct(newProductInput, { origin: 'Label Upload' });
    isNewProduct = true;
  }

  // No version is computed or sent: the server issues it under a lock for this
  // product+company+type line. The version the upload form displays is a
  // suggestion for the person looking at it, and is deliberately not passed
  // through — two uploads racing must not both be recorded as V5.
  //
  // No actor either. Every write below records who did it from the session
  // cookie, so there is nothing left for the caller to tell us.
  const artwork = await createArtwork(
    {
      productId: product.id,
      productName: product.productName,
      brand: extracted.brand,
      marketingCompany: extracted.marketingCompanyName,
      manufacturingCompany: FIXED_MANUFACTURING_COMPANY,
      artworkType: input.artworkType,
      fileName: input.file.fileName,
      fileType: input.file.fileType,
      fileSize: input.file.fileSize,
      filePath: input.file.filePath,
      status: 'Draft',
      remarks: input.remarks
    }
  );

  if (isNewProduct) {
    // Provenance, recorded after the artwork exists. A failure here would lose
    // the link but not the product or the artwork, so it must not be allowed to
    // fail the whole intake — the caller is being told the upload worked, and
    // it did.
    product = (await setProductSourceArtwork(product.id, artwork.id).catch(() => undefined)) ?? product;
  }

  const labelAttributes: LabelAttributes = {
    artworkId: artwork.id,
    brandName: extracted.brand,
    productName: extracted.productName,
    address: extracted.address,
    customerCareNumber: extracted.customerCareNumber,
    customerCareEmail: extracted.email,
    colourTheme: 'Not specified',
    flavour: extracted.flavour,
    claims: 'Not specified',
    logo: 'Not specified',
    labelDesign: 'Not specified',
    nutritionTableFormat: 'Not specified',
    fssaiNumber: extracted.fssaiNumber,
    ingredients: 'Not specified'
  };
  // Awaited: this is what the comparison engine reads later, and an intake that
  // reported success while the reading failed to store would produce a
  // comparison against MISSING values with no sign anything went wrong.
  await saveLabelAttributes(labelAttributes);

  return { product, artwork, isNewProduct };
}
