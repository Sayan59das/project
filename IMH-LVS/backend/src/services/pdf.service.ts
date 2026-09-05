// PDF handling for label extraction. Two independent paths:
//
// 1. Text-layer extraction via pdfjs-dist (Mozilla, open-source, no native
//    dependencies) — used first for PDFs that already contain a real text
//    layer (e.g. exported from design software).
// 2. Page rasterization via the `pdftoppm` command-line tool (part of the
//    poppler-utils system package) for scanned/image-only PDFs that have no
//    usable text layer. Rendering PDF pages to images from Node in-process
//    (pdfjs-dist + a canvas implementation) was evaluated and rejected: it
//    either crashed the process (@napi-rs/canvas segfaulted) or threw from
//    inside pdfjs-dist's image pipeline (classic `canvas` package) in this
//    environment. Shelling out to a battle-tested native tool avoids both
//    failure modes and — critically — never crashes the server if the tool
//    is missing (see rasterizePdfPages below).
//
// pdfjs-dist ships ESM-only builds; see realImport() for why a genuine
// dynamic import is required instead of a plain `import`/`require`.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from '../config/env';

const execFileAsync = promisify(execFile);

// TypeScript compiles a plain `import()` down to `require()` under
// "module": "commonjs", which cannot load pdfjs-dist's ESM-only build.
// Going through `new Function` forces Node's real ESM loader instead.
const realImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

async function loadPdfJs() {
  return realImport('pdfjs-dist/legacy/build/pdf.mjs');
}

export type PdfTextExtractionResult = {
  text: string;
  pageCount: number;
};

// Below this fraction of the larger of two consecutive text items' font
// heights, a vertical gap is ordinary same-line baseline/kerning jitter;
// above it, the items are on genuinely different visual rows even though
// pdfjs's own `hasEOL` flag said otherwise. Free-form label layouts (each
// word/phrase placed as its own absolutely-positioned text box, rather than
// flowing paragraph text) are exactly where pdfjs's hasEOL heuristic misses
// this — seen in practice on a real label where a large product-name row
// and a much smaller product-form row directly beneath it ("SHARP MIND
// PLUS" / "GUMMIES") were fused into one line, silently corrupting the
// product name with the form word. Validated against multiple real label
// PDFs to confirm it never splits a line that was already correctly joined.
const LINE_BREAK_Y_RATIO = 0.35;

// Attempts to read the PDF's existing text layer. Returns an empty string
// (never throws for a malformed/encrypted/corrupt PDF — the caller decides
// what to do with "no usable text").
export async function extractPdfText(pdfBuffer: Buffer): Promise<PdfTextExtractionResult> {
  try {
    const pdfjsLib = await loadPdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true }).promise;

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      // Rebuild line breaks primarily from pdfjs's per-item `hasEOL`
      // marker — joining all items with a single separator collapses the
      // whole page onto one line, which breaks the line-based field
      // heuristics downstream. Additionally, when hasEOL says "no break"
      // but the next item sits well outside this item's own line height
      // (see LINE_BREAK_Y_RATIO above), a line break is inserted anyway —
      // pdfjs's heuristic is tuned for flowing paragraph text and doesn't
      // reliably catch a real layout's separately-positioned text rows.
      let pageText = '';
      let prevY: number | null = null;
      let prevHeight: number | null = null;
      let prevHadEOL = true; // no break needed before the very first item
      for (const item of textContent.items as any[]) {
        if (!('str' in item)) continue;
        const isBlank = item.str.trim().length === 0;
        if (!isBlank && !prevHadEOL && prevY !== null && prevHeight !== null) {
          const [, , c, d, , y] = item.transform;
          const fontHeight = Math.hypot(c, d);
          const threshold = LINE_BREAK_Y_RATIO * Math.max(fontHeight, prevHeight);
          if (Math.abs(y - prevY) > threshold) {
            pageText = pageText.replace(/[ \t]+$/, '') + '\n';
          }
        }
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
        if (!isBlank) {
          const [, , c, d, , y] = item.transform;
          prevY = y;
          prevHeight = Math.hypot(c, d);
        }
        prevHadEOL = item.hasEOL;
      }
      pageTexts.push(pageText.trim());
    }

    return { text: pageTexts.join('\n').trim(), pageCount: doc.numPages };
  } catch (error) {
    console.error('[pdf.service] Failed to read PDF text layer:', error instanceof Error ? error.message : error);
    return { text: '', pageCount: 0 };
  }
}

// True once a text layer is long enough to be worth trusting over OCR.
export function hasUsablePdfText(text: string): boolean {
  return text.trim().length >= env.pdfMinTextLength;
}

// Rasterizes up to `env.pdfMaxOcrPages` pages of a scanned/image PDF to PNG
// buffers using `pdftoppm` (poppler-utils), for OCR fallback. Writes the
// source PDF and rendered pages to a temporary directory that is always
// cleaned up before returning. Never throws: if `pdftoppm` is not
// installed, or rendering otherwise fails, logs a clear message and
// resolves to an empty array so the caller can fall back to blank fields
// instead of crashing the request.
export async function rasterizePdfPages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'imh-lvs-pdf-'));
  const sourcePath = path.join(workDir, 'source.pdf');
  const outputPrefix = path.join(workDir, 'page');

  try {
    await fs.promises.writeFile(sourcePath, pdfBuffer);

    await execFileAsync('pdftoppm', [
      '-png',
      '-r',
      String(env.pdfRasterDpi),
      '-f',
      '1',
      '-l',
      String(env.pdfMaxOcrPages),
      sourcePath,
      outputPrefix
    ]);

    const files = (await fs.promises.readdir(workDir))
      .filter((name) => name.startsWith('page') && name.endsWith('.png'))
      .sort();

    const buffers = await Promise.all(files.map((name) => fs.promises.readFile(path.join(workDir, name))));
    return buffers;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      console.error(
        '[pdf.service] pdftoppm (poppler-utils) is not installed — cannot rasterize scanned PDFs for OCR. ' +
          'Install poppler-utils (e.g. `apt-get install poppler-utils`) to enable this path.'
      );
    } else {
      console.error('[pdf.service] Failed to rasterize PDF pages:', error instanceof Error ? error.message : error);
    }
    return [];
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
