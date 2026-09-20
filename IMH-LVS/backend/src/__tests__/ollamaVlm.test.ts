// Unit tests for ollamaVlm.service.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Helper to require a module freshly (clearing cache)
function requireFresh(modulePath: string) {
  try {
    const envPath = require.resolve('../config/env');
    const servicePath = require.resolve('../services/ollamaVlm.service');
    delete require.cache[envPath];
    delete require.cache[servicePath];
  } catch (e) {
    // Paths might not be resolvable yet, that's fine
  }
  // Also clear any matching entries just in case
  Object.keys(require.cache).forEach((k) => {
    if (k.includes('ollamaVlm.service') || k.includes('config/env')) {
      delete require.cache[k];
    }
  });
  // Require fresh
  return require(modulePath);
}

// Save the initial OLLAMA_URL environment variable
const initialOllamaUrl = process.env.OLLAMA_URL;

// Test: disabled mode (OLLAMA_URL empty)
test('askJson returns null and does not call fetch when VLM is disabled', async () => {
  // Set OLLAMA_URL to empty for this test
  process.env.OLLAMA_URL = '';
  // Using require instead of dynamic import to allow cache clearing
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson } = service;

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response('{}'));
  }) as typeof globalThis.fetch;

  try {
    const image: any = { base64: 'test', sentWidth: 100, sentHeight: 100, originalWidth: 200, originalHeight: 200 };
    const result = await askJson(image, 'test', {});
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    // Restore initial OLLAMA_URL (or set to localhost if not originally set)
    process.env.OLLAMA_URL = initialOllamaUrl || 'http://localhost:11434';
  }
});

// Test: happy path
test('askJson makes correct POST request and returns parsed JSON', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson } = service;

  let capturedRequest: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, opts: any) => {
    capturedRequest = { url, ...opts };
    if (opts.body) {
      capturedRequest.body = JSON.parse(opts.body);
    }
    return new Response(
      JSON.stringify({
        message: { content: '{"a":1}' }
      })
    );
  }) as typeof globalThis.fetch;

  try {
    const testSchema = { type: 'object', properties: { a: { type: 'number' } } };
    const image: any = { base64: 'b64', sentWidth: 100, sentHeight: 100, originalWidth: 200, originalHeight: 200 };
    const result = await askJson(image, 'test prompt', testSchema);

    if (capturedRequest === null) {
      throw new Error('Fetch was not called');
    }
    assert.deepEqual(result, { a: 1 });
    // URL should start with the configured OLLAMA_URL and end with /api/chat
    assert(capturedRequest.url.endsWith('/api/chat'), `URL should end with /api/chat but got ${capturedRequest.url}`);
    assert.equal(capturedRequest.method, 'POST');
    assert.deepEqual(capturedRequest.body.format, testSchema);
    assert.equal(capturedRequest.body.stream, false);
    assert.equal(capturedRequest.body.options.temperature, 0);
    assert.equal(capturedRequest.body.messages[0].images.length, 1);
    assert.equal(capturedRequest.body.messages[0].images[0], 'b64');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Test: HTTP 500
test('askJson returns null on HTTP 500', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson } = service;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const response = new Response('{}', { status: 500 });
    return response;
  }) as typeof globalThis.fetch;

  try {
    const image: any = { base64: 'b64', sentWidth: 100, sentHeight: 100, originalWidth: 200, originalHeight: 200 };
    const result = await askJson(image, 'test', {});
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Test: invalid JSON content
test('askJson returns null when content is not valid JSON', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson } = service;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        message: { content: 'not json' }
      })
    );
  }) as typeof globalThis.fetch;

  try {
    const image: any = { base64: 'b64', sentWidth: 100, sentHeight: 100, originalWidth: 200, originalHeight: 200 };
    const result = await askJson(image, 'test', {});
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Test: network error with singleton warning
test('askJson returns null on fetch rejection and warns only once', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson } = service;

  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let warnCount = 0;
  console.warn = (() => {
    warnCount++;
  }) as any;

  globalThis.fetch = (async () => {
    throw new Error('Network failed');
  }) as typeof globalThis.fetch;

  try {
    const image: any = { base64: 'b64', sentWidth: 100, sentHeight: 100, originalWidth: 200, originalHeight: 200 };
    const result1 = await askJson(image, 'test', {});
    assert.equal(result1, null);
    const warnCountAfterFirst = warnCount;

    const result2 = await askJson(image, 'test', {});
    assert.equal(result2, null);
    // Warn count should not increase on second call
    assert.equal(warnCount, warnCountAfterFirst);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

// Test: prepareImage
test('prepareImage resizes correctly and preserves original dimensions', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;

  // Create a 2000x1500 PNG
  const png = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: 100, b: 100 } }
  })
    .png()
    .toBuffer();

  const result = await prepareImage(png);

  // 1500 * 1008 / 2000 = 756, which is already a multiple of 28
  assert.equal(result.sentWidth, 1008);
  assert.equal(result.sentHeight, 756);
  assert.equal(result.originalWidth, 2000);
  assert.equal(result.originalHeight, 1500);
  assert(result.base64.length > 0, 'base64 should not be empty');
});

// accuracy3 Step 4: generalizing prepareImage beyond the fixed 1008px
// width -- a targetWidth option (a crop reader wants a different default
// than a whole-page read), and an upscale rule when the caller reports the
// text would render too small to read reliably at that width. Same 32px
// threshold Step 1.3's per-strip PP-OCR upscale rule already uses, applied
// here to the image actually sent to the VLM.
test('prepareImage: a custom targetWidth is used instead of the 1008 default', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;
  const png = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  const result = await prepareImage(png, { targetWidth: 1400 });
  assert.equal(result.sentWidth, 1400);
  // 1500 * 1400 / 2000 = 1050, rounded down to the nearest multiple of 28 (1036)
  assert.equal(result.sentHeight, 1036);
});

test('prepareImage: upscales when medianLineHeightPx is below 32px, by the ratio needed to reach 32px', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;
  const png = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  // medianLineHeightPx: 24 -> needs 32/24 = 1.3333x -> targetWidth 1008 * 1.3333 = 1344
  // (kept comfortably under the 1568 long-side cap, tested separately below)
  const result = await prepareImage(png, { medianLineHeightPx: 24 });
  assert.equal(result.sentWidth, 1344);
});

test('prepareImage: does NOT upscale when medianLineHeightPx already meets the 32px threshold', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;
  const png = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  const result = await prepareImage(png, { medianLineHeightPx: 32 });
  assert.equal(result.sentWidth, 1008);
});

test('prepareImage: the upscale is capped so the long side never exceeds 1568px', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;
  // 3200x2400 (wide, width is the long side)
  const png = await sharp({
    create: { width: 3200, height: 2400, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  // Needs 1008 * (32/16) = 2016, which would still be under the cap;
  // use a smaller medianLineHeightPx so the uncapped need clearly exceeds it.
  const result = await prepareImage(png, { medianLineHeightPx: 8 });
  // Uncapped need: 1008 * (32/8) = 4032 -- must be capped to 1568.
  assert.equal(result.sentWidth, 1568);
  assert.ok(result.sentHeight <= 1568, `sentHeight ${result.sentHeight} must not exceed the 1568 long-side cap either`);
});

test('prepareImage: the long-side cap applies to height on a tall (portrait) image, not width', async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { prepareImage } = service;
  // 1200x3600 (tall, height is the long side)
  const png = await sharp({
    create: { width: 1200, height: 3600, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  const result = await prepareImage(png, { medianLineHeightPx: 8 });
  assert.ok(result.sentHeight <= 1568, `sentHeight ${result.sentHeight} must not exceed 1568`);
  assert.ok(result.sentWidth <= 1568, `sentWidth ${result.sentWidth} must not exceed 1568`);
});

// Test: live mode (skipped if OLLAMA_URL not set)
test('live: askJson on red PNG returns colour matching /red/i', { skip: !process.env.OLLAMA_URL }, async () => {
  const service = requireFresh('../services/ollamaVlm.service');
  const { askJson, prepareImage } = service;

  // Create a 400x400 red PNG
  const redPng = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 0, b: 0 } }
  })
    .png()
    .toBuffer();

  const image = await prepareImage(redPng);
  const schema = {
    type: 'object',
    properties: { colour: { type: 'string' } },
    required: ['colour']
  };

  const result = await askJson(image, 'What colour is this image? Answer as JSON.', schema);

  assert(result !== null, 'askJson should return a result');
  assert(typeof result === 'object', 'result should be an object');
  const colourValue = (result as any).colour;
  assert(typeof colourValue === 'string', 'colour should be a string');
  // Model may return "red" or hex code "#FF0000" / "#ff0000"
  assert(/red|#[fF]{2}0000/i.test(colourValue), `colour "${colourValue}" should indicate red`);
});
