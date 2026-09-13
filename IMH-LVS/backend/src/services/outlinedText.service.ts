import type { Rectangle } from './tesseract.service';
import type { TextSpan } from './pdf.service';

export type OcrLineLike = {
  text: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

export type OcrStrip = { left: number; width: number };

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

/**
 * Filters out OCR lines that are cut by a strip boundary. A line that straddles
 * a boundary between two strips is a fragment in both strips; the complete word
 * lives in another strip and will be recovered there. Operates on boxes in
 * strip-local coordinates (x from 0 to strip.width).
 *
 * WHY: cut-off text at a strip boundary is never a valid candidate — it is a
 * fragment of a word whose complete form appears whole inside some strip.
 *
 * Drops a line if:
 * - The strip is not at the page's left edge AND the line touches the left cut
 *   (x0 <= marginPx)
 * - The strip is not at the page's right edge AND the line touches the right cut
 *   (x1 >= strip.width - marginPx)
 *
 * Lines in a strip at the page's left edge keep left-touching lines; likewise
 * for the page's right edge.
 */
export function dropStripEdgeLines<T extends { box: { x0: number; x1: number } }>(
  lines: readonly T[],
  strip: { left: number; width: number },
  pageWidth: number,
  marginPx = 6
): T[] {
  return lines.filter(line => {
    // Strip does not start at page left edge: drop lines touching the left cut
    if (strip.left > 0 && line.box.x0 <= marginPx) {
      return false;
    }

    // Strip does not end at page right edge: drop lines touching the right cut
    if (strip.left + strip.width < pageWidth && line.box.x1 >= strip.width - marginPx) {
      return false;
    }

    return true;
  });
}

/**
 * Plans OCR strips for strip-wise OCR: the text-layer panel ranges (padded) and
 * the wide gaps between them. Prevents cross-panel merging by the OCR detector.
 *
 * WHY: PP-OCR on the whole page merges same-baseline text across neighbouring
 * panels, hiding the front panel's display text. Strip-wise OCR isolates each
 * panel and every silent gap, so the detector cannot merge across panels.
 *
 * For each panel range, pads by padPx on both sides (clamped to [0, pageWidth]),
 * merges overlapping/touching ranges, and yields panel strips. Gap strips are
 * every uncovered interval (including [0, firstLeft) and (lastRight, pageWidth])
 * whose width >= minGapFraction * pageWidth. Returns all strips sorted by left,
 * each with integer values (Math.round), width >= 1.
 */
export function planOcrStrips(
  panelXRanges: readonly { left: number; right: number }[],
  pageWidth: number,
  padPx: number,
  minGapFraction = 0.08
): OcrStrip[] {
  // No ranges → whole page is one strip
  if (panelXRanges.length === 0) {
    return [{ left: 0, width: pageWidth }];
  }

  // Pad each range by padPx on both sides, clamp to [0, pageWidth]
  let paddedRanges = panelXRanges.map(r => ({
    left: Math.max(0, Math.round(r.left - padPx)),
    right: Math.min(pageWidth, Math.round(r.right + padPx))
  }));

  // Sort by left
  paddedRanges.sort((a, b) => a.left - b.left);

  // Merge overlapping/touching ranges
  const merged: Array<{ left: number; right: number }> = [];
  for (const range of paddedRanges) {
    if (merged.length === 0) {
      merged.push(range);
    } else {
      const last = merged[merged.length - 1];
      if (range.left <= last.right) {
        // Overlapping or touching; merge by extending right
        last.right = Math.max(last.right, range.right);
      } else {
        // No overlap; add as new range
        merged.push(range);
      }
    }
  }

  // Build the result: panel strips + gap strips
  const strips: OcrStrip[] = [];
  const minGapWidth = minGapFraction * pageWidth;

  for (const range of merged) {
    // Add panel strip
    strips.push({
      left: range.left,
      width: Math.max(1, range.right - range.left)
    });
  }

  // Add gap strips: every uncovered interval whose width >= minGapWidth
  let prevRight = 0;
  for (const range of merged) {
    const gapWidth = range.left - prevRight;
    if (gapWidth >= minGapWidth) {
      strips.push({
        left: prevRight,
        width: Math.max(1, range.left - prevRight)
      });
    }
    prevRight = range.right;
  }

  // Add final gap if it exceeds minGapWidth
  const finalGapWidth = pageWidth - prevRight;
  if (finalGapWidth >= minGapWidth) {
    strips.push({
      left: prevRight,
      width: Math.max(1, pageWidth - prevRight)
    });
  }

  // Sort by left and return
  strips.sort((a, b) => a.left - b.left);
  return strips;
}
