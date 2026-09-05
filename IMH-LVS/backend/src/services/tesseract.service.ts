// Thin wrapper around tesseract.js (open-source, runs fully locally — no
// paid API, no network calls at OCR time). Trained data is read from the
// @tesseract.js-data/eng package bundled in node_modules, so recognition
// works fully offline and never depends on a third-party CDN being
// reachable at request time.
import { createWorker, PSM } from 'tesseract.js';
import os from 'os';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const engTrainedData = require('@tesseract.js-data/eng') as { langPath: string; gzip: boolean };

async function createEnglishWorker() {
  return createWorker('eng', 1, {
    langPath: engTrainedData.langPath,
    gzip: engTrainedData.gzip,
    // Keep tesseract.js's own cache (downloaded core/wasm, if any) inside
    // the OS temp dir rather than the project directory.
    cachePath: os.tmpdir()
  });
}

// Recognizes English text in an image buffer (PNG/JPEG) and returns the
// raw OCR text. Never throws for OCR-internal failures it can identify as
// such — callers should still wrap this in their own try/catch since a
// corrupt/unreadable buffer can still reject the underlying promise.
export async function recognizeText(imageBuffer: Buffer): Promise<string> {
  const worker = await createEnglishWorker();
  try {
    const { data } = await worker.recognize(imageBuffer);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}

export type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number };
export type OcrPageResult = { text: string; words: OcrWord[] };

function flattenWords(blocks: Tesseract.Block[] | null | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          words.push({ text: word.text, bbox: word.bbox, confidence: word.confidence });
        }
      }
    }
  }
  return words;
}

// Same as recognizeText, but also returns every recognized word's bounding
// box (page coordinates, pixels) — the positional signal a full-page OCR
// pass alone doesn't give: it's what lets a caller locate roughly where a
// known anchor phrase (e.g. "Marketed in India by") sits on the page, so a
// *region* around it can be re-OCR'd on its own (see recognizeRegion)
// instead of trusting the full-page reading order, which a dense,
// multi-column, icon-heavy layout can scramble.
export async function recognizePageWithWords(imageBuffer: Buffer): Promise<OcrPageResult> {
  const worker = await createEnglishWorker();
  try {
    const { data } = await worker.recognize(imageBuffer, {}, { blocks: true });
    return { text: data.text ?? '', words: flattenWords(data.blocks) };
  } finally {
    await worker.terminate();
  }
}

export type Rectangle = { left: number; top: number; width: number; height: number };

// Re-OCRs just a rectangular region of the SAME image (pixel coordinates)
// with a page-segmentation mode suited to a small, compact block of text
// (PSM.SINGLE_BLOCK by default) rather than the full page's mode — used to
// re-read the area around a located anchor in isolation, away from
// whatever unrelated column/icon content confused the full-page pass.
export async function recognizeRegion(imageBuffer: Buffer, rectangle: Rectangle, psm: PSM = PSM.SINGLE_BLOCK): Promise<string> {
  const worker = await createEnglishWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(imageBuffer, { rectangle });
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}

// Same as recognizeRegion, but also returns each recognized word's bounding
// box and confidence within the region — used when a caller needs to judge
// per-word reliability (e.g. discarding a low-confidence misread) rather
// than trusting the region's text wholesale.
export async function recognizeRegionWithWords(imageBuffer: Buffer, rectangle: Rectangle, psm: PSM = PSM.SINGLE_BLOCK): Promise<OcrPageResult> {
  const worker = await createEnglishWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(imageBuffer, { rectangle }, { blocks: true });
    return { text: data.text ?? '', words: flattenWords(data.blocks) };
  } finally {
    await worker.terminate();
  }
}

// Recognizes a whole (already-cropped) image with recognition restricted to
// digit characters only — used to read a single number in isolation (e.g.
// a front-of-pack count badge's number) far more reliably than
// general-purpose text OCR, since Tesseract never has to disambiguate a
// digit from a similarly-shaped letter it isn't allowed to output at all.
// No rectangle parameter: the caller crops with sharp beforehand (see
// packageSizeOcr.service.ts) so it can also apply its own
// upscale/contrast/threshold treatment tailored to that small crop.
export async function recognizeDigits(imageBuffer: Buffer, psm: PSM = PSM.SINGLE_LINE): Promise<string> {
  const worker = await createEnglishWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: '0123456789' });
    const { data } = await worker.recognize(imageBuffer);
    return (data.text ?? '').replace(/[^0-9]/g, '');
  } finally {
    await worker.terminate();
  }
}
