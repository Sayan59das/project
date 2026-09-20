// TEMPORARY ANALYSIS TOOL (accuracy plan) — not part of the product.
//
// Dumps, for each label file, ALL text three different readers can get off
// it: the PDF's own text layer, Tesseract's whole-page OCR, and PP-OCR's
// strip-based line reader (the same reader recoverDisplayTextCandidates
// already runs in production, just kept here instead of thrown away after
// picking 10 "outlined" lines). The question this exists to answer is not
// "did the extractor find this value" but "is this value present in
// SOMETHING a machine can read" — and specifically, whether the answer
// changes once PP-OCR is counted, since Tesseract is known to read zero
// outlined display type and is weak on small table text.
//
// Usage: node -r tsx/cjs scripts/dump-readable-text.ts <outDir> <file> [<file>...]
// Writes <outDir>/<basename>.txt per input; progress to stderr.

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { extractPdfText, extractTextSpans, rasterizePdfPages } from '../src/services/pdf.service';
import { preprocessForOcr } from '../src/services/imagePreprocessing.service';
import { recognizeText } from '../src/services/tesseract.service';
import { recognizeLines } from '../src/services/paddleOcr.service';
import { planOcrStrips, dropStripEdgeLines, dedupeOverlappingLines, type OcrLineLike } from '../src/services/outlinedText.service';
import { segmentPanels, medianFontSize } from '../src/services/textLayerGeometry.service';
import { env } from '../src/config/env';

async function ocrImage(buffer: Buffer): Promise<string> {
  try {
    return await recognizeText(await preprocessForOcr(buffer));
  } catch (error) {
    console.error(`  OCR failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

// The same strip-pass PP-OCR reader recoverDisplayTextCandidates runs in
// production (labelExtraction.service.ts) -- lifted out here rather than
// imported, since that function only returns its top-10 outlined lines and
// this script wants every line the reader actually found, unfiltered, plus
// rotated passes production never runs. Panel X-ranges (when spans are
// available) keep the same "OCR each visual column separately" strategy;
// with no text layer (spans.length === 0), planOcrStrips already falls back
// to one whole-page strip, matching production's own behaviour there.
async function ppOcrLines(pageImage: Buffer, spans: Awaited<ReturnType<typeof extractTextSpans>>): Promise<OcrLineLike[]> {
  const metadata = await sharp(pageImage).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const dpi = env.pdfRasterDpi;
  const s = dpi / 72;

  const page1Spans = spans.filter((sp) => sp.page === 1);
  let panelXRanges: Array<{ left: number; right: number }> = [];
  if (page1Spans.length > 0) {
    for (const panel of segmentPanels(page1Spans)) {
      if (Math.abs(panel.rotation) >= 0.01) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const line of panel.lines) {
        for (const span of line.spans) {
          minX = Math.min(minX, span.x);
          maxX = Math.max(maxX, span.x + span.width);
        }
      }
      if (minX !== Infinity) panelXRanges.push({ left: minX * s, right: maxX * s });
    }
  }
  const medianFontSizeVal = page1Spans.length > 0 ? medianFontSize(page1Spans) : 0;
  const padPx = Math.max(40, Math.round(1.5 * medianFontSizeVal * s));
  const strips = planOcrStrips(panelXRanges, width, padPx);

  const allLines: OcrLineLike[] = [];
  for (const strip of strips) {
    try {
      const crop = await sharp(pageImage)
        .extract({ left: Math.round(strip.left), top: 0, width: Math.round(strip.width), height: Math.round(height) })
        .png()
        .toBuffer();
      const lines = await recognizeLines(crop);
      const trimmed = dropStripEdgeLines(lines, strip, width);
      for (const line of trimmed) {
        allLines.push({
          text: line.text,
          box: { x0: line.box.x0 + strip.left, y0: line.box.y0, x1: line.box.x1 + strip.left, y1: line.box.y1 },
          confidence: line.confidence,
        });
      }
    } catch (error) {
      console.error(`  PP-OCR strip failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return dedupeOverlappingLines(allLines);
}

// Upscale rule from the accuracy-plan correction: PP-OCR's recogniser works
// at ~48px line height; 300 DPI of 6.8pt body text renders at ~28px, below
// that. If the page median line height is small, re-run once at 2x. This is
// a crude per-PAGE proxy (median of dedupe'd line heights), not the precise
// per-strip rule Step 3's production reader will use -- good enough for a
// ceiling measurement, not good enough to ship.
function medianLineHeight(lines: readonly OcrLineLike[]): number {
  if (lines.length === 0) return 0;
  const heights = lines.map((l) => l.box.y1 - l.box.y0).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  return heights.length % 2 === 1 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
}

async function dumpPpOcrForPage(pageImage: Buffer, spans: Awaited<ReturnType<typeof extractTextSpans>>): Promise<string> {
  let lines = await ppOcrLines(pageImage, spans);
  if (medianLineHeight(lines) > 0 && medianLineHeight(lines) < 32) {
    try {
      const upscaled = await sharp(pageImage).resize({ width: (await sharp(pageImage).metadata()).width! * 2 }).png().toBuffer();
      const upscaledLines = await ppOcrLines(upscaled, []); // geometry no longer lines up post-resize; whole-page strip only
      if (upscaledLines.length > lines.length) lines = upscaledLines;
    } catch (error) {
      console.error(`  upscale retry failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return lines.map((l) => `${l.confidence.toFixed(2)}\t${l.text}`).join('\n');
}

async function readableTextFor(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const isPdf = path.extname(filePath).toLowerCase() === '.pdf';

  let textLayer = '';
  let ocr = '';
  let ppocr = '';
  let spans: Awaited<ReturnType<typeof extractTextSpans>> = [];

  if (isPdf) {
    try {
      textLayer = (await extractPdfText(buffer)).text;
      spans = await extractTextSpans(buffer);
    } catch (error) {
      console.error(`  text layer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let pages: Buffer[] = [];
    try {
      pages = await rasterizePdfPages(buffer);
    } catch (error) {
      console.error(`  rasterize failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const page of pages) {
      ocr += (await ocrImage(page)) + '\n';
      ppocr += '===PAGE 0deg===\n' + (await dumpPpOcrForPage(page, spans)) + '\n';
      for (const angle of [90, 270] as const) {
        try {
          const rotated = await sharp(page).rotate(angle).png().toBuffer();
          ppocr += `===PAGE ${angle}deg===\n` + (await dumpPpOcrForPage(rotated, [])) + '\n';
        } catch (error) {
          console.error(`  rotate ${angle} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } else {
    ocr = await ocrImage(buffer);
    ppocr += '===PAGE 0deg===\n' + (await dumpPpOcrForPage(buffer, [])) + '\n';
    for (const angle of [90, 270] as const) {
      try {
        const rotated = await sharp(buffer).rotate(angle).png().toBuffer();
        ppocr += `===PAGE ${angle}deg===\n` + (await dumpPpOcrForPage(rotated, [])) + '\n';
      } catch (error) {
        console.error(`  rotate ${angle} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return `===TEXT_LAYER===\n${textLayer}\n===OCR===\n${ocr}\n===PPOCR===\n${ppocr}\n`;
}

async function main() {
  const [outDir, ...files] = process.argv.slice(2);
  if (!outDir || files.length === 0) {
    console.error('Usage: node -r tsx/cjs scripts/dump-readable-text.ts <outDir> <file> [<file>...]');
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const originalLog = console.log;
  console.log = () => {};

  let done = 0;
  for (const file of files) {
    const base = path.basename(file);
    const target = path.join(outDir, `${base}.txt`);
    done += 1;
    if (fs.existsSync(target)) {
      console.error(`[${done}/${files.length}] cached ${base}`);
      continue;
    }
    console.error(`[${done}/${files.length}] reading ${base}`);
    try {
      fs.writeFileSync(target, await readableTextFor(file), 'utf8');
    } catch (error) {
      console.error(`  FAILED ${base}: ${error instanceof Error ? error.message : String(error)}`);
      fs.writeFileSync(target, '===TEXT_LAYER===\n\n===OCR===\n\n===PPOCR===\n\n', 'utf8');
    }
  }

  console.log = originalLog;
  console.error('done');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
