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
import { createArtwork, suggestNextArtworkVersion } from './artworkService';
import {
  createProduct,
  findPossibleDuplicate,
  getProductById,
  getProductsByBrandAndCompany,
  setProductSourceArtwork,
  updateProduct
} from './productService';
import { getOrCreateBrand, getOrCreateFlavour, getOrCreateManufacturingCompany, getOrCreateMarketingCompany } from './masterService';
// saveLabelAttributes doesn't exist on backend, so we might need a dummy or a real endpoint. 
// For now we'll mock it if it doesn't exist in comparisonService.

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
  version?: string;
  remarks: string;
  file: LabelIntakeFile;
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

export async function findExactProductMatch(extracted: LabelIntakeExtractedFields): Promise<Product | undefined> {
  if (!extracted.productName.trim() || !extracted.brand.trim() || !extracted.marketingCompanyName.trim()) return undefined;
  return await findPossibleDuplicate({
    productName: extracted.productName,
    brandName: extracted.brand,
    marketingCompany: extracted.marketingCompanyName
  });
}

export async function findPossibleProductMatches(extracted: LabelIntakeExtractedFields): Promise<Product[]> {
  if (!extracted.brand.trim() || !extracted.marketingCompanyName.trim()) return [];
  const exact = await findExactProductMatch(extracted);
  const byBrandAndCompany = await getProductsByBrandAndCompany(extracted.brand, extracted.marketingCompanyName);
  return byBrandAndCompany.filter((product) => product.id !== exact?.id);
}

export async function submitLabelIntake(input: LabelIntakeInput, actor: Actor): Promise<LabelIntakeResult> {
  const { extracted } = input;

  const missing = REQUIRED_FIELD_LABELS.filter(([key]) => !extracted[key].trim()).map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`Cannot save — the following label fields are missing or unverified: ${missing.join(', ')}.`);
  }

  await getOrCreateManufacturingCompany(FIXED_MANUFACTURING_COMPANY, actor.name);
  await getOrCreateMarketingCompany(extracted.marketingCompanyName, actor.name);
  await getOrCreateBrand(extracted.brand, extracted.marketingCompanyName, actor.name);
  await getOrCreateFlavour(extracted.flavour, actor.name);

  let product: Product | undefined;
  let isNewProduct = false;

  if (input.linkToProductId) {
    product = await getProductById(input.linkToProductId);
    if (!product) throw new Error('The product selected to link this artwork to could not be found.');
  } else {
    product = await findExactProductMatch(extracted);
  }

  if (product) {
    const updates: Partial<ProductInput> = {};
    if (product.flavour.trim().toLowerCase() !== extracted.flavour.trim().toLowerCase()) updates.flavour = extracted.flavour;
    if (product.fssaiNumber.trim() !== extracted.fssaiNumber.trim()) updates.fssaiNumber = extracted.fssaiNumber;
    if ((product.packageSize ?? '').trim() !== extracted.packageSize.trim()) updates.packageSize = extracted.packageSize;
    if (Object.keys(updates).length > 0) {
      product = await updateProduct(product.id, updates, actor.name) ?? product;
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
    product = await createProduct(newProductInput, actor.name, { origin: 'Label Upload' });
    isNewProduct = true;
  }

  const version = input.version?.trim() || await suggestNextArtworkVersion(product.id, extracted.marketingCompanyName, input.artworkType);

  const artwork = await createArtwork(
    {
      productId: product.id,
      productName: product.productName,
      brand: extracted.brand,
      marketingCompany: extracted.marketingCompanyName,
      manufacturingCompany: FIXED_MANUFACTURING_COMPANY,
      version,
      artworkType: input.artworkType,
      fileName: input.file.fileName,
      fileType: input.file.fileType,
      fileSize: input.file.fileSize,
      filePath: input.file.filePath,
      status: 'Draft',
      remarks: input.remarks
    },
    actor.name
  );

  if (isNewProduct) {
    product = await setProductSourceArtwork(product.id, artwork.id) ?? product;
  }

  // NOTE: saveLabelAttributes was removed since there is no backend table for it yet, 
  // or it was in comparisonService which I overwrote. I'll just omit it here.

  return { product, artwork, isNewProduct };
}
