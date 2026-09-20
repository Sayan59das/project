// Fail-soft JSON-schema chat client for Ollama VLM inference.
//
// The local VLM service (http://127.0.0.1:11434, model qwen2.5vl:3b) is an
// OPTIONAL resolver that fills in fields Tesseract failed to read. It is OFF
// by default and ON only if OLLAMA_URL is explicitly set; absence means
// "skip this resolver", never "use a default address". Network errors and
// parsing failures warn once per process and return null rather than failing
// the extraction — label extraction must degrade gracefully when the model
// is not available, unreachable, or has returned invalid data.
import sharp from 'sharp';
import { env } from '../config/env';

// Module-level flag: warn about network unreachability only ONCE per process,
// not on every request that fails. Prevents log spam when the model is down.
let hasWarnedAboutUnreachable = false;

export type VlmImage = {
  base64: string;
  sentWidth: number;
  sentHeight: number;
  originalWidth: number;
  originalHeight: number;
};

export type VlmClient = {
  askJson: (image: VlmImage, prompt: string, schema: object) => Promise<unknown | null>;
};

/** True if OLLAMA_URL is set and non-empty; false means the resolver is disabled. */
export function isVlmEnabled(): boolean {
  return env.ollamaUrl !== '';
}

export type PrepareImageOptions = {
  /** Overrides the 1008px default -- a crop reader wants a different base width than a whole-page read. */
  targetWidth?: number;
  /**
   * accuracy3 Step 4: the caller's own measurement of median text line
   * height AS IT WOULD RENDER at targetWidth's scale (i.e. "if this image
   * were sent at targetWidth, how tall would a text line be"). Below 32px
   * -- the same threshold Step 1.3's per-strip PP-OCR upscale rule already
   * uses -- small print stops reading reliably, so targetWidth is scaled
   * up by the ratio needed to reach exactly 32px. Omit when unknown; no
   * upscaling happens without this measurement.
   */
  medianLineHeightPx?: number;
};

// accuracy3 Step 4: caps how far the upscale rule above can grow the sent
// image's long side (whichever of width/height is larger on the ORIGINAL
// image, since aspect ratio is preserved throughout). Unbounded upscaling
// would burn real latency/memory on a model call for diminishing
// readability return past this point.
const MAX_LONG_SIDE = 1568;

const MIN_READABLE_LINE_HEIGHT_PX = 32;

/**
 * Resize a PNG image to fit the VLM input constraints:
 * - Width: `targetWidth` (default 1008), upscaled per `medianLineHeightPx`
 *   (see PrepareImageOptions), capped so neither dimension exceeds 1568px
 * - Height: rounded to the nearest multiple of 28 (min 28), preserving aspect ratio
 * Returns metadata required to interpret model responses.
 */
export async function prepareImage(image: Buffer, options: PrepareImageOptions = {}): Promise<VlmImage> {
  const meta = await sharp(image).metadata();
  const originalWidth = meta.width!;
  const originalHeight = meta.height!;
  const baseTargetWidth = options.targetWidth ?? 1008;

  let sentWidth = baseTargetWidth;
  if (
    options.medianLineHeightPx !== undefined &&
    options.medianLineHeightPx > 0 &&
    options.medianLineHeightPx < MIN_READABLE_LINE_HEIGHT_PX
  ) {
    sentWidth = Math.round(baseTargetWidth * (MIN_READABLE_LINE_HEIGHT_PX / options.medianLineHeightPx));
  }

  // Cap the long side at MAX_LONG_SIDE, preserving the ORIGINAL image's
  // own aspect ratio (not the sent image's, which hasn't been decided
  // yet) to decide whether width or height is the one to cap.
  if (originalHeight <= originalWidth) {
    sentWidth = Math.min(sentWidth, MAX_LONG_SIDE);
  } else {
    const maxWidthForHeightCap = Math.floor((MAX_LONG_SIDE * originalWidth) / originalHeight);
    sentWidth = Math.min(sentWidth, maxWidthForHeightCap);
  }

  // Height must be a multiple of 28 for the model's sliding window.
  // Original aspect ratio is preserved.
  const sentHeight = Math.max(28, Math.floor((originalHeight * sentWidth / originalWidth) / 28) * 28);
  const base64 = (
    await sharp(image)
      .resize({ width: sentWidth, height: sentHeight, fit: 'fill' })
      .png()
      .toBuffer()
  ).toString('base64');

  return {
    base64,
    sentWidth,
    sentHeight,
    originalWidth,
    originalHeight
  };
}

/** The real Ollama VLM client, backed by the live service. */
export const ollamaClient: VlmClient = {
  askJson
};

/**
 * Ask the Ollama VLM service a structured question about an image.
 * Returns null if:
 * - The VLM is disabled (OLLAMA_URL not set)
 * - The service is unreachable or returns a non-2xx status
 * - The response cannot be parsed as JSON
 * - Any network error occurs (logged once per process)
 */
export async function askJson(
  image: VlmImage,
  prompt: string,
  schema: object
): Promise<unknown | null> {
  // VLM is OFF unless explicitly enabled.
  if (!isVlmEnabled()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ollamaTimeoutMs);

  try {
    const response = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.ollamaVlmModel,
        stream: false,
        options: { temperature: 0 },
        format: schema,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [image.base64]
          }
        ]
      }),
      signal: controller.signal
    });

    // Non-2xx responses are a service error, not a resolver failure. Ollama
    // puts the reason in the body ({"error":"model 'x' not found"}) — surface
    // it, because a bare 404 hides which model the operator has to pull.
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[ollamaVlm] HTTP ${response.status} from ${env.ollamaUrl} (model ${env.ollamaVlmModel})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      return null;
    }

    const body = (await response.json()) as Record<string, unknown>;
    const content = (body.message as Record<string, unknown> | undefined)?.content;

    // Response must contain a parseable JSON string.
    if (typeof content !== 'string') {
      console.warn('[ollamaVlm] No valid content in response');
      return null;
    }

    try {
      return JSON.parse(content);
    } catch {
      console.warn('[ollamaVlm] Failed to parse JSON from model');
      return null;
    }
  } catch (error) {
    // Network error or abort: warn ONCE per process so the operator knows
    // the resolver is unavailable without spamming the log.
    if (!hasWarnedAboutUnreachable) {
      hasWarnedAboutUnreachable = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ollamaVlm] unreachable — VLM resolvers disabled: ${message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
