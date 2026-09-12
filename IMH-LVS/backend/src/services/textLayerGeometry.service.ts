import type { TextSpan } from './pdf.service';

export type TextLine = {
  page: number;
  /** Span texts joined by one space, in along-axis order. */
  text: string;
  /** Rotation bucket the line belongs to (radians, rounded to 2 dp). */
  rotation: number;
  /** Along-axis start and extent (for rotation 0: x and width). */
  along: number;
  extent: number;
  /** Cross-axis coordinate of the baseline (for rotation 0: y). */
  cross: number;
  /** Largest span font size on the line. */
  fontSize: number;
  spans: TextSpan[];
};

export type Panel = { page: number; rotation: number; lines: TextLine[] };

// Returns 0 for empty input; median of span.fontSize otherwise.
export function medianFontSize(spans: readonly TextSpan[]): number {
  if (spans.length === 0) return 0;
  const sorted = Array.from(spans).sort((a, b) => a.fontSize - b.fontSize);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid].fontSize;
  }
  return (sorted[mid - 1].fontSize + sorted[mid].fontSize) / 2;
}

// Convert span coordinates to along/cross based on rotation.
function spanGeometry(span: TextSpan): { along: number; cross: number } {
  const r = span.rotation;
  const along = span.x * Math.cos(r) + span.y * Math.sin(r);
  const cross = -span.x * Math.sin(r) + span.y * Math.cos(r);
  return { along, cross };
}

// Rotation bucket rounded to 2 decimal places.
function rotationBucket(rotation: number): number {
  return Math.round(rotation * 100) / 100;
}

// Groups spans into lines by (page, rotation bucket), handling baseline proximity.
export function groupSpansIntoLines(spans: readonly TextSpan[]): TextLine[] {
  // Filter out empty spans
  const nonEmpty = Array.from(spans).filter((s) => s.text.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  // Group by (page, rotation bucket)
  const groups = new Map<string, TextSpan[]>();
  for (const span of nonEmpty) {
    const bucket = rotationBucket(span.rotation);
    const key = `${span.page}|${bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(span);
  }

  const allLines: TextLine[] = [];

  for (const groupSpans of groups.values()) {
    // Sort by cross DESC then along ASC
    groupSpans.sort((a, b) => {
      const aGeo = spanGeometry(a);
      const bGeo = spanGeometry(b);
      const crossDiff = bGeo.cross - aGeo.cross;
      if (Math.abs(crossDiff) > 0.001) return crossDiff;
      return aGeo.along - bGeo.along;
    });

    const lines: TextLine[] = [];
    let currentLine: TextLine | null = null;

    for (const span of groupSpans) {
      const geo = spanGeometry(span);
      if (currentLine === null) {
        // Start a new line with this span
        currentLine = {
          page: span.page,
          text: span.text.trim(),
          rotation: rotationBucket(span.rotation),
          along: geo.along,
          extent: span.width,
          cross: geo.cross,
          fontSize: span.fontSize,
          spans: [span],
        };
      } else {
        // Check if span joins the current line
        const crossThreshold = 0.5 * Math.min(span.fontSize, currentLine.fontSize);
        const crossOk = Math.abs(geo.cross - currentLine.cross) <= crossThreshold;

        // Also check along-axis gap to prevent far-apart spans from merging
        let alongOk = true;
        if (currentLine.spans.length > 0) {
          const lastSpan = currentLine.spans[currentLine.spans.length - 1];
          const lastGeo = spanGeometry(lastSpan);
          const gap = geo.along - (lastGeo.along + lastSpan.width);
          const alongThreshold = 1.5 * span.fontSize;
          alongOk = gap <= alongThreshold;
        }

        if (crossOk && alongOk) {
          // Join the span to current line
          currentLine.spans.push(span);
          currentLine.text += ' ' + span.text.trim();
          currentLine.extent = Math.max(currentLine.extent, geo.along + span.width) - currentLine.along;
          currentLine.fontSize = Math.max(currentLine.fontSize, span.fontSize);
        } else {
          // Start a new line
          lines.push(currentLine);
          currentLine = {
            page: span.page,
            text: span.text.trim(),
            rotation: rotationBucket(span.rotation),
            along: geo.along,
            extent: span.width,
            cross: geo.cross,
            fontSize: span.fontSize,
            spans: [span],
          };
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    allLines.push(...lines);
  }

  // Sort output: page ASC, rotation bucket (0 first, then ascending |bucket|), then cross DESC, then along ASC
  allLines.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const aBucketAbs = Math.abs(a.rotation);
    const bBucketAbs = Math.abs(b.rotation);
    if (aBucketAbs !== bBucketAbs) {
      // 0 first, then ascending |bucket|
      if (aBucketAbs === 0) return -1;
      if (bBucketAbs === 0) return 1;
      return aBucketAbs - bBucketAbs;
    }
    if (a.rotation !== b.rotation) return a.rotation - b.rotation;
    if (Math.abs(a.cross - b.cross) > 0.001) return b.cross - a.cross;
    return a.along - b.along;
  });

  return allLines;
}

// Splits a line into cells by gaps between spans.
export function splitLineIntoCells(line: TextLine): string[] {
  if (line.spans.length === 1) {
    return [line.text];
  }

  // Sort spans by along order
  const sortedSpans = Array.from(line.spans).sort((a, b) => {
    const aGeo = spanGeometry(a);
    const bGeo = spanGeometry(b);
    return aGeo.along - bGeo.along;
  });

  const cells: string[] = [];
  let currentCell: TextSpan[] = [sortedSpans[0]];

  for (let i = 1; i < sortedSpans.length; i++) {
    const prevSpan = sortedSpans[i - 1];
    const currSpan = sortedSpans[i];
    const prevGeo = spanGeometry(prevSpan);
    const currGeo = spanGeometry(currSpan);

    const gap = currGeo.along - (prevGeo.along + prevSpan.width);
    const threshold = 1.5 * line.fontSize;

    if (gap > threshold) {
      // Start a new cell
      cells.push(currentCell.map((s) => s.text.trim()).join(' '));
      currentCell = [currSpan];
    } else {
      // Add to current cell
      currentCell.push(currSpan);
    }
  }
  if (currentCell.length > 0) {
    cells.push(currentCell.map((s) => s.text.trim()).join(' '));
  }

  return cells;
}

// Ranks and filters lines by display prominence (font size), excluding non-letter text.
export function rankDisplayLines(lines: readonly TextLine[], ratio: number = 2.5): TextLine[] {
  // Collect all spans from all lines
  const allSpans: TextSpan[] = [];
  for (const line of lines) {
    allSpans.push(...line.spans);
  }

  const m = medianFontSize(allSpans);
  if (m === 0) return [];

  // Filter lines: fontSize >= ratio * m and has at least one letter
  const filtered = Array.from(lines).filter(
    (line) => line.fontSize >= ratio * m && /[a-z]/i.test(line.text)
  );

  // Sort by fontSize DESC, then cross DESC
  filtered.sort((a, b) => {
    if (Math.abs(a.fontSize - b.fontSize) > 0.001) return b.fontSize - a.fontSize;
    return b.cross - a.cross;
  });

  return filtered;
}

// Segments lines into panels based on (page, rotation) and along-proximity.
export function segmentPanels(lines: readonly TextLine[]): Panel[] {
  if (lines.length === 0) return [];

  // Group by (page, rotation bucket)
  const groups = new Map<string, TextLine[]>();
  for (const line of lines) {
    const bucket = rotationBucket(line.rotation);
    const key = `${line.page}|${bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(line);
  }

  const allPanels: Panel[] = [];

  for (const [groupKey, groupLines] of groups) {
    const [pageStr, bucketStr] = groupKey.split('|');
    const page = parseInt(pageStr, 10);
    const rotation = parseFloat(bucketStr);

    // Sort lines by along
    groupLines.sort((a, b) => a.along - b.along);

    // Collect all spans to get median for this group
    const allSpans: TextSpan[] = [];
    for (const line of groupLines) {
      allSpans.push(...line.spans);
    }
    const m = medianFontSize(allSpans);

    // Greedily band lines
    const bands: TextLine[][] = [];
    let currentBand: TextLine[] = [groupLines[0]];
    let bandEnd = groupLines[0].along + groupLines[0].extent;

    for (let i = 1; i < groupLines.length; i++) {
      const line = groupLines[i];
      const threshold = 3 * (m > 0 ? m : 8); // fallback to 8 if m === 0
      if (line.along <= bandEnd + threshold) {
        // Join current band
        currentBand.push(line);
        bandEnd = Math.max(bandEnd, line.along + line.extent);
      } else {
        // Start new band
        bands.push(currentBand);
        currentBand = [line];
        bandEnd = line.along + line.extent;
      }
    }
    if (currentBand.length > 0) bands.push(currentBand);

    // Create panels from bands
    for (const band of bands) {
      // Re-sort band: cross DESC then along ASC
      band.sort((a, b) => {
        if (Math.abs(a.cross - b.cross) > 0.001) return b.cross - a.cross;
        return a.along - b.along;
      });
      allPanels.push({
        page,
        rotation,
        lines: band,
      });
    }
  }

  // Sort panels: page ASC, rotation bucket (0 first, then ascending |bucket|), then band start ASC
  allPanels.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const aBucketAbs = Math.abs(a.rotation);
    const bBucketAbs = Math.abs(b.rotation);
    if (aBucketAbs !== bBucketAbs) {
      if (aBucketAbs === 0) return -1;
      if (bBucketAbs === 0) return 1;
      return aBucketAbs - bBucketAbs;
    }
    if (a.rotation !== b.rotation) return a.rotation - b.rotation;
    const aStart = a.lines.length > 0 ? a.lines[0].along : 0;
    const bStart = b.lines.length > 0 ? b.lines[0].along : 0;
    return aStart - bStart;
  });

  return allPanels;
}

// Converts spans to reading-order text via panels, with lines and panels separated.
export function toReadingOrderText(spans: readonly TextSpan[]): string {
  if (spans.length === 0) return '';

  const lines = groupSpansIntoLines(spans);
  const panels = segmentPanels(lines);

  const panelTexts = panels.map((panel) => {
    const lineTexts = panel.lines.map((line) => line.text);
    return lineTexts.join('\n');
  });

  return panelTexts.join('\n\n');
}
