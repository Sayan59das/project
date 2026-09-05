// Multer configuration for label file uploads. Files are written to a
// temporary disk location only long enough for the request to be handled —
// see controllers/labels.controller.ts, which deletes the file immediately
// after building its (currently placeholder) response. There is no AI/OCR
// provider connected yet; this middleware only validates and stores the
// upload so that step has something to plug into later.
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env';
import { ALLOWED_LABEL_MIME_TYPES } from '../config/constants';

export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Thrown from the fileFilter below so the error-handling middleware can
// tell "wrong file type" apart from other failures and reply with a clear
// 400 instead of a generic 500.
export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported file type "${mimeType}". Please upload a PDF, JPG or JPEG file.`);
    this.name = 'UnsupportedFileTypeError';
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Shared by every label upload route — a single place that knows the
// storage location, size limit, and allowed file types, so a new route
// (e.g. the two-file comparison upload below) can never accidentally apply
// different validation rules than the rest of the app.
const labelUpload = multer({
  storage,
  limits: { fileSize: env.maxUploadFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_LABEL_MIME_TYPES.includes(file.mimetype)) {
      callback(new UnsupportedFileTypeError(file.mimetype));
      return;
    }
    callback(null, true);
  }
});

export const labelFileUpload = labelUpload.single('file');

// POST /api/labels/compare accepts two files under distinct field names
// (labelA, labelB) rather than a two-item array, so the controller never
// has to guess which uploaded file is which side of the comparison.
export const labelPairUpload = labelUpload.fields([
  { name: 'labelA', maxCount: 1 },
  { name: 'labelB', maxCount: 1 }
]);
