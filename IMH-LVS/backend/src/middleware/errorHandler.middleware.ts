import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { UnsupportedFileTypeError } from './upload.middleware';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
}

// Single place every route's errors funnel through, so every failure —
// validation, upload, or unexpected — comes back in the same
// { success: false, message } shape the frontend already expects.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof UnsupportedFileTypeError) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, message: 'File is too large. Please upload a smaller file.' });
      return;
    }
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Unexpected server error.' });
}
