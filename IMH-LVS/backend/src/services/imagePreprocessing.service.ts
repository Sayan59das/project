// Lightweight OCR preprocessing via sharp. Operates entirely on in-memory
// buffers — the original uploaded file is never modified or overwritten,
// and no extra temp files are created here.
//
// Deliberately simple per the "do not over-engineer this phase" guidance:
// grayscale, upscale small images, normalize contrast, and threshold to
// black/white. Deskew is NOT implemented — see backend/README.md for that
// known limitation.
import sharp from 'sharp';

const MIN_WIDTH_PX = 1600;

export async function preprocessForOcr(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer, { failOn: 'none' });
  const metadata = await image.metadata();

  let pipeline = image.grayscale();

  if (metadata.width && metadata.width < MIN_WIDTH_PX) {
    pipeline = pipeline.resize({ width: MIN_WIDTH_PX });
  }

  return pipeline.normalize().threshold(160).png().toBuffer();
}

// Alternate preprocessing without a hard binary threshold — used as a
// fallback re-attempt (not the default, for performance) when the primary
// pass leaves brand/product-name unrecognized. A single fixed threshold
// value can inconsistently blow out large, bold, high-contrast display
// text (e.g. white text on a saturated color banner), where Tesseract's
// own internal adaptive binarization frequently does better than an
// externally-applied flat cutoff.
export async function preprocessForOcrAlt(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer, { failOn: 'none' });
  const metadata = await image.metadata();

  let pipeline = image.grayscale();

  if (metadata.width && metadata.width < MIN_WIDTH_PX) {
    pipeline = pipeline.resize({ width: MIN_WIDTH_PX });
  }

  return pipeline.normalize().png().toBuffer();
}
