import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type LogoBox,
  type VlmClient,
  type VlmImage,
  LOGO_BOX_SCHEMA,
  buildLogoPrompt,
  validateVlmBox,
  brandWordmarkBox,
  locateLogo
} from '../services/logoLocator.service';
import type { OcrLine } from '../services/paddleOcr.service';
import type { Rectangle } from '../services/tesseract.service';

test('buildLogoPrompt returns exact format', () => {
  const prompt = buildLogoPrompt(1008, 896);
  assert.equal(
    prompt,
    'This image is 1008x896 pixels. Detect the brand logo — the graphic emblem or symbol mark (not the nutrition table, not paragraphs of text). Output its bounding box as bbox_2d: [x1, y1, x2, y2] in pixel coordinates of this image, and a short label.'
  );
});

test('LOGO_BOX_SCHEMA has correct structure', () => {
  const schema = LOGO_BOX_SCHEMA as any;
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.bbox_2d.type, 'array');
  assert.equal(schema.properties.bbox_2d.minItems, 4);
  assert.equal(schema.properties.bbox_2d.maxItems, 4);
  assert.equal(schema.properties.label.type, 'string');
  assert.deepEqual(schema.required, ['bbox_2d', 'label']);
});

test('validateVlmBox rejects negative or zero dimensions', () => {
  const box: LogoBox = { x0: 10, y0: 10, x1: 10, y1: 10 }; // zero dimensions
  assert.equal(validateVlmBox(box, 1008, 896, []), false);

  const box2: LogoBox = { x0: 100, y0: 100, x1: 50, y1: 150 }; // x0 > x1 (caller should order)
  assert.equal(validateVlmBox(box2, 1008, 896, []), false);
});

test('validateVlmBox checks area fraction in [0.0005, 0.12]', () => {
  const pageArea = 1008 * 896;

  // Too small: 100 px² area / page area < 0.0005
  const tinyBox: LogoBox = { x0: 0, y0: 0, x1: 10, y1: 10 };
  assert.equal(validateVlmBox(tinyBox, 1008, 896, []), false);

  // Valid: ~60000 px² area / page area ≈ 0.0663 (in [0.0005, 0.12])
  const goodBox: LogoBox = { x0: 100, y0: 100, x1: 345, y1: 274 }; // 245*174 ≈ 42630
  assert.equal(validateVlmBox(goodBox, 1008, 896, []), true);

  // Too large: > 12% of page
  const largeBox: LogoBox = { x0: 0, y0: 0, x1: 1008, y1: 107 }; // ≈ 12% of 896
  assert.equal(validateVlmBox(largeBox, 1008, 896, []), false);
});

test('validateVlmBox checks aspect ratio in [0.2, 5]', () => {
  // Aspect 10:1 (too wide)
  const wideBox: LogoBox = { x0: 0, y0: 0, x1: 100, y1: 10 };
  assert.equal(validateVlmBox(wideBox, 1008, 896, []), false);

  // Aspect 1:10 (too tall)
  const tallBox: LogoBox = { x0: 0, y0: 0, x1: 10, y1: 100 };
  assert.equal(validateVlmBox(tallBox, 1008, 896, []), false);

  // Valid aspect ratio 2:1
  const validBox: LogoBox = { x0: 0, y0: 0, x1: 100, y1: 50 };
  assert.equal(validateVlmBox(validBox, 1008, 896, []), true);
});

test('validateVlmBox checks coverage by body text < 0.5', () => {
  const box: LogoBox = { x0: 100, y0: 100, x1: 300, y1: 300 }; // 200*200 = 40000

  // Body text covering 90%
  const coveringRects: Rectangle[] = [
    { left: 100, top: 100, width: 200, height: 180 } // covers 200*180 = 36000, which is 90%
  ];
  assert.equal(validateVlmBox(box, 1008, 896, coveringRects), false);

  // Body text covering 30%
  const partialRects: Rectangle[] = [
    { left: 100, top: 100, width: 200, height: 60 } // covers 200*60 = 12000, which is 30%
  ];
  assert.equal(validateVlmBox(box, 1008, 896, partialRects), true);
});

test('(a) VLM logo detection with no body text', async () => {
  const pageImage = { width: 1008, height: 896 };
  const vlmImage: VlmImage = {
    base64: 'fake',
    sentWidth: 1008,
    sentHeight: 896,
    originalWidth: 1008,
    originalHeight: 896
  };

  const fakeClient: VlmClient = {
    askJson: async () => ({ bbox_2d: [304, 145, 386, 197], label: 'leaf emblem' })
  };

  const result = await locateLogo(pageImage, vlmImage, [], '', fakeClient);

  assert.deepEqual(result, {
    box: { x0: 304, y0: 145, x1: 386, y1: 197 },
    source: 'vlm'
  });
});

test('(b) VLM logo rejected by coverage, brand wordmark fallback succeeds', async () => {
  const pageImage = { width: 1008, height: 896 };
  const vlmImage: VlmImage = {
    base64: 'fake',
    sentWidth: 1008,
    sentHeight: 896,
    originalWidth: 1008,
    originalHeight: 896
  };

  // Setup: VLM box will be [304, 145, 386, 197] (82×52 area)
  // We add a body-text OCR line (< 40px tall) that covers 90% of the VLM box
  // to cause VLM validation to fail, then fallback to brand wordmark
  const ocrLines: OcrLine[] = [
    // Body text line covering the VLM box area (height 30 < 40)
    {
      text: 'BODY',
      box: { x0: 304, y0: 145, x1: 386, y1: 175 }, // 82×30, covers almost entire VLM box vertically
      confidence: 0.95
    },
    // Brand wordmark line
    {
      text: 'NUTRINOL',
      box: { x0: 600, y0: 220, x1: 680, y1: 290 },
      confidence: 0.95
    }
  ];

  const fakeClient: VlmClient = {
    askJson: async () => ({ bbox_2d: [304, 145, 386, 197], label: 'leaf emblem' })
  };

  const result = await locateLogo(pageImage, vlmImage, ocrLines, 'Nutrinol', fakeClient);

  // VLM box should be rejected due to body text coverage
  // Fallback should use brand wordmark
  // Height of NUTRINOL = 70, pad = 0.15 * 70 = 10.5
  // Rounding rule: Math.round uses "round half away from zero" (not banker's rounding).
  // So .5 always rounds up: 589.5→590, 209.5→210, 690.5→691, 300.5→301
  // x0: 600 - 10.5 = 589.5 → 590
  // y0: 220 - 10.5 = 209.5 → 210
  // x1: 680 + 10.5 = 690.5 → 691
  // y1: 290 + 10.5 = 300.5 → 301

  assert.equal(result?.source, 'brand-wordmark');
  assert.equal(result?.box.x0, 590);
  assert.equal(result?.box.y0, 210);
  assert.equal(result?.box.x1, 691);
  assert.equal(result?.box.y1, 301);
});

test('(c) VLM returns tiny 3x3 box, rejected by area, no brand line, returns null', async () => {
  const pageImage = { width: 1008, height: 896 };
  const vlmImage: VlmImage = {
    base64: 'fake',
    sentWidth: 1008,
    sentHeight: 896,
    originalWidth: 1008,
    originalHeight: 896
  };

  const fakeClient: VlmClient = {
    askJson: async () => ({ bbox_2d: [100, 100, 103, 103], label: 'tiny' }) // 3x3
  };

  const result = await locateLogo(pageImage, vlmImage, [], '', fakeClient);
  assert.equal(result, null);
});

test('(d) vlmImage is null, client NOT called, wordmark fallback only', async () => {
  const pageImage = { width: 1008, height: 896 };

  let clientCalled = false;
  const fakeClient: VlmClient = {
    askJson: async () => {
      clientCalled = true;
      return null;
    }
  };

  const ocrLines: OcrLine[] = [
    {
      text: 'BRAND',
      box: { x0: 100, y0: 100, x1: 200, y1: 150 },
      confidence: 0.9
    }
  ];

  const result = await locateLogo(pageImage, null, ocrLines, 'BRAND', fakeClient);

  assert.equal(clientCalled, false);
  assert.equal(result?.source, 'brand-wordmark');
});

test('(e) Scale mapping: VLM dimensions scaled to page dimensions', async () => {
  const pageImage = { width: 1008, height: 896 };
  const vlmImage: VlmImage = {
    base64: 'fake',
    sentWidth: 504,
    sentHeight: 448,
    originalWidth: 504,
    originalHeight: 448
  };

  // sx = 1008 / 504 = 2, sy = 896 / 448 = 2
  const fakeClient: VlmClient = {
    askJson: async () => ({ bbox_2d: [152, 72, 193, 98], label: 'logo' })
  };

  const result = await locateLogo(pageImage, vlmImage, [], '', fakeClient);

  // 152*2 = 304, 72*2 = 144, 193*2 = 386, 98*2 = 196
  assert.deepEqual(result, {
    box: { x0: 304, y0: 144, x1: 386, y1: 196 },
    source: 'vlm'
  });
});

test('(f) validateVlmBox with aspect ratio 10:1 returns false', () => {
  // 100 width, 10 height = aspect 10:1
  const box: LogoBox = { x0: 0, y0: 0, x1: 100, y1: 10 };
  assert.equal(validateVlmBox(box, 1008, 896, []), false);
});

test('(g) brandWordmarkBox picks tallest and matches tokens', () => {
  const ocrLines: OcrLine[] = [
    {
      text: 'NUTRINOL',
      box: { x0: 100, y0: 100, x1: 200, y1: 130 }, // height 30
      confidence: 0.9
    },
    {
      text: 'NUTRINOL',
      box: { x0: 300, y0: 200, x1: 400, y1: 280 }, // height 80 (tallest)
      confidence: 0.95
    }
  ];

  const result = brandWordmarkBox(ocrLines, 'nutrinol');
  assert.equal(result !== null, true);
  // Should pick the tallest (300, 200, 400, 280) with height 80
  // Pad by 0.15 * 80 = 12
  // Expected: x0=288, y0=188, x1=412, y1=292
  assert.equal(result?.x0, 288);
  assert.equal(result?.y0, 188);
  assert.equal(result?.x1, 412);
  assert.equal(result?.y1, 292);
});

test('(g) brandWordmarkBox matches brand as token inside longer text', () => {
  const ocrLines: OcrLine[] = [
    {
      text: 'NUTRINOL GUMMIES',
      box: { x0: 100, y0: 100, x1: 300, y1: 150 },
      confidence: 0.95
    }
  ];

  // 'nutrinol' should match as a token inside 'NUTRINOL GUMMIES'
  const result = brandWordmarkBox(ocrLines, 'nutrinol');
  assert.equal(result !== null, true);
});

test('(g) brandWordmarkBox does not match partial tokens', () => {
  const ocrLines: OcrLine[] = [
    {
      text: 'NUTRINOLX',
      box: { x0: 100, y0: 100, x1: 300, y1: 150 },
      confidence: 0.95
    }
  ];

  // 'nutrinol' should NOT match inside 'NUTRINOLX' (not a whole token)
  const result = brandWordmarkBox(ocrLines, 'nutrinol');
  assert.equal(result, null);
});
