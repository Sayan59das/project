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
// Median is used as a scaling factor for proximity thresholds throughout
// the geometry pipeline (line baseline tolerance, panel banding, cell gaps).
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

// Groups spans into lines by (page, rotation bucket), checking baseline proximity only.
// Spans join the same line if their cross-axis (baseline) distance is small; along-axis
// gaps are not checked here — that is what splitLineIntoCells is for. This allows a
// nutrition row with a wide gap between name and value (but bridged by a header above)
// to stay on one line rather than being falsely split.
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
        // Check if span joins the current line based on cross-axis distance only
        const crossThreshold = 0.5 * Math.min(span.fontSize, currentLine.fontSize);
        if (Math.abs(geo.cross - currentLine.cross) <= crossThreshold) {
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
// Cells are separated when gap > 1.5 × line.fontSize — used to break a nutrition
// row with a wide gap between name and value into display columns.
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
// Used to identify field labels like product names in the text layer.
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

// Segments spans into panels using a gutter-detection algorithm, then groups lines within each panel.
// Panels are banded at the SPAN level (before line grouping) so that a nutrition row with a wide
// gap between name and value, but bridged above by a header span, stays on one line in a single panel.
// Conversely, die-line folds (where NO span bridges) are detected as panel boundaries and create
// separate panels even on the same baselines. Within each panel, groupSpansIntoLines handles the
// cross-only baseline rule, leaving wide gaps to splitLineIntoCells.
export function segmentPanels(spans: readonly TextSpan[]): Panel[] {
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

  const allPanels: Panel[] = [];

  for (const [groupKey, groupSpans] of groups) {
    const [pageStr, bucketStr] = groupKey.split('|');
    const page = parseInt(pageStr, 10);
    const rotation = parseFloat(bucketStr);

    // Calculate median for this group
    const m = medianFontSize(groupSpans);

    // Sort spans by along
    groupSpans.sort((a, b) => {
      const aGeo = spanGeometry(a);
      const bGeo = spanGeometry(b);
      return aGeo.along - bGeo.along;
    });

    // Greedily band spans: a span joins current band if span.along <= band.end + 1.5 * m
    const spanBands: TextSpan[][] = [];
    if (m === 0) {
      // If median is 0, whole group is one band
      spanBands.push(groupSpans);
    } else {
      let currentBand: TextSpan[] = [groupSpans[0]];
      let bandEnd = spanGeometry(groupSpans[0]).along + groupSpans[0].width;

      for (let i = 1; i < groupSpans.length; i++) {
        const span = groupSpans[i];
        const spanGeo = spanGeometry(span);
        const threshold = 1.5 * m;

        if (spanGeo.along <= bandEnd + threshold) {
          // Span joins current band
          currentBand.push(span);
          bandEnd = Math.max(bandEnd, spanGeo.along + span.width);
        } else {
          // Start new band
          spanBands.push(currentBand);
          currentBand = [span];
          bandEnd = spanGeo.along + span.width;
        }
      }
      if (currentBand.length > 0) spanBands.push(currentBand);
    }

    // Create panels from span bands
    for (const bandSpans of spanBands) {
      const lines = groupSpansIntoLines(bandSpans);
      // Re-sort lines within the panel: cross DESC then along ASC
      lines.sort((a, b) => {
        if (Math.abs(a.cross - b.cross) > 0.001) return b.cross - a.cross;
        return a.along - b.along;
      });
      allPanels.push({
        page,
        rotation,
        lines,
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
    // Band start = minimum along of spans in the band (panel's first line's along value)
    const aStart = a.lines.length > 0 ? a.lines[0].along : 0;
    const bStart = b.lines.length > 0 ? b.lines[0].along : 0;
    return aStart - bStart;
  });

  return allPanels;
}

// Converts spans to reading-order text via panels, with lines and panels separated.
// Calls segmentPanels directly on spans to enable gutter detection at the span level,
// then groups lines within each panel and formats output.
export function toReadingOrderText(spans: readonly TextSpan[]): string {
  if (spans.length === 0) return '';

  const panels = segmentPanels(spans);

  const panelTexts = panels.map((panel) => {
    const lineTexts = panel.lines.map((line) => line.text);
    return lineTexts.join('\n');
  });

  return panelTexts.join('\n\n');
}

// Extracts nutrient name -> printed value from the "Nutrition(al) Information" block of one label.
// Walks panels in order and each panel's lines in order to find the header line (first line matching
// the nutrition header regex). Candidate rows are lines following the header within the same panel,
// stopping at the first line matching a section-break keyword or after 40 rows. For each row, cells
// are split via splitLineIntoCells; a 2+ cell row uses cells[0] as name and rest as value; a 1-cell
// row is parsed via regex to extract name and value. Rows with no digit in value or empty name are
// skipped. Names are stored trimmed as printed; repeated names keep their first value.
export function extractNutritionTableFromPanels(panels: readonly Panel[]): Record<string, string> {
  // Header regex: matches "Nutrition(al) Information/Facts/Values/Table" or "Nutritional Info"
  const headerRegex = /\bnutrition(al)?\s+(information|facts|values?|table)\b/i;
  const nutritionalInfoRegex = /\bnutritional\s+info\b/i;

  // Stop at section-break keywords
  const stopRegex = /^(ingredients?|allergen|allergy|storage|directions?|dosage|usage|how to use|warning|caution|disclaimer|manufactured|marketed|mfd|mfg|batch|exp|best before)\b/i;

  // Regex for extracting name and value from a single cell. Allows names to end with letters, digits (for vitamins like D3, B12), or closing parens.
  const singleCellRegex = /^(.+?[A-Za-z0-9\)])\s+(\d[\d.,]*\s*(?:%|mg|mcg|µg|g|kcal|kj|iu|ml|kJ)?.*)$/i;

  let headerPanelIndex = -1;
  let headerLineIndex = -1;

  // Find the header line
  for (let panelIdx = 0; panelIdx < panels.length; panelIdx++) {
    const panel = panels[panelIdx];
    for (let lineIdx = 0; lineIdx < panel.lines.length; lineIdx++) {
      const line = panel.lines[lineIdx];
      if (headerRegex.test(line.text) || nutritionalInfoRegex.test(line.text)) {
        headerPanelIndex = panelIdx;
        headerLineIndex = lineIdx;
        break;
      }
    }
    if (headerPanelIndex !== -1) break;
  }

  // No header found
  if (headerPanelIndex === -1) {
    return {};
  }

  const result: Record<string, string> = {};
  const headerPanel = panels[headerPanelIndex];

  // Collect candidate rows from the same panel, starting after the header
  let rowCount = 0;
  for (let lineIdx = headerLineIndex + 1; lineIdx < headerPanel.lines.length; lineIdx++) {
    if (rowCount >= 40) break;

    const line = headerPanel.lines[lineIdx];

    // Check if this line is a section break
    if (stopRegex.test(line.text)) {
      break;
    }

    // Process the row
    const cells = splitLineIntoCells(line);

    let name: string | null = null;
    let value: string | null = null;

    if (cells.length >= 2) {
      // Multi-cell row: name = cells[0], value = rest joined with space
      name = cells[0].trim();
      value = cells.slice(1).join(' ');
    } else if (cells.length === 1) {
      // Single-cell row: try regex extraction
      const match = singleCellRegex.exec(cells[0]);
      if (match) {
        name = match[1].trim();
        value = match[2];
      }
    }

    // Skip if value has no digit or name is empty
    if (name && value && /\d/.test(value)) {
      // Store only if name not already present (keep first value)
      if (!(name in result)) {
        result[name] = value;
      }
    }

    rowCount++;
  }

  return result;
}
