import { coverageFraction, type OcrLineLike } from './outlinedText.service';
import type { Rectangle } from './tesseract.service';
import type { OcrLine } from './paddleOcr.service';

/**
 * Local type copies for VlmImage and VlmClient from Task 1.
 * TODO(E): import from ./ollamaVlm.service once merged
 */
export type VlmImage = {
  base64: string;
  sentWidth: number;
  sentHeight: number;
  originalWidth: number;
  originalHeight: number;
};

export type VlmClient = {
  askJson: (image: VlmImage, prompt: string, schema: object) => Promise<unknown | null>;
};

export type LogoBox = { x0: number; y0: number; x1: number; y1: number };

export type LogoLocation = { box: LogoBox; source: 'vlm' | 'brand-wordmark' };

/**
 * JSON schema for VLM logo detection response.
 * Expects: { bbox_2d: [x1, y1, x2, y2], label: string }
 */
export const LOGO_BOX_SCHEMA = {
  type: 'object',
  properties: {
    bbox_2d: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
    label: { type: 'string' }
  },
  required: ['bbox_2d', 'label']
};

/**
 * Normalizes text for comparison: lowercase, replace non-alphanumeric (except &'-),
 * collapse whitespace, trim.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9&'\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the VLM prompt for logo detection.
 */
export function buildLogoPrompt(sentWidth: number, sentHeight: number): string {
  return `This image is ${sentWidth}x${sentHeight} pixels. Detect the brand logo — the graphic emblem or symbol mark (not the nutrition table, not paragraphs of text). Output its bounding box as bbox_2d: [x1, y1, x2, y2] in pixel coordinates of this image, and a short label.`;
}

/**
 * Validates a VLM logo box against criteria:
 * - Dimensions: w > 0 && h > 0
 * - Area fraction: [0.0005, 0.12] of page
 * - Aspect ratio: w/h in [0.2, 5]
 * - Coverage by body text: < 0.5
 *
 * Note: This function does not clamp — caller handles clamping.
 */
export function validateVlmBox(
  box: LogoBox,
  pageWidth: number,
  pageHeight: number,
  bodyTextRects: readonly Rectangle[]
): boolean {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;

  // Check positive dimensions
  if (w <= 0 || h <= 0) {
    return false;
  }

  // Check area fraction
  const areaFrac = (w * h) / (pageWidth * pageHeight);
  if (areaFrac < 0.0005 || areaFrac > 0.12) {
    return false;
  }

  // Check aspect ratio
  const aspect = w / h;
  if (aspect < 0.2 || aspect > 5) {
    return false;
  }

  // Check coverage by body text
  const coverage = coverageFraction(box, bodyTextRects);
  if (coverage >= 0.5) {
    return false;
  }

  return true;
}

/**
 * Finds the brand wordmark box from OCR lines.
 * - Normalizes brandText
 * - Finds lines whose normalized text matches exactly OR contains it as a whole token
 * - Selects the TALLEST
 * - Pads by 15% of height on all sides (may go negative — caller clamps)
 * - Returns null if no match or brandText normalizes to empty
 */
export function brandWordmarkBox(ocrLines: readonly OcrLine[], brandText: string): LogoBox | null {
  const b = norm(brandText);
  if (b === '') {
    return null;
  }

  // Find lines matching the brand text
  const matched: OcrLine[] = [];
  const brandTokens = b.split(' ');

  for (const line of ocrLines) {
    const lineNorm = norm(line.text);

    // Exact match
    if (lineNorm === b) {
      matched.push(line);
      continue;
    }

    // Token match: brand tokens are a subset of line tokens
    const lineTokens = lineNorm.split(' ');
    if (brandTokens.every((t) => lineTokens.includes(t))) {
      matched.push(line);
    }
  }

  if (matched.length === 0) {
    return null;
  }

  // Pick the tallest
  let tallest = matched[0];
  for (const line of matched) {
    const h1 = line.box.y1 - line.box.y0;
    const h2 = tallest.box.y1 - tallest.box.y0;
    if (h1 > h2) {
      tallest = line;
    }
  }

  // Pad by 15% of height on all sides
  const height = tallest.box.y1 - tallest.box.y0;
  const pad = 0.15 * height;

  return {
    x0: tallest.box.x0 - pad,
    y0: tallest.box.y0 - pad,
    x1: tallest.box.x1 + pad,
    y1: tallest.box.y1 + pad
  };
}

/**
 * Clamps a box to page boundaries.
 */
function clampBox(box: LogoBox, pageWidth: number, pageHeight: number): LogoBox {
  return {
    x0: Math.max(0, Math.min(box.x0, pageWidth)),
    y0: Math.max(0, Math.min(box.y0, pageHeight)),
    x1: Math.max(0, Math.min(box.x1, pageWidth)),
    y1: Math.max(0, Math.min(box.y1, pageHeight))
  };
}

/**
 * Rounds coordinates to integers.
 */
function roundBox(box: LogoBox): LogoBox {
  return {
    x0: Math.round(box.x0),
    y0: Math.round(box.y0),
    x1: Math.round(box.x1),
    y1: Math.round(box.y1)
  };
}

/**
 * Locates the logo by trying VLM detection first, then falling back to brand wordmark.
 * - bodyTextRects: computed from OCR lines with height < 40px
 * - If VLM succeeds and validates: returns { box, source: 'vlm' }
 * - Otherwise tries brand wordmark fallback
 * - Returns null if neither succeeds
 * - Any error is caught, warned, and returns null
 */
export async function locateLogo(
  pageImage: { width: number; height: number },
  vlmImage: VlmImage | null,
  ocrLines: readonly OcrLine[],
  brandText: string,
  client: VlmClient
): Promise<LogoLocation | null> {
  try {
    // Compute body text rectangles (lines with height < 40px)
    const bodyTextRects = ocrLines
      .filter((l) => l.box.y1 - l.box.y0 < 40)
      .map((l) => ({
        left: l.box.x0,
        top: l.box.y0,
        width: l.box.x1 - l.box.x0,
        height: l.box.y1 - l.box.y0
      }));

    // Try VLM logo detection
    if (vlmImage) {
      const raw = await client.askJson(vlmImage, buildLogoPrompt(vlmImage.sentWidth, vlmImage.sentHeight), LOGO_BOX_SCHEMA);

      if (raw && typeof raw === 'object' && 'bbox_2d' in raw) {
        const bbox_2d = (raw as any).bbox_2d;
        // Check if it's an array of 4 finite numbers
        if (
          Array.isArray(bbox_2d) &&
          bbox_2d.length === 4 &&
          bbox_2d.every((n) => typeof n === 'number' && isFinite(n))
        ) {
          // Scale from VLM image space to page space
          const sx = pageImage.width / vlmImage.sentWidth;
          const sy = pageImage.height / vlmImage.sentHeight;

          const rawBox: LogoBox = {
            x0: bbox_2d[0] * sx,
            y0: bbox_2d[1] * sy,
            x1: bbox_2d[2] * sx,
            y1: bbox_2d[3] * sy
          };

          // Ensure x0 < x1, y0 < y1
          const orderedBox: LogoBox = {
            x0: Math.min(rawBox.x0, rawBox.x1),
            y0: Math.min(rawBox.y0, rawBox.y1),
            x1: Math.max(rawBox.x0, rawBox.x1),
            y1: Math.max(rawBox.y0, rawBox.y1)
          };

          // Clamp and round
          const clampedBox = clampBox(orderedBox, pageImage.width, pageImage.height);
          const roundedBox = roundBox(clampedBox);

          // Validate
          if (validateVlmBox(roundedBox, pageImage.width, pageImage.height, bodyTextRects)) {
            return { box: roundedBox, source: 'vlm' };
          }
        }
      }
    }

    // Fallback to brand wordmark
    const wb = brandWordmarkBox(ocrLines, brandText);
    if (wb) {
      const clampedBox = clampBox(wb, pageImage.width, pageImage.height);
      const roundedBox = roundBox(clampedBox);
      return { box: roundedBox, source: 'brand-wordmark' };
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[logoLocator] error: ${message}`);
    return null;
  }
}
