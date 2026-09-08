// Artworks and the label attributes extracted from them.
//
// An artwork's content is immutable once uploaded: a corrected label is a new
// version, not an edit. So there is no general-purpose PATCH here — only a
// status transition, a storage-key backfill, and a re-extraction that replaces
// the stored reading.

import fs from 'fs';
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
import { ConflictError, DomainError, NotFoundError } from '../middleware/domainError';
import { labelFileUpload } from '../middleware/upload.middleware';
import { artworkFilePath, storeArtworkFile } from '../services/artworkFileStorage.service';

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

function removeTempUpload(file: Express.Multer.File | undefined): void {
  if (!file) return;
  fs.unlink(file.path, (unlinkError) => {
    if (unlinkError) console.error(`Failed to remove temporary upload ${file.path}:`, unlinkError);
  });
}

/**
 * Durably stores the file for an artwork row that already exists.
 *
 * Separate from POST / for the same reason setArtworkStorage is: the row and
 * the upload can fail independently, so the row is created first (with the
 * file metadata the browser already knows — name/type/size) and this closes
 * the loop once the bytes themselves are safely on disk. Refuses a second
 * upload onto an artwork that already has one — content is immutable once
 * uploaded, so replacing it here would silently rewrite a version's bytes
 * instead of creating a new version; a failed first attempt can still retry,
 * since storage_key stays unset until this succeeds.
 */
router.post(
  '/:id/file',
  labelFileUpload,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new DomainError('No file uploaded. Please attach a PDF, JPG or JPEG label file.');

    try {
      const artwork = orNotFound(await getArtworkById(req.params.id), `Artwork "${req.params.id}"`);
      if (artwork.filePath) {
        throw new ConflictError(
          `Artwork "${req.params.id}" already has a stored file. Upload a corrected label as a new version instead.`
        );
      }
      if (file.mimetype !== artwork.fileType) {
        throw new DomainError(
          `Uploaded file type "${file.mimetype}" does not match this artwork's declared file type "${artwork.fileType}".`
        );
      }

      const { storageKey, checksumSha256 } = await storeArtworkFile(req.params.id, file.path, file.mimetype);
      const updated = await setArtworkStorage(req.params.id, storageKey, checksumSha256);
      sendData(res, orNotFound(updated, `Artwork "${req.params.id}"`));
    } finally {
      removeTempUpload(file);
    }
  })
);

/**
 * Serves an artwork's durably-stored file back.
 *
 * The disk path is recomputed from the artwork's own recorded mime type
 * rather than read out of storage_key, which is opaque outside this module —
 * see artworkFileStorage.service.ts.
 */
router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const artwork = orNotFound(await getArtworkById(req.params.id), `Artwork "${req.params.id}"`);
    if (!artwork.filePath) throw new NotFoundError(`Artwork "${req.params.id}" has no stored file.`);

    const diskPath = artworkFilePath(req.params.id, artwork.fileType);
    if (!fs.existsSync(diskPath)) {
      throw new NotFoundError(`Artwork "${req.params.id}"'s file is recorded as stored but is not available.`);
    }

    res.setHeader('Content-Type', artwork.fileType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(artwork.fileName)}"`);
    fs.createReadStream(diskPath).pipe(res);
  })
);

export default router;
