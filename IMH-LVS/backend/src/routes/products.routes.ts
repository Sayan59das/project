// Products.
//
// Deletion is not offered. Artworks, comparisons and approval history all
// reference a product, so removing one would either orphan an audit trail or
// be refused by a foreign key; the app deactivates instead, which is what
// DELETE maps to here.

import { Router } from 'express';
import {
  createProduct,
  deactivateProduct,
  findPossibleDuplicate,
  getProductById,
  getProducts,
  getProductsByBrandAndCompany,
  updateProduct
} from '../repositories/product.repository';
import { getArtworksByProduct } from '../repositories/artwork.repository';
import { getComparisonsByProduct } from '../repositories/comparison.repository';
import { asyncHandler, orNotFound, requireActor, sendData } from '../controllers/http';
import { ProductInput } from '../types/domain';

const router = Router();

/**
 * The product list, optionally narrowed.
 *
 * `?brand=&marketingCompany=` is the label-intake lookup: when an uploaded
 * label cannot be matched to one exact product, the operator picks from the
 * products sharing its brand and marketing company. It is a filter on this
 * route rather than a separate endpoint because it returns the same records.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const brand = req.query.brand;
    const marketingCompany = req.query.marketingCompany;

    if (typeof brand === 'string' && typeof marketingCompany === 'string') {
      sendData(res, await getProductsByBrandAndCompany(brand, marketingCompany));
      return;
    }
    sendData(res, await getProducts());
  })
);

/**
 * Whether a product with this name, brand and marketing company already exists.
 *
 * Asked BEFORE creating one, so the operator sees the existing record instead
 * of adding a second product for the same label. Not a constraint — two
 * companies legitimately market products of the same name — so it answers with
 * the match rather than refusing.
 */
router.get(
  '/possible-duplicate',
  asyncHandler(async (req, res) => {
    const { productName, brandName, marketingCompany } = req.query;
    if (typeof productName !== 'string' || typeof brandName !== 'string' || typeof marketingCompany !== 'string') {
      sendData(res, null);
      return;
    }
    const match = await findPossibleDuplicate({ productName, brandName, marketingCompany });
    sendData(res, match ?? null);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    sendData(res, orNotFound(await getProductById(req.params.id), `Product "${req.params.id}"`));
  })
);

// The Product detail page's two tabs, served from the tables that own them
// rather than by filtering a full list client-side.
router.get(
  '/:id/artworks',
  asyncHandler(async (req, res) => {
    orNotFound(await getProductById(req.params.id), `Product "${req.params.id}"`);
    sendData(res, await getArtworksByProduct(req.params.id));
  })
);

router.get(
  '/:id/comparisons',
  asyncHandler(async (req, res) => {
    orNotFound(await getProductById(req.params.id), `Product "${req.params.id}"`);
    sendData(res, await getComparisonsByProduct(req.params.id));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as ProductInput & { origin?: 'Label Upload' | 'Manual Entry'; sourceArtworkId?: string };
    // origin/sourceArtworkId are provenance the label-intake pipeline supplies
    // and a manual creation does not, so they travel separately from the
    // product's own fields.
    const meta = body.origin ? { origin: body.origin, sourceArtworkId: body.sourceArtworkId } : undefined;
    sendData(res, await createProduct(body, requireActor(req), meta), 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const updated = await updateProduct(req.params.id, req.body as Partial<ProductInput>, requireActor(req));
    sendData(res, orNotFound(updated, `Product "${req.params.id}"`));
  })
);

// Deactivation, not deletion — see the note at the top of this file.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deactivated = await deactivateProduct(req.params.id, requireActor(req));
    sendData(res, orNotFound(deactivated, `Product "${req.params.id}"`));
  })
);

export default router;
