import { Brand, Claim, Flavour, ManufacturingCompany, MarketingCompany, ProductCategory } from '../types/masters';

const SYSTEM_ACTOR = 'Aman Kumar';
const SEED_DATE = '2026-01-08';

export const SEED_MARKETING_COMPANIES: MarketingCompany[] = [
  { id: 'MKT-0001', companyName: 'ABC Healthcare', shortCode: 'ABC', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0002', companyName: 'XYZ Healthcare', shortCode: 'XYZ', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0003', companyName: 'NutriCare', shortCode: 'NTC', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0004', companyName: 'Wellness Co', shortCode: 'WEL', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0005', companyName: 'NutriLife Distributors', shortCode: 'NLD', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0006', companyName: 'PureHealth Retail', shortCode: 'PHR', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MKT-0007', companyName: 'OldLine Distributors', shortCode: 'OLD', status: 'Inactive', createdDate: SEED_DATE, updatedDate: '2026-04-01', createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];

export const SEED_MANUFACTURING_COMPANIES: ManufacturingCompany[] = [
  { id: 'MFG-0001', companyName: 'IM Healthcare Pvt. Ltd.', shortCode: 'IMH', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'MFG-0002', companyName: 'IM Healthcare Pvt. Ltd. - Unit II', shortCode: 'IMH2', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];

export const SEED_BRANDS: Brand[] = [
  { id: 'BRD-0001', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0002', brandName: 'NutriPlus', marketingCompany: 'XYZ Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0003', brandName: 'HairCare Plus', marketingCompany: 'ABC Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0004', brandName: 'Wellness Co', marketingCompany: 'Wellness Co', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0005', brandName: 'CalmLife', marketingCompany: 'PureHealth Retail', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  // The brands below were in use by seeded products (data/products.ts) without
  // ever existing in this master list. Products Management tolerates that —
  // its brand dropdown injects the record's current value via
  // withCurrentValue() so an unlisted brand still renders — which is why the
  // gap survived: nothing in the UI ever showed it. It is a real gap all the
  // same. The Masters page under-reported the brands in use, and a product
  // could not be re-saved with the brand it already had unless that injection
  // happened to fire. The backend makes it fail loudly instead: products.brand_name
  // is a foreign key onto brands.brand_name (migration 001), so seeding this
  // data into Postgres stops on the first one.
  //
  // Each is registered to the marketing company of the product that uses it.
  { id: 'BRD-0006', brandName: 'BoneStrong', marketingCompany: 'ABC Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0007', brandName: 'GutHealth', marketingCompany: 'XYZ Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0008', brandName: 'GlowUp', marketingCompany: 'Wellness Co', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0009', brandName: 'KidCare', marketingCompany: 'ABC Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0010', brandName: 'CitraBoost', marketingCompany: 'XYZ Healthcare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'BRD-0011', brandName: 'ImmunoBoost', marketingCompany: 'NutriCare', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];

export const SEED_FLAVOURS: Flavour[] = [
  { id: 'FLV-0001', flavourName: 'Orange', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0002', flavourName: 'Strawberry', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0003', flavourName: 'Mixed Berry', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0004', flavourName: 'Mango', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0005', flavourName: 'Lemon', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0006', flavourName: 'Grape', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0007', flavourName: 'Chocolate', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'FLV-0008', flavourName: 'Unflavoured', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];

export const SEED_CLAIMS: Claim[] = [
  { id: 'CLM-0001', claimText: 'Supports Immunity', description: 'Contains ingredients that support the immune system.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CLM-0002', claimText: 'Sugar Free', description: 'Contains no added sugar.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CLM-0003', claimText: 'High in Vitamin C', description: 'Provides a significant daily value of Vitamin C.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CLM-0004', claimText: 'No Added Preservatives', description: 'Formulated without added preservatives.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];

export const SEED_PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'CAT-0001', categoryName: 'Gummies', description: 'Chewable gummy format supplements.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CAT-0002', categoryName: 'Tablets', description: 'Compressed tablet format supplements.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CAT-0003', categoryName: 'Capsules', description: 'Capsule format supplements.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CAT-0004', categoryName: 'Powder', description: 'Powder format supplements.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'CAT-0005', categoryName: 'Liquid', description: 'Liquid/syrup format supplements.', status: 'Active', createdDate: SEED_DATE, updatedDate: SEED_DATE, createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR }
];
