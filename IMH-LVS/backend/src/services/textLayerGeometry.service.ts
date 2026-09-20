import type { TextSpan } from './pdf.service';
import type { OcrWord } from './tesseract.service';
import type { OcrLine } from './paddleOcr.service';

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
// For nutrition rows and wide-gap multi-cell lines, splitLineIntoCells would emit cells
// as separate lines, but that breaks normal multi-word fields (brand names, descriptions).
// So this stays with the space-joined line.text approach; the garbage-blanking logic in
// extractFieldsFromTextLayer handles the die-line-proof duplication case separately.
export function toReadingOrderText(spans: readonly TextSpan[]): string {
  if (spans.length === 0) return '';

  const panels = segmentPanels(spans);

  const panelTexts = panels.map((panel) => {
    const lineTexts = panel.lines.map((line) => line.text);
    return lineTexts.join('\n');
  });

  return panelTexts.join('\n\n');
}

// Adapts OCR word boxes (pixel coordinates, y increasing downward) into this
// module's TextSpan shape (PDF-convention coordinates, y increasing upward),
// so the same panel/line/nutrition-table geometry pipeline built for the PDF
// text layer also works on a rasterized page's OCR output — the only path
// available when a label's nutrition panel is baked into the artwork as an
// image rather than real embedded PDF text (a real, common case on this
// project's client labels: the PDF text layer has no nutrition data at all,
// so extractNutritionTableFromPanels(segmentPanels(spans-from-PDF)) always
// returns {} for those labels, no matter what the text layer contains
// elsewhere on the page). Rotation is always 0 here: a full-page OCR pass
// reads the rasterized (already right-side-up) image, not individual
// arbitrarily-rotated glyphs the way a PDF's text layer can report.
export function ocrWordsToTextSpans(words: readonly OcrWord[], page: number = 1): TextSpan[] {
  return words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => ({
      page,
      text: word.text,
      x: word.bbox.x0,
      y: -word.bbox.y0,
      width: word.bbox.x1 - word.bbox.x0,
      height: word.bbox.y1 - word.bbox.y0,
      fontSize: word.bbox.y1 - word.bbox.y0,
      rotation: 0,
      fontName: 'ocr',
    }));
}

// Convenience wrapper: OCR words in, nutrition table out, via the same
// row/cell heuristics used for the PDF text layer — but deliberately
// skipping segmentPanels' column-banding step. That step relies on some
// line (in practice, the nutrition header) having a span wide enough to
// bridge the empty horizontal gutter between the name and value columns,
// or it reads that gutter as a gap between two separate side-by-side
// panels and splits the table apart — the name column ends up in one
// panel, the value column in another, and neither one alone has a
// header + a same-panel value to pair it with. A real PDF text layer
// sometimes has such a bridging span (one wide text run for the whole
// header line); individual OCR word boxes never do, so segmentPanels
// would silently return {} for every OCR-sourced page. Going straight
// from words to lines to one single page-wide panel sidesteps that:
// column separation for the OCR path happens per-row instead, in
// splitLineIntoCells's own x-gap check, which doesn't have this problem.
export function extractNutritionTableFromOcrWords(words: readonly OcrWord[], page: number = 1): Record<string, string> {
  const spans = ocrWordsToTextSpans(words, page);
  const lines = groupSpansIntoLines(spans);
  const panel: Panel = { page, rotation: 0, lines };
  return extractNutritionTableFromPanels([panel]);
}

// Same adaptation as ocrWordsToTextSpans, for PP-OCR's line-level detections
// (accuracy2 plan Step 3) rather than Tesseract's word-level boxes. PP-OCR
// (recognizeLines, paddleOcr.service.ts) detects contiguous TEXT REGIONS, not
// individual words -- confirmed on real label dumps (see ceiling.py's own
// comment) that a genuine nutrition row usually comes back as ONE line
// ("Energy 16 kcal <1% <1%"), though a wide enough visual gutter can still
// split name and value into two regions at the same baseline. Both shapes
// are handled downstream: groupSpansIntoLines rejoins same-baseline regions
// into one row (the split case), and extractNutritionTableFromPanels' own
// single-cell regex already parses a whole "name value %" run as one row
// (the contiguous case) -- this adapter exists only to reuse both untouched.
export function ppOcrLinesToTextSpans(lines: readonly OcrLine[], page: number = 1): TextSpan[] {
  return lines
    .filter((line) => line.text.trim().length > 0)
    .map((line) => ({
      page,
      text: line.text,
      x: line.box.x0,
      y: -line.box.y0,
      width: line.box.x1 - line.box.x0,
      height: line.box.y1 - line.box.y0,
      fontSize: line.box.y1 - line.box.y0,
      rotation: 0,
      fontName: 'ppocr',
    }));
}

// Convenience wrapper mirroring extractNutritionTableFromOcrWords, for
// PP-OCR's line-level output instead of Tesseract's word-level boxes.
export function extractNutritionTableFromPpOcrLines(lines: readonly OcrLine[], page: number = 1): Record<string, string> {
  const spans = ppOcrLinesToTextSpans(lines, page);
  const textLines = groupSpansIntoLines(spans);
  const panel: Panel = { page, rotation: 0, lines: textLines };
  return extractNutritionTableFromPanels([panel]);
}

// Extracts nutrient name -> printed value from the "Nutrition(al) Information" block of one label.
// Walks panels in order and each panel's lines in order to find the header line (first line matching
// the nutrition header regex). Candidate rows are lines following the header within the same panel,
// stopping at the first line matching a section-break keyword or after 40 rows. For each row, cells
// are split via splitLineIntoCells; a 2+ cell row uses cells[0] as name and cells[1] as value only
// (cells[2+] are %RDA/%DV columns, a different fact from the printed amount). A 1-cell row is parsed
// via regex to extract name and value. Rows where the value does not START with an optional comparison
// operator (<, >, ≤, ≥, ~) followed by whitespace and a digit are skipped; so "in Adults (18 years
// & above)" is skipped but "<0.5%" and "0 g" pass. Names are stored trimmed as printed; repeated
// names keep their first value.
export function extractNutritionTableFromPanels(panels: readonly Panel[]): Record<string, string> {
  // Header regex: matches "Nutrition(al) Information/Facts/Values/Table" or "Nutritional Info"
  const headerRegex = /\bnutrition(al)?\s+(information|facts|values?|table)\b/i;
  const nutritionalInfoRegex = /\bnutritional\s+info\b/i;

  // Stop at section-break keywords
  const stopRegex = /^(ingredients?|allergen|allergy|storage|directions?|dosage|usage|how to use|warning|caution|disclaimer|manufactured|marketed|mfd|mfg|batch|exp|best before)\b/i;

  // Regex for extracting name and value from a single cell. Allows names to end with letters, digits (for vitamins like D3, B12), or closing parens.
  const singleCellRegex = /^(.+?[A-Za-z0-9\)])\s+(\d[\d.,]*\s*(?:%|mg|mcg|µg|g|kcal|kj|iu|ml|kJ)?.*)$/i;

  // Regex to validate that a value STARTS with an optional comparison operator and then a digit
  const valueStartsWithNumberRegex = /^[<>≤≥~]?\s*\d/;

  // Step 5.1 (accuracy plan): a genuine nutrition row's name or value is
  // short and number/unit-shaped -- "Total Carbohydrate", "0.5 mg (Children
  // 1% / Teens 0.25% / Adults <0.5% DV)" -- never a full sentence. Real bug
  // this catches, from eval/diff.py --field nutrition_table output (not
  // invented, see STEP1_FAILURE_ANALYSIS.md): a footnote/dosage/storage/
  // RDA-citation sentence elsewhere in the panel, which happens to start
  // with (or the singleCellRegex above happens to split on) a digit, gets
  // captured as if it were a nutrient row -- "2,000 kcal energy per day,
  // however, calorie needs may vary.", "2020 guidelines for Children
  // 5-17years &", "1 gummy (approx. 3g) for kids & 2 gummies for adults."
  // Rule: whatever comes before the first "(" (or the whole string, if
  // there's no "(") must be at most 3 words, and nothing meaningful may
  // follow the closing ")" -- a genuine DV/RDA breakdown parenthetical is
  // always the LAST thing in a value (or the name has none at all).
  function looksLikeNutritionText(s: string): boolean {
    const trimmed = s.trim();
    const openIdx = trimmed.indexOf('(');
    if (openIdx === -1) {
      return trimmed.split(/\s+/).filter(Boolean).length <= 3;
    }
    const head = trimmed.slice(0, openIdx).trim();
    if (head.split(/\s+/).filter(Boolean).length > 3) return false;
    const closeIdx = trimmed.lastIndexOf(')');
    if (closeIdx === -1) return true; // unbalanced -- let other rules judge it
    return trimmed.slice(closeIdx + 1).trim().length === 0;
  }

  // The existing %-column strip below (for "7.5 kcal <0.5% <0.5% <0.5%" ->
  // "7.5 kcal") must not fire on a % figure that's INSIDE an unclosed
  // parenthetical -- "0.5 mg (Children 1% / Teens 0.25% / Adults <0.5%
  // DV)" would otherwise lose everything from " 1%" onward, destroying a
  // real DV/RDA breakdown instead of a stray %RDA column.
  //
  // Step 6-prep (accuracy plan follow-up): when there is exactly ONE
  // trailing %-figure being stripped, it's unambiguously that value's own
  // %DV/%RDA figure -- kept, appended as "(<value> DV)" instead of
  // silently discarded, mirroring the multi-cell case above. Two or more
  // (a Children/Teens/Adults-style triple, still matched as one greedy
  // trailing run) stay dropped exactly as before: no way to tell which
  // figure is which from the value string alone.
  function stripTrailingPercentColumns(value: string): string {
    const match = value.match(/\s+[<>≤≥~]?\d[\d.,]*\s*%.*$/);
    if (!match || match.index === undefined) return value;
    const before = value.slice(0, match.index);
    const openParens = (before.match(/\(/g) || []).length;
    const closeParens = (before.match(/\)/g) || []).length;
    if (openParens > closeParens) return value;

    const trimmedBefore = before.trim();
    const tail = value.slice(match.index).trim();
    const singlePercentFigure = /^([<>≤≥~]?\d[\d.,]*\s*%)$/.exec(tail);
    if (singlePercentFigure) {
      return `${trimmedBefore} (${singlePercentFigure[1]} DV)`;
    }
    return trimmedBefore;
  }

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
    // Set only by the Kids/Adults path below: its composed value ("Kids:
    // 125 mg (19.50% RDA); Adults: ...") deliberately doesn't start with a
    // digit, so it can't pass -- and doesn't need to pass -- the generic
    // "value looks like a plain nutrient reading" gates just below, which
    // exist to catch footnote/prose sentences a plain value/name never
    // needs protecting against here: val1/val2 and pct1/pct2 were already
    // validated against their own strict, narrow shapes inside that branch.
    let composedTwoGroupValue = false;

    if (cells.length >= 2) {
      // Multi-cell row: name = cells[0], value = cells[1]. Any %DV/%RDA
      // columns after that are handled by the two branches below.
      name = cells[0].trim();
      value = cells[1];
      if (cells.length === 5 || cells.length === 6) {
        // Step 6-follow-up (accuracy plan): a real, DIFFERENT multi-column
        // shape from the single-extra-%DV-column case above -- two
        // genuinely different values (a Kids dose and an Adults dose),
        // each with its own %RDA figure, not one value with an extra %DV
        // column (real cells, Calcimax Pack 30/60 IRN168/169-2.pdf:
        // ["Elemental Calcium", "125 mg", "19.50", "250 mg", "25.00"]).
        // cells.length === 6 is the same shape with a sixth, unrelated
        // trailing cell (a warning banner from a different part of the
        // artwork that shares this row's baseline) -- ignored, same
        // "extra trailing cell is noise" rule as everywhere else here.
        //
        // Distinguishing this from a real %DV-style extra column (or from
        // an unrelated three-group shape, e.g. Children/Teens/Adults
        // sharing one value, confirmed on a different real product,
        // CALRIO Gummies) relies on one safe, generic tell: this label's
        // own %RDA cells are printed as BARE numbers or "#" (its own
        // footnote symbol for "RDA not established" -- ground truth then
        // omits the percentage entirely for that side), never with a
        // literal "%" or comparison operator. A genuine %DV/%RDA column
        // always carries one of those ("100%", "<0.6%"), so requiring
        // their absence here is what keeps this from ever firing on that
        // different shape.
        const pctToken = /^\d+(\.\d+)?$/;
        const val1 = cells[1];
        const pct1 = cells[2].trim();
        const val2 = cells[3];
        const pct2 = cells[4].trim();
        const isPct = (token: string) => pctToken.test(token) || token === '#';
        if (valueStartsWithNumberRegex.test(val1) && valueStartsWithNumberRegex.test(val2) && isPct(pct1) && isPct(pct2)) {
          const withPct = (val: string, pct: string) => {
            const pctNum = Number(pct);
            return pct !== '#' && Number.isFinite(pctNum) && pctNum > 0 ? `${val} (${pct}% RDA)` : val;
          };
          value = `Kids: ${withPct(val1, pct1)}; Adults: ${withPct(val2, pct2)}`;
          composedTwoGroupValue = true;
        }
      }

      if (!composedTwoGroupValue && cells.length >= 3) {
        // The %DV/%RDA column(s) after the value. A label that breaks its
        // percentages out per age group repeats the SAME figure in every
        // column whenever that nutrient's percentage doesn't actually
        // differ by age -- real, confirmed on several products: Iron
        // IRN121-1 prints ["Energy", "16 kcal", "<1%", "<1%"] across its
        // Kids and Teens columns and the reviewed ground truth records
        // exactly one figure, "16 kcal (<1% DV)"; CALRIO Gummies does the
        // same across three columns (Children/Teens/Adults) for every row
        // whose percentage is age-independent. So identical columns are
        // ONE fact printed repeatedly, not several facts, and collapse to
        // the same "(<value> DV)" shape a single column already produced.
        //
        // Columns that genuinely DIFFER (Iron's own "170 mg | 100% | 50%")
        // are still left dropped: ground truth spells those out with the
        // age-group names read off the header row, and which name belongs
        // to which column is a separate, unattempted piece of work.
        //
        // Scanning stops at the first cell that is neither a percentage
        // nor a footnote marker, rather than filtering the whole row:
        // a nutrition row's own columns sit together, and anything past
        // them is text from an unrelated panel that shares this baseline
        // (a warning banner, an RDA footnote sentence) which must never
        // be reached across to find a stray percentage.
        const percentCell = /^[<>≤≥~]?\d[\d.,]*\s*%$/;
        const footnoteCell = /^[*#†‡^~-]+$/;
        const percentages: string[] = [];
        for (const raw of cells.slice(2)) {
          const cell = raw.trim();
          if (cell.length === 0 || footnoteCell.test(cell)) continue;
          if (!percentCell.test(cell)) break;
          percentages.push(cell);
        }
        if (percentages.length > 0 && new Set(percentages).size === 1) {
          value = `${cells[1]} (${percentages[0]} DV)`;
        }
      }
    } else if (cells.length === 1) {
      // Single-cell row: try regex extraction
      const match = singleCellRegex.exec(cells[0]);
      if (match) {
        name = match[1].trim();
        value = match[2];
      }
    }

    if (composedTwoGroupValue) {
      // Already fully validated inside its own branch -- skip the generic
      // gates below, which exist to reject prose and would reject this
      // value for the wrong reason (it doesn't start with a digit; it
      // starts with the word "Kids").
      if (name && value && !(name in result)) {
        result[name] = value;
      }
    } else if (name && value && valueStartsWithNumberRegex.test(value)) {
      // Skip if value does not START with a number (with optional comparison operator) or name is empty.
      // Strip trailing %-column tokens BEFORE the shape check below, not
      // after: a genuine value like "7.5 kcal <0.5% <0.5% <0.5%" reads as
      // a multi-word sentence until the stray %RDA columns are gone, at
      // which point it's clearly nutrition-shaped again. "40 mg (66%)" and
      // a DV/RDA breakdown parenthetical are left alone either way (see
      // stripTrailingPercentColumns above).
      value = stripTrailingPercentColumns(value);

      // Reject if either side now reads like a sentence rather than a
      // nutrient name/value (see looksLikeNutritionText above).
      if (looksLikeNutritionText(name) && looksLikeNutritionText(value)) {
        // Store only if name not already present (keep first value)
        if (!(name in result)) {
          result[name] = value;
        }
      }
    }

    rowCount++;
  }

  return result;
}
