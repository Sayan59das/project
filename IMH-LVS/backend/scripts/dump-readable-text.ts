// TEMPORARY ANALYSIS TOOL (accuracy plan) — not part of the product.
//
// Dumps, for each label file, ALL text the machine can actually read off it:
// the PDF's own text layer, plus Tesseract OCR of every rasterized page. The
// question it exists to answer is not "did the extractor find this value" but
// "is this value present in readable text AT ALL" — i.e. how much of the
// remaining gap to 80% is a fixable extractor problem versus content that is
// only in the artwork's pixels and can never be read this way.
//
// Usage: node -r tsx/cjs scripts/dump-readable-text.ts <outDir> <file> [<file>...]
// Writes <outDir>/<basename>.txt per input; progress to stderr.

import fs from 'fs';
import path from 'path';
import { extractPdfText, rasterizePdfPages } from '../src/services/pdf.service';
import { preprocessForOcr } from '../src/services/imagePreprocessing.service';
import { recognizeText } from '../src/services/tesseract.service';

async function ocrImage(buffer: Buffer): Promise<string> {
  try {
    return await recognizeText(await preprocessForOcr(buffer));
  } catch (error) {
    console.error(`  OCR failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

async function readableTextFor(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const isPdf = path.extname(filePath).toLowerCase() === '.pdf';

  let textLayer = '';
  let ocr = '';

  if (isPdf) {
    try {
      textLayer = (await extractPdfText(buffer)).text;
    } catch (error) {
      console.error(`  text layer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let pages: Buffer[] = [];
    try {
      pages = await rasterizePdfPages(buffer);
    } catch (error) {
      console.error(`  rasterize failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const page of pages) ocr += (await ocrImage(page)) + '\n';
  } else {
    ocr = await ocrImage(buffer);
  }

  return `===TEXT_LAYER===\n${textLayer}\n===OCR===\n${ocr}\n`;
}

async function main() {
  const [outDir, ...files] = process.argv.slice(2);
  if (!outDir || files.length === 0) {
    console.error('Usage: node -r tsx/cjs scripts/dump-readable-text.ts <outDir> <file> [<file>...]');
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Library chatter on stdout would be harmless here (nothing is piped) but
  // keeps the progress log unreadable.
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
      fs.writeFileSync(target, '===TEXT_LAYER===\n\n===OCR===\n\n', 'utf8');
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
