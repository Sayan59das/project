// Product/Version Identification, AI module brief Step 2: given a label's
// already-extracted identity fields, asks ai_backend/ whether they match an
// existing Product — Product Name plus either the Marketing Company or the
// FSSAI licence — via its POST /api/v1/identify-product endpoint
// (ai_backend/app/services/identification.py holds the rule).
//
// An FSSAI licence is issued to the food business operator, not the product:
// one licence sits on every product a company markets, so it can vouch for
// the COMPANY when OCR garbled that string, but never for the product name.
//
// This is a SEPARATE, ADDITIONAL check from productService's
// findPossibleDuplicate (the SQL-based check, which applies the same rule
// but also requires the brand string to match): this one drops the brand
// requirement, so it can still rescue a label whose brand OCR misread. See
// labelIntakeService.ts's submitLabelIntake for where this is consulted, as
// a last-resort check before a genuinely new product gets created.
//
// GUARANTEE, matching aiExtraction.service.ts's own: this never throws. The
// AI backend is optional on-prem infra (OFF unless AI_EXTRACTION_URL is set)
// that may be down, slow, or simply not running, and a label upload must
// never fail — or silently misreport a genuine match as a false
// "unavailable" — because of it.

import { env } from '../config/env';
import { Product } from '../types/domain';

export type ProductIdentificationInput = {
  productName: string;
  brand: string;
  marketingCompany: string;
  fssaiNumber?: string;
};

export type ProductIdentificationResult =
  | { status: 'existing_product_found'; product: Product }
  | { status: 'new_product_no_match' }
  // The AI backend was not configured, unreachable, or answered with
  // something this module doesn't recognise. Deliberately its own state
  // rather than folded into 'new_product_no_match': "the check could not
  // run" and "the check ran and found nothing" are different facts, and a
  // caller that silently treated the first as the second would create a
  // duplicate product exactly when the FSSAI safety net was needed most —
  // during an outage.
  | { status: 'unavailable' };

/** The response shape ai_backend returns (see ai_backend/app/schemas/label.py's Product). */
type AiProduct = {
  product_id: string;
  brand_name: string;
  product_name: string;
  marketing_company: string;
  fssai_number?: string | null;
};

type AiIdentifyResponse = {
  status?: string;
  product?: AiProduct | null;
};

function toAiProduct(product: Product): AiProduct {
  return {
    product_id: product.id,
    brand_name: product.brandName,
    product_name: product.productName,
    marketing_company: product.marketingCompany,
    fssai_number: product.fssaiNumber || null
  };
}

/** Real entry point — always talks to THIS deployment's configured AI backend. */
export function identifyProduct(label: ProductIdentificationInput, existingProducts: Product[]): Promise<ProductIdentificationResult> {
  return identifyProductAt(env.aiExtractionUrl, label, existingProducts);
}

/**
 * Same logic against an explicit base URL — the seam
 * productIdentification.service.test.ts uses to point this at a local fake
 * server instead of the real AI backend, without touching the shared `env`
 * singleton. `node --test` runs test files concurrently in one process, and
 * a temporarily-mutated shared singleton would be visible to whichever other
 * suite happens to read it at the same moment — a real, previously-hit
 * pollution risk in this codebase's test-running model, not a hypothetical
 * one.
 */
export async function identifyProductAt(
  baseUrl: string | undefined,
  label: ProductIdentificationInput,
  existingProducts: Product[]
): Promise<ProductIdentificationResult> {
  if (!baseUrl) return { status: 'unavailable' };

  // /api/v1/identify-product — same router prefix + path convention as
  // aiExtraction.service.ts's /api/v1/read-label; built from the configured
  // origin for the same reason that file's own comment gives.
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/identify-product`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extracted_label: {
          product_name: label.productName || null,
          brand_name: label.brand || null,
          marketing_company: label.marketingCompany || null,
          fssai_number: label.fssaiNumber || null
        },
        existing_products: existingProducts.map(toAiProduct)
      }),
      signal: AbortSignal.timeout(env.aiExtractionTimeoutMs)
    });

    if (!response.ok) {
      throw new Error(`${url} responded ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`${url} returned ${typeof body}, expected a JSON object`);
    }
    const parsed = body as AiIdentifyResponse;

    if (parsed.status === 'Existing Product Found' && parsed.product) {
      // Look the match back up in OUR OWN records rather than trusting the
      // AI backend's echoed copy — it is the source of truth, and its
      // Product type carries fields (status, dates, flavour, ...) the AI
      // backend's narrower schema doesn't even have.
      const match = existingProducts.find((product) => product.id === parsed.product!.product_id);
      if (match) return { status: 'existing_product_found', product: match };
    }
    return { status: 'new_product_no_match' };
  } catch (error) {
    console.warn(
      "[productIdentification] Could not reach ai_backend's identify-product endpoint — continuing without an AI-backed match.",
      error instanceof Error ? error.message : error
    );
    return { status: 'unavailable' };
  }
}
