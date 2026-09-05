import fs from 'fs';
import { Request, Response } from 'express';
import { buildPlaceholderExtraction, extractLabelFromFile, LabelExtractionResult } from '../services/labelExtraction.service';
import { compareLabels as compareLabelData } from '../services/labelComparison.service';

const EXTRACTION_RESULT_KEYS: (keyof LabelExtractionResult)[] = [
  'marketingCompany',
  'address',
  'fssaiNumber',
  'email',
  'customerCareNumber',
  'brand',
  'flavour',
  'productName',
  'packageSize',
  'manufacturingCompany'
];

// Accepts only a plain object whose extraction-result fields are all
// strings (missing fields default to ''), rejecting anything else — this
// endpoint trusts the caller already ran extraction, but never trusts the
// shape of what it's handed.
function parseExtractionResult(value: unknown): LabelExtractionResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result = {} as LabelExtractionResult;
  for (const key of EXTRACTION_RESULT_KEYS) {
    const field = record[key];
    if (field !== undefined && typeof field !== 'string') return null;
    result[key] = typeof field === 'string' ? field : '';
  }
  return result;
}

// POST /api/labels/extract — validates the uploaded label file (see
// middleware/upload.middleware.ts for type/size checks), runs it through
// open-source Tesseract OCR, and returns the structured result. This
// controller has no OCR logic of its own and doesn't know how extraction is
// implemented internally — see services/labelExtraction.service.ts.
// extractLabelFromFile() never throws for OCR-side problems (corrupt file,
// no usable text, missing OCR tooling) — it already falls back to the
// blank-field placeholder itself. The try/catch here only guards against
// something failing outside that (e.g. the temp file itself being
// unreadable), so the response contract stays identical either way.
export async function extractLabel(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: 'No file uploaded. Please attach a PDF, JPG or JPEG label file.' });
    return;
  }

  try {
    const data = await extractLabelFromFile(file.path, file.mimetype);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the extraction result:', error instanceof Error ? error.message : error);
    res.status(200).json({ success: true, data: buildPlaceholderExtraction() });
  } finally {
    removeTempFile(file);
  }
}

function removeTempFile(file: Express.Multer.File | undefined) {
  if (!file) return;
  fs.unlink(file.path, (unlinkError) => {
    if (unlinkError) console.error(`Failed to remove temporary upload ${file.path}:`, unlinkError);
  });
}

// POST /api/labels/compare — V1 of Label Comparison. Validates both
// uploaded files (see middleware/upload.middleware.ts's labelPairUpload,
// which applies the exact same type/size rules as /extract), runs EACH
// one through the same extractLabelFromFile() pipeline /extract uses (no
// separate/duplicated OCR logic here), then hands both structured results
// to labelComparison.service.ts for the field-by-field comparison. Like
// extractLabel above, extraction itself never throws — an unreadable or
// content-free label comes back as a normal, fully-blank extraction
// result, which the comparison service reports as MISSING/NOT_COMPARED
// fields rather than an error. The try/catch here only guards against a
// genuinely unexpected failure outside that (e.g. a temp file becoming
// unreadable mid-request).
export async function compareLabels(req: Request, res: Response) {
  const files = req.files as { labelA?: Express.Multer.File[]; labelB?: Express.Multer.File[] } | undefined;
  const fileA = files?.labelA?.[0];
  const fileB = files?.labelB?.[0];

  if (!fileA || !fileB) {
    removeTempFile(fileA);
    removeTempFile(fileB);
    const message = !fileA && !fileB ? 'Both Label A and Label B files are required.' : !fileA ? 'Label A file is required.' : 'Label B file is required.';
    res.status(400).json({ success: false, message });
    return;
  }

  try {
    const [labelA, labelB] = await Promise.all([
      extractLabelFromFile(fileA.path, fileA.mimetype),
      extractLabelFromFile(fileB.path, fileB.mimetype)
    ]);
    const comparison = compareLabelData(labelA, labelB);
    res.status(200).json({ success: true, data: { labelA, labelB, comparison } });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the comparison result:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: 'Could not compare the uploaded labels. Please try again.' });
  } finally {
    removeTempFile(fileA);
    removeTempFile(fileB);
  }
}

// POST /api/labels/compare-extracted — supports Quick Label Comparison's
// "one new artwork vs. the automatically-selected latest approved artwork"
// workflow. Unlike /compare above, this endpoint never touches OCR or
// files: the frontend (the only place that knows Product/Artwork/Approval
// data — this backend has no database) has already extracted BOTH labels
// itself, one via /extract for the uploaded artwork and one via /extract
// for the approved baseline it fetched. This is a pure JSON-in/JSON-out
// wrapper around the exact same compareLabelData() used by /compare, so
// the weighted comparison logic is never duplicated — only OCR is skipped
// here because it was already done.
export function compareExtractedLabels(req: Request, res: Response) {
  const body = req.body as { labelA?: unknown; labelB?: unknown } | undefined;
  const labelA = parseExtractionResult(body?.labelA);
  const labelB = parseExtractionResult(body?.labelB);

  if (!labelA || !labelB) {
    res.status(400).json({ success: false, message: 'Both labelA and labelB extraction results are required.' });
    return;
  }

  const comparison = compareLabelData(labelA, labelB);
  res.status(200).json({ success: true, data: { labelA, labelB, comparison } });
}
