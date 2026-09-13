// PP-OCR ONNX-based line recognition for outlined display text where
// Tesseract fails. Engine load failure or recognition failure returns empty
// array + a warning — never throws or stalls extraction.
//
// ESM-only package (@gutenye/ocr-node ships ESM; CommonJS backend must use
// dynamic import via Function). Engine is a singleton: loaded once per process
// and reused across all requests.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env';

// TypeScript compiles a plain `import()` down to `require()` under
// "module": "commonjs", which cannot load @gutenye/ocr-node's ESM-only build.
// Going through `new Function` forces Node's real ESM loader instead.
const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

export type OcrLine = {
  text: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

/**
 * Collapses a text string that repeats the same phrase multiple times.
 * e.g. "Homeo-Vita Homeo-Vita Homeo-Vita" → "Homeo-Vita"
 *       "WW 08 WW 08" → "WW 08"
 *       "NUTRINOU Proteins og 0%" → "NUTRINOU Proteins og 0%"
 * Returns empty string unchanged.
 */
export function collapseRepeatedPhrase(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const n = tokens.length;

  // Try each potential period length from 1 to n/2
  for (let p = 1; p <= Math.floor(n / 2); p++) {
    // Check if n is divisible by p and all tokens match the repeating pattern
    if (n % p === 0) {
      let isRepeating = true;
      for (let i = 0; i < n; i++) {
        if (tokens[i] !== tokens[i % p]) {
          isRepeating = false;
          break;
        }
      }
      if (isRepeating) {
        return tokens.slice(0, p).join(' ');
      }
    }
  }

  // No repeating pattern found
  return tokens.join(' ');
}

let enginePromise: Promise<any | null> | undefined;

function getEngine(): Promise<any | null> {
  if (!enginePromise) {
    enginePromise = importEsm('@gutenye/ocr-node')
      .then((m) => m.default.create())
      .catch((error: unknown) => {
        // One warning per process: the models are missing or the native runtime failed to load;
        // every later call must stay silent and just skip display-text recovery.
        console.warn(`[paddleOcr] engine unavailable — display-text recovery disabled: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
  }
  return enginePromise;
}

/**
 * Recognizes lines in an image using PP-OCR. Returns an empty array and logs
 * a warning if the engine failed to load or recognition fails. Never throws.
 */
export async function recognizeLines(image: Buffer): Promise<OcrLine[]> {
  if (!env.paddleOcrEnabled) {
    return [];
  }


  const engine = await getEngine();
  if (engine === null) {
    return [];
  }

  let tempDir: string | undefined;
  try {
    // Create a temporary directory for the image file
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'imh-lvs-ocr-'));
    const file = path.join(tempDir, 'page.png');

    // Detect if buffer is already PNG (magic bytes: 89 50 4E 47)
    const isPng = image.length >= 4 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;

    // Normalize image to PNG (uploads may be JPEG; pdftoppm output is PNG)
    // If already PNG, write directly to avoid re-encoding; the OCR engine's
    // bundled sharp (0.33.5) reads pdftoppm-generated PNGs natively.
    // Only convert non-PNG formats with our sharp (0.35.4) to avoid compatibility
    // issues between versions when reading the file back.
    if (isPng) {
      await fs.promises.writeFile(file, image);
    } else {
      await sharp(image).png().toFile(file);
    }

    // Run OCR detection
    const raw = await engine.detect(file);

    // Map raw output to OcrLine format
    const lines: OcrLine[] = [];
    for (const item of raw ?? []) {
      const text = collapseRepeatedPhrase(String(item.text ?? ''));

      // Skip empty lines after collapsing
      if (!text) {
        continue;
      }

      // Extract confidence score (may be mean or score)
      const confidence = Number(item.mean ?? item.score ?? 0);

      // Extract bounding box coordinates
      // box format: [[x,y],[x,y],[x,y],[x,y]] (four corners)
      const box = item.box ?? [];
      if (box.length >= 4) {
        const xs = box.map((pt: any[]) => pt[0]);
        const ys = box.map((pt: any[]) => pt[1]);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        const x1 = Math.max(...xs);
        const y1 = Math.max(...ys);

        lines.push({
          text,
          confidence,
          box: { x0, y0, x1, y1 }
        });
      }
    }

    return lines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[paddleOcr] recognition failed: ${message}`);
    return [];
  } finally {
    // Clean up temporary directory
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Suppress cleanup errors — don't fail the entire operation for temp cleanup
      });
    }
  }
}
