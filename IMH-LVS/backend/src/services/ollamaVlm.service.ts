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

/**
 * Resize a PNG image to fit the VLM input constraints:
 * - Width: exactly 1008 pixels
 * - Height: rounded to the nearest multiple of 28 (min 28), preserving aspect ratio
 * Returns metadata required to interpret model responses.
 */
export async function prepareImage(image: Buffer): Promise<VlmImage> {
  const meta = await sharp(image).metadata();
  const sentWidth = 1008;
  // Height must be a multiple of 28 for the model's sliding window.
  // Original aspect ratio is preserved.
  const sentHeight = Math.max(28, Math.floor((meta.height! * 1008 / meta.width!) / 28) * 28);
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
    originalWidth: meta.width!,
    originalHeight: meta.height!
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

    // Non-2xx responses are a service error, not a resolver failure.
    if (!response.ok) {
      console.warn(`[ollamaVlm] HTTP ${response.status}`);
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
