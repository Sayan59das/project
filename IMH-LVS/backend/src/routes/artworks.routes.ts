// Artworks and the label attributes extracted from them.
//
// An artwork's content is immutable once uploaded: a corrected label is a new
// version, not an edit. So there is no general-purpose PATCH here — only a
// status transition, a storage-key backfill, and a re-extraction that replaces
// the stored reading.

import { Router } from 'express';
import {
  createArtwork,
  getArtworkById,
  getArtworks,
  getCrossCompanyCandidates,
  getLabelAttributes,
  getLatestApprovedArtwork,
  setArtworkStorage,
  updateArtworkStatus,
  upsertLabelAttributes,
  type ArtworkCreateInput,
  type LabelAttributesWrite
} from '../repositories/artwork.repository';
import { asyncHandler, optionalString, orNotFound, requireActor, requireString, sendData } from '../controllers/http';
import { ArtworkStatus, ArtworkType, LabelAttributesSource } from '../types/domain';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendData(res, await getArtworks());
  })
);

/**
 * The approved baseline a new label is compared against.
 *
 * `null` rather than a 404 when there is none: a product's first-ever label has
 * nothing to compare against, and that is a normal state the comparison
 * workflow reports, not a missing resource.
 */
router.get(
  '/latest-approved',
  asyncHandler(async (req, res) => {
    const { productId, marketingCompany, artworkType } = req.query;
    if (typeof productId !== 'string' || typeof marketingCompany !== 'string') {
      sendData(res, null);
      return;
    }
    const baseline = await getLatestApprovedArtwork(
      productId,
      marketingCompany,
      typeof artworkType === 'string' ? (artworkType as ArtworkType) : undefined
    );
    sendData(res, baseline ?? null);
  })
);

// The same product name at other marketing companies, each with its own latest
// approved label — what Cross-Company Comparison offers as candidates.
router.get(
  '/cross-company-candidates',
  asyncHandler(async (req, res) => {
    const { productName, excludeMarketingCompany, artworkType } = req.query;
    if (typeof productName !== 'string' || typeof excludeMarketingCompany !== 'string') {
      sendData(res, []);
      return;
    }
    sendData(
      res,
      await getCrossCompanyCandidates(
        productName,
        excludeMarketingCompany,
        typeof artworkType === 'string' ? (artworkType as ArtworkType) : undefined
      )
    );
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    sendData(res, orNotFound(await getArtworkById(req.params.id), `Artwork "${req.params.id}"`));
  })
);

/**
 * What an extractor read off this artwork.
 *
 * `null` when it has never been extracted, which is NOT the same as extracted
 * and empty — the comparison engine must refuse to produce a verdict for the
 * first case rather than reporting thirteen MISSING parameters as though a
 * comparison had run.
 */
router.get(
  '/:id/label-attributes',
  asyncHandler(async (req, res) => {
    orNotFound(await getArtworkById(req.params.id), `Artwork "${req.params.id}"`);
    sendData(res, (await getLabelAttributes(req.params.id)) ?? null);
  })
);

// Records an extraction, replacing any previous one. `source` says where the
// reading came from — 'ocr' for an engine, 'manual' for a human correction —
// so a reviewer can tell them apart.
router.put(
  '/:id/label-attributes',
  asyncHandler(async (req, res) => {
    const body = req.body as { values?: LabelAttributesWrite; source?: LabelAttributesSource; extractionEngine?: string; rawText?: string };
    const stored = await upsertLabelAttributes(
      req.params.id,
      body.values ?? {},
      {
        source: body.source ?? 'manual',
        extractionEngine: body.extractionEngine,
        rawText: body.rawText
      }
    );
    sendData(res, stored);
  })
);

// The version number is issued by the repository under a lock, never accepted
// from the caller — two concurrent uploads must not both be told they are V5.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireString(req.body, 'productId');
    requireString(req.body, 'artworkType');
    requireString(req.body, 'fileName');
    sendData(res, await createArtwork(req.body as ArtworkCreateInput, requireActor(req)), 201);
  })
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const status = requireString(req.body, 'status') as ArtworkStatus;
    const updated = await updateArtworkStatus(
      req.params.id,
      status,
      requireActor(req),
      optionalString(req.body, 'remarks')
    );
    sendData(res, orNotFound(updated, `Artwork "${req.params.id}"`));
  })
);

/**
 * Records where the file landed in object storage.
 *
 * Separate from creation because the row and the upload can fail
 * independently: the row exists first so the file has an id to be keyed by,
 * and this closes the loop once the bytes are durably stored. Until an artwork
 * has a storage key its file is not retrievable, which is the honest state of
 * every record made before object storage existed.
 */
router.put(
  '/:id/storage',
  asyncHandler(async (req, res) => {
    const storageKey = requireString(req.body, 'storageKey');
    const updated = await setArtworkStorage(req.params.id, storageKey, optionalString(req.body, 'checksumSha256'));
    sendData(res, orNotFound(updated, `Artwork "${req.params.id}"`));
  })
);

export default router;
