import type { Rectangle } from './tesseract.service';
import type { TextSpan } from './pdf.service';

export type OcrLineLike = {
  text: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

/**
 * Projects a PDF text span (user-space coordinates, y growing upward) to pixel
 * coordinates (image space, y growing downward). Applies rotation, scale, and
 * y-axis flip.
 */
export function projectSpanToPixels(
  span: Pick<TextSpan, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  pageHeightPt: number,
  dpi: number
): Rectangle {
  const s = dpi / 72;

  // Corners of the span in PDF space: (x, y) + offset
  const corners = [
    [0, 0],
    [span.width, 0],
    [span.width, span.height],
    [0, span.height]
  ];

  // Rotate and translate each corner
  const c = Math.cos(span.rotation);
  const n = Math.sin(span.rotation);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [px, py] of corners) {
    // Rotate around origin, then translate by (span.x, span.y)
    const X = px * c - py * n + span.x;
    const Y = px * n + py * c + span.y;

    minX = Math.min(minX, X);
    maxX = Math.max(maxX, X);
    minY = Math.min(minY, Y);
    maxY = Math.max(maxY, Y);
  }

  // Convert to pixel space with y-flip and scale
  return {
    left: minX * s,
    top: (pageHeightPt - maxY) * s,
    width: (maxX - minX) * s,
    height: (maxY - minY) * s
  };
}

/**
 * Calculates what fraction of an OCR box is covered by the given rectangles.
 * Returns a value in [0, 1], capped at 1 even if overlaps exceed the box area.
 */
export function coverageFraction(
  box: OcrLineLike['box'],
  rects: readonly Rectangle[]
): number {
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);

  if (area <= 0) {
    return 0;
  }

  let sum = 0;
  for (const r of rects) {
    // Clipped intersection area between box and rect
    const left = Math.max(box.x0, r.left);
    const right = Math.min(box.x1, r.left + r.width);
    const top = Math.max(box.y0, r.top);
    const bottom = Math.min(box.y1, r.top + r.height);

    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    sum += w * h;
  }

  return Math.min(1, sum / area);
}

/**
 * Returns true if text looks like genuine display text (not noise, labels, or junk).
 * Filters by letter count, token count, and symbol density.
 */
export function looksLikeDisplayText(text: string): boolean {
  const t = text.trim();

  if (t === '') {
    return false;
  }

  const tokens = t.split(/\s+/);
  const letterMatches = t.match(/[A-Za-z]/g) || [];
  const letters = letterMatches.length;

  // Count characters NOT matching the allowed set
  const oddMatches = t.match(/[^A-Za-z0-9\s\-&'.]/g) || [];
  const odd = oddMatches.length;

  // Tokens with at least one digit
  const digitTokens = tokens.filter(tok => /\d/.test(tok)).length;

  return (
    letters >= 3 &&
    tokens.length <= 6 &&
    odd / t.length <= 0.2 &&
    digitTokens <= 2
  );
}

export type OutlinedLineOptions = {
  maxCoverage?: number;
  minConfidence?: number;
  minHeightPx?: number;
};

/**
 * Finds OCR lines that appear to be outlined (uncovered by PDF text spans).
 * Filters by confidence, height, display-text plausibility, and span coverage.
 * Returns results sorted by height (descending), then y0 (ascending), with
 * duplicates removed based on normalized text.
 */
export function findOutlinedLines(
  lines: readonly OcrLineLike[],
  spanRects: readonly Rectangle[],
  options?: OutlinedLineOptions
): OcrLineLike[] {
  const { maxCoverage = 0.3, minConfidence = 0.6, minHeightPx = 40 } = options ?? {};

  // Filter lines by all criteria
  const filtered = lines.filter(line => {
    const height = line.box.y1 - line.box.y0;
    const coverage = coverageFraction(line.box, spanRects);

    return (
      line.confidence >= minConfidence &&
      height >= minHeightPx &&
      looksLikeDisplayText(line.text) &&
      coverage <= maxCoverage
    );
  });

  // Sort by height (descending), then by y0 (ascending)
  const sorted = filtered.sort((a, b) => {
    const heightA = a.box.y1 - a.box.y0;
    const heightB = b.box.y1 - b.box.y0;

    if (heightB !== heightA) {
      return heightB - heightA; // descending
    }
    return a.box.y0 - b.box.y0; // ascending
  });

  // Dedupe by normalized text (case-insensitive, whitespace normalized)
  // Keep the first (tallest) occurrence
  const seen = new Set<string>();
  const deduped: OcrLineLike[] = [];

  for (const line of sorted) {
    const normalized = line.text.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(line);
    }
  }

  return deduped;
}
