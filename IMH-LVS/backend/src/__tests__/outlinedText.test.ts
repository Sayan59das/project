import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  projectSpanToPixels,
  coverageFraction,
  looksLikeDisplayText,
  findOutlinedLines,
  planOcrStrips,
  dropStripEdgeLines,
  dedupeOverlappingLines,
  medianLineHeight,
  mapRotatedBoxToPage,
  type OcrLineLike
} from '../services/outlinedText.service';
import type { Rectangle } from '../services/tesseract.service';

test('projectSpanToPixels: rotation 0', () => {
  const span = { x: 72, y: 72, width: 144, height: 36, rotation: 0 };
  const pageHeightPt = 792;
  const dpi = 300;
  const result = projectSpanToPixels(span, pageHeightPt, dpi);

  const s = dpi / 72; // 300/72 = 4.1667
  const expectedLeft = 72 * s; // 300
  const expectedTop = (792 - 108) * s; // 684 * 4.1667 = 2850
  const expectedWidth = 144 * s; // 600
  const expectedHeight = 36 * s; // 150

  assert.ok(Math.abs(result.left - expectedLeft) < 1e-6, `left: ${result.left} vs ${expectedLeft}`);
  assert.ok(Math.abs(result.top - expectedTop) < 1e-6, `top: ${result.top} vs ${expectedTop}`);
  assert.ok(Math.abs(result.width - expectedWidth) < 1e-6, `width: ${result.width} vs ${expectedWidth}`);
  assert.ok(Math.abs(result.height - expectedHeight) < 1e-6, `height: ${result.height} vs ${expectedHeight}`);
});

test('projectSpanToPixels: rotation PI/2', () => {
  const span = { x: 100, y: 100, width: 50, height: 10, rotation: Math.PI / 2 };
  const pageHeightPt = 792;
  const dpi = 300;
  const result = projectSpanToPixels(span, pageHeightPt, dpi);

  const s = dpi / 72;

  // After 90° rotation:
  // Corner (0, 0): X = 0 * 0 - 0 * 1 + 100 = 100, Y = 0 * 1 + 0 * 0 + 100 = 100
  // Corner (50, 0): X = 50 * 0 - 0 * 1 + 100 = 100, Y = 50 * 1 + 0 * 0 + 100 = 150
  // Corner (50, 10): X = 50 * 0 - 10 * 1 + 100 = 90, Y = 50 * 1 + 10 * 0 + 100 = 150
  // Corner (0, 10): X = 0 * 0 - 10 * 1 + 100 = 90, Y = 0 * 1 + 10 * 0 + 100 = 100
  // minX = 90, maxX = 100, minY = 100, maxY = 150

  const expectedLeft = 90 * s;
  const expectedTop = (pageHeightPt - 150) * s;
  const expectedWidth = 10 * s;
  const expectedHeight = 50 * s;

  assert.ok(Math.abs(result.left - expectedLeft) < 1e-6, `left: ${result.left} vs ${expectedLeft}`);
  assert.ok(Math.abs(result.top - expectedTop) < 1e-6, `top: ${result.top} vs ${expectedTop}`);
  assert.ok(Math.abs(result.width - expectedWidth) < 1e-6, `width: ${result.width} vs ${expectedWidth}`);
  assert.ok(Math.abs(result.height - expectedHeight) < 1e-6, `height: ${result.height} vs ${expectedHeight}`);
});

test('coverageFraction: no rects', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const result = coverageFraction(box, []);
  assert.equal(result, 0);
});

test('coverageFraction: one rect fully containing the box', () => {
  const box = { x0: 10, y0: 10, x1: 90, y1: 90 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 100, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 1);
});

test('coverageFraction: a rect covering exactly the left half', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 50, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 0.5);
});

test('coverageFraction: two identical full rects capped at 1', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const rects: Rectangle[] = [
    { left: 0, top: 0, width: 100, height: 100 },
    { left: 0, top: 0, width: 100, height: 100 }
  ];
  const result = coverageFraction(box, rects);
  assert.equal(result, 1);
});

test('coverageFraction: degenerate box (x1 === x0)', () => {
  const box = { x0: 50, y0: 0, x1: 50, y1: 100 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 100, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 0);
});

test('looksLikeDisplayText: returns true for valid display text', () => {
  const validTexts = ['Homeo-Vita', 'MULTIVITAMIN', 'GUMMIES', 'She- Arise', 'Net Content: 30 N'];
  for (const text of validTexts) {
    assert.equal(looksLikeDisplayText(text), true, `Should be true for "${text}"`);
  }
});

test('looksLikeDisplayText: returns false for invalid text', () => {
  const invalidTexts = ['WW 08', 'WW 03 Gondl io! HOMOEOPATHY Sed Lijy HOMOEOPATHY S', '30', '|', ':', '', '=) es'];
  for (const text of invalidTexts) {
    assert.equal(looksLikeDisplayText(text), false, `Should be false for "${text}"`);
  }
});

test('findOutlinedLines: with default options', () => {
  // Synthetic test lines
  const lines: OcrLineLike[] = [
    {
      text: 'Homeo-Vita',
      box: { x0: 0, y0: 0, x1: 100, y1: 137 },
      confidence: 0.98
    },
    {
      text: 'GUMMIES',
      box: { x0: 0, y0: 150, x1: 100, y1: 219 },
      confidence: 0.99
    },
    {
      text: 'NUTRITIONAL INFORMATION',
      box: { x0: 0, y0: 250, x1: 200, y1: 310 },
      confidence: 0.95
    },
    {
      text: 'Faint',
      box: { x0: 0, y0: 350, x1: 100, y1: 430 },
      confidence: 0.4
    },
    {
      text: 'tiny',
      box: { x0: 0, y0: 500, x1: 50, y1: 520 },
      confidence: 0.99
    },
    {
      text: 'gummies',
      box: { x0: 0, y0: 550, x1: 80, y1: 600 },
      confidence: 0.9
    }
  ];

  // Create a rectangle that covers line C (NUTRITIONAL INFORMATION) at 90%
  const spanRects: Rectangle[] = [
    {
      left: 0,
      top: 250,
      width: 180, // 90% of 200
      height: 60
    }
  ];

  const result = findOutlinedLines(lines, spanRects);

  // Expected: A, B (in that order by height desc)
  // A: 'Homeo-Vita' h=137, covered=0, conf=0.98 -> keep
  // B: 'GUMMIES' h=69, covered=0, conf=0.99 -> keep
  // C: 'NUTRITIONAL INFORMATION' h=60, covered=0.9, conf=0.95 -> filtered (coverage > 0.3)
  // D: 'Faint' h=80, covered=0, conf=0.4 -> filtered (conf < 0.6)
  // E: 'tiny' h=20, covered=0, conf=0.99 -> filtered (height < 40)
  // F: 'gummies' h=50, covered=0, conf=0.9 -> keep, but deduped with B

  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'Homeo-Vita');
  assert.equal(result[1].text, 'GUMMIES');
});

test('findOutlinedLines: with custom options and empty spanRects', () => {
  const lines: OcrLineLike[] = [
    {
      text: 'Homeo-Vita',
      box: { x0: 0, y0: 0, x1: 100, y1: 137 },
      confidence: 0.98
    },
    {
      text: 'GUMMIES',
      box: { x0: 0, y0: 150, x1: 100, y1: 219 },
      confidence: 0.99
    },
    {
      text: 'NUTRITIONAL INFORMATION',
      box: { x0: 0, y0: 250, x1: 200, y1: 310 },
      confidence: 0.95
    },
    {
      text: 'Faint',
      box: { x0: 0, y0: 350, x1: 100, y1: 430 },
      confidence: 0.4
    },
    {
      text: 'tiny',
      box: { x0: 0, y0: 500, x1: 50, y1: 520 },
      confidence: 0.99
    },
    {
      text: 'gummies',
      box: { x0: 0, y0: 550, x1: 80, y1: 600 },
      confidence: 0.9
    }
  ];

  const result = findOutlinedLines(lines, [], { minHeightPx: 10 });

  // Expected: A, B, C, E (in that order by height desc, then y0 asc)
  // A: 'Homeo-Vita' h=137, conf=0.98 -> keep
  // B: 'GUMMIES' h=69, conf=0.99 -> keep
  // C: 'NUTRITIONAL INFORMATION' h=60, conf=0.95 -> keep (now uncovered)
  // D: 'Faint' h=80, conf=0.4 -> filtered (conf < 0.6)
  // E: 'tiny' h=20 px, conf=0.99 -> passes minHeightPx=10
  // F: 'gummies' h=50, conf=0.9 -> deduped with B

  // Sort by height desc: A(137), D(80), B(69), C(60), F(50), E(10)
  // After filtering out D and deduping F: A(137), B(69), C(60), E(10)
  // By height desc then y0 asc: A, B, C, E

  assert.equal(result.length, 4);
  assert.equal(result[0].text, 'Homeo-Vita');
  assert.equal(result[1].text, 'GUMMIES');
  assert.equal(result[2].text, 'NUTRITIONAL INFORMATION');
  assert.equal(result[3].text, 'tiny');
});

test('planOcrStrips: no ranges → whole page', () => {
  const strips = planOcrStrips([], 3621, 40);
  assert.equal(strips.length, 1);
  assert.equal(strips[0].left, 0);
  assert.equal(strips[0].width, 3621);
});

test('planOcrStrips: two ranges [289,1282] and [2484,3335] on width 3621 with pad 40', () => {
  const panelXRanges = [
    { left: 289, right: 1282 },
    { left: 2484, right: 3335 }
  ];
  const strips = planOcrStrips(panelXRanges, 3621, 40);

  // Panel strip 1: [289-40, 1282+40] = [249, 1322]
  // Panel strip 2: [2484-40, 3335+40] = [2444, 3375]
  // Gap 1: [0, 249) width 249 < 8% * 3621 = 289.68 → dropped
  // Gap 2: [1322, 2444) width 1122 >= 289.68 → included
  // Gap 3: (3375, 3621] width 246 < 289.68 → dropped

  assert.equal(strips.length, 3);
  assert.equal(strips[0].left, 249);
  assert.equal(strips[0].width, 1073); // 1322 - 249
  assert.equal(strips[1].left, 1322);
  assert.equal(strips[1].width, 1122); // 2444 - 1322
  assert.equal(strips[2].left, 2444);
  assert.equal(strips[2].width, 931); // 3375 - 2444
});

test('planOcrStrips: overlapping ranges merge into one', () => {
  const panelXRanges = [
    { left: 100, right: 300 },
    { left: 250, right: 400 }
  ];
  const strips = planOcrStrips(panelXRanges, 1000, 10);

  // Padded: [90, 310] and [240, 410]
  // After merging: [90, 410]
  // Panel strip: [90, 410]
  // Gap 1: [0, 90) width 90 >= 8% * 1000 = 80 → included
  // Gap 2: (410, 1000] width 590 >= 80 → included

  assert.equal(strips.length, 3);
  assert.equal(strips[0].left, 0);
  assert.equal(strips[0].width, 90);
  assert.equal(strips[1].left, 90);
  assert.equal(strips[1].width, 320); // 410 - 90
  assert.equal(strips[2].left, 410);
  assert.equal(strips[2].width, 590); // 1000 - 410
});

test('planOcrStrips: a gap narrower than minGapFraction is dropped', () => {
  const panelXRanges = [
    { left: 100, right: 200 },
    { left: 250, right: 350 }
  ];
  const strips = planOcrStrips(panelXRanges, 1000, 10, 0.1);

  // Padded: [90, 210] and [240, 360]
  // Gap: [210, 240] width 30 < 10% * 1000 = 100 → dropped
  // Panel strips: [90, 210] and [240, 360]
  // Gap 1: [0, 90) width 90 < 100 → dropped
  // Gap 2: (360, 1000] width 640 >= 100 → included

  assert.equal(strips.length, 3);
  assert.equal(strips[0].left, 90);
  assert.equal(strips[0].width, 120); // 210 - 90
  assert.equal(strips[1].left, 240);
  assert.equal(strips[1].width, 120); // 360 - 240
  assert.equal(strips[2].left, 360);
  assert.equal(strips[2].width, 640); // 1000 - 360
});

test('dropStripEdgeLines: strip {left:1282,width:1202} on pageWidth 3621', () => {
  const lines: OcrLineLike[] = [
    { text: 'left-cut', box: { x0: 2, y0: 0, x1: 100, y1: 50 }, confidence: 0.9 }, // x0=2 <= marginPx=6 → dropped
    { text: 'right-cut', box: { x0: 100, y0: 0, x1: 1199, y1: 50 }, confidence: 0.9 }, // x1=1199 >= strip.width-marginPx=1196 → dropped
    { text: 'middle', box: { x0: 40, y0: 0, x1: 900, y1: 50 }, confidence: 0.9 } // kept
  ];

  const result = dropStripEdgeLines(lines, { left: 1282, width: 1202 }, 3621);

  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'middle');
});

test('dropStripEdgeLines: strip {left:0,width:1322} keeps page-edge left-touching lines', () => {
  const lines: OcrLineLike[] = [
    { text: 'page-left', box: { x0: 2, y0: 0, x1: 100, y1: 50 }, confidence: 0.9 }, // x0=2 <= marginPx=6, but strip.left=0 → kept
    { text: 'right-cut', box: { x0: 100, y0: 0, x1: 1320, y1: 50 }, confidence: 0.9 } // x1=1320 >= strip.width-marginPx=1316 → dropped
  ];

  const result = dropStripEdgeLines(lines, { left: 0, width: 1322 }, 3621);

  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'page-left');
});

test('dropStripEdgeLines: strip covering whole page keeps everything', () => {
  const lines: OcrLineLike[] = [
    { text: 'left-touching', box: { x0: 2, y0: 0, x1: 100, y1: 50 }, confidence: 0.9 },
    { text: 'right-touching', box: { x0: 100, y0: 0, x1: 3615, y1: 50 }, confidence: 0.9 },
    { text: 'middle', box: { x0: 40, y0: 0, x1: 900, y1: 50 }, confidence: 0.9 }
  ];

  const result = dropStripEdgeLines(lines, { left: 0, width: 3621 }, 3621);

  assert.equal(result.length, 3);
});

test('dropStripEdgeLines: height-proportional margin catches tall wordmark fragments', () => {
  const lines: OcrLineLike[] = [
    // Tall line (h=122): threshold = Math.max(6, 0.5*122) = 61
    { text: 'tall-left-cut', box: { x0: 14, y0: 0, x1: 300, y1: 122 }, confidence: 0.9 }, // x0=14 <= 61 → dropped
    { text: 'tall-safe', box: { x0: 80, y0: 0, x1: 300, y1: 122 }, confidence: 0.9 }, // x0=80 > 61 → kept
    // Short line (h=20): threshold = Math.max(6, 0.5*20) = 10
    { text: 'short-left-cut', box: { x0: 14, y0: 0, x1: 100, y1: 20 }, confidence: 0.9 } // x0=14 > 10 → kept
  ];

  const result = dropStripEdgeLines(lines, { left: 1282, width: 1202 }, 3621);

  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'tall-safe');
  assert.equal(result[1].text, 'short-left-cut');
});

test('dedupeOverlappingLines: a later higher-confidence duplicate wins exactly once (never pushed twice)', () => {
  const lines: OcrLineLike[] = [
    { text: 'Homeo-Vita', box: { x0: 100, y0: 100, x1: 400, y1: 160 }, confidence: 0.8 },
    { text: 'GUMMIES', box: { x0: 100, y0: 300, x1: 300, y1: 350 }, confidence: 0.9 },
    { text: 'Homeo-Vita', box: { x0: 102, y0: 101, x1: 401, y1: 161 }, confidence: 0.95 }
  ];
  const out = dedupeOverlappingLines(lines);
  assert.deepEqual(
    out.map((l) => [l.text, l.confidence]),
    [['Homeo-Vita', 0.95], ['GUMMIES', 0.9]]
  );
});

test('dedupeOverlappingLines: an earlier higher-confidence read keeps its position; non-overlapping lines untouched', () => {
  const lines: OcrLineLike[] = [
    { text: 'A', box: { x0: 0, y0: 0, x1: 100, y1: 50 }, confidence: 0.99 },
    { text: 'A', box: { x0: 1, y0: 0, x1: 101, y1: 50 }, confidence: 0.5 },
    { text: 'B', box: { x0: 0, y0: 200, x1: 100, y1: 250 }, confidence: 0.7 },
    { text: 'C', box: { x0: 50, y0: 0, x1: 150, y1: 50 }, confidence: 0.7 } // IoU with A = 0.33, kept
  ];
  const out = dedupeOverlappingLines(lines);
  assert.deepEqual(out.map((l) => l.text), ['A', 'B', 'C']);
  assert.equal(out[0].confidence, 0.99);
});

// accuracy3 Step 1.3: the per-strip upscale trigger.
test('medianLineHeight: empty array → 0', () => {
  assert.equal(medianLineHeight([]), 0);
});

test('medianLineHeight: odd count → the middle value', () => {
  const lines: OcrLineLike[] = [
    { text: 'a', box: { x0: 0, y0: 0, x1: 10, y1: 20 }, confidence: 0.9 }, // height 20
    { text: 'b', box: { x0: 0, y0: 0, x1: 10, y1: 50 }, confidence: 0.9 }, // height 50
    { text: 'c', box: { x0: 0, y0: 0, x1: 10, y1: 30 }, confidence: 0.9 } // height 30
  ];
  assert.equal(medianLineHeight(lines), 30);
});

test('medianLineHeight: even count → average of the two middle values', () => {
  const lines: OcrLineLike[] = [
    { text: 'a', box: { x0: 0, y0: 0, x1: 10, y1: 20 }, confidence: 0.9 }, // height 20
    { text: 'b', box: { x0: 0, y0: 0, x1: 10, y1: 40 }, confidence: 0.9 } // height 40
  ];
  assert.equal(medianLineHeight(lines), 30);
});

// accuracy3 Step 1.2: rotated-pass box remapping back into page coordinates.
test('mapRotatedBoxToPage: angle 90 maps a top-left source box to the destination top-right region', () => {
  // Original page 100 wide x 200 tall. A box near the rotated image's
  // top-left corner (small x0/y0) should land near the ORIGINAL page's
  // top-right after inverting a 90deg clockwise rotation.
  const rotatedBox = { x0: 0, y0: 0, x1: 20, y1: 10 };
  const mapped = mapRotatedBoxToPage(rotatedBox, 90, 100, 200);
  assert.ok(mapped.x0 >= 0 && mapped.x1 <= 100, `x within original page width: ${JSON.stringify(mapped)}`);
  assert.ok(mapped.y0 >= 0 && mapped.y1 <= 200, `y within original page height: ${JSON.stringify(mapped)}`);
  // x-range comes from the rotated box's y-range (0..10)
  assert.equal(mapped.x0, 0);
  assert.equal(mapped.x1, 10);
  // y-range comes from H minus the rotated box's x-range (reversed): 200-20=180..200-0=200
  assert.equal(mapped.y0, 180);
  assert.equal(mapped.y1, 200);
});

test('mapRotatedBoxToPage: angle 270 maps a top-left source box to the destination bottom-left region', () => {
  const rotatedBox = { x0: 0, y0: 0, x1: 20, y1: 10 };
  const mapped = mapRotatedBoxToPage(rotatedBox, 270, 100, 200);
  assert.ok(mapped.x0 >= 0 && mapped.x1 <= 100, `x within original page width: ${JSON.stringify(mapped)}`);
  assert.ok(mapped.y0 >= 0 && mapped.y1 <= 200, `y within original page height: ${JSON.stringify(mapped)}`);
  // x-range comes from W minus the rotated box's y-range (reversed): 100-10=90..100-0=100
  assert.equal(mapped.x0, 90);
  assert.equal(mapped.x1, 100);
  // y-range comes directly from the rotated box's x-range (0..20)
  assert.equal(mapped.y0, 0);
  assert.equal(mapped.y1, 20);
});

test('mapRotatedBoxToPage: 90 then 270 on the same original box round-trips back to itself', () => {
  // A box on the ORIGINAL page, forward-rotated by hand using the inverse
  // of mapRotatedBoxToPage's own formula (i.e. simulating what a rotated
  // scan would have read for this same real box), then mapped back --
  // confirms the two angles are true inverses of each other's geometry,
  // not just independently-plausible-looking formulas.
  const pageWidth = 120;
  const pageHeight = 240;
  const original = { x0: 10, y0: 30, x1: 40, y1: 90 };

  // Forward transform for angle=90 (dest_x = H-y, dest_y = x), inverse of
  // the x0=box.y0/x1=box.y1/y0=H-box.x1/y1=H-box.x0 formula above.
  const rotated90 = {
    x0: pageHeight - original.y1,
    x1: pageHeight - original.y0,
    y0: original.x0,
    y1: original.x1
  };
  const mappedBack90 = mapRotatedBoxToPage(rotated90, 90, pageWidth, pageHeight);
  assert.deepEqual(mappedBack90, original);

  // Forward transform for angle=270 (dest_x = y, dest_y = W-x), inverse of
  // the x0=W-box.y1/x1=W-box.y0/y0=box.x0/y1=box.x1 formula above.
  const rotated270 = {
    x0: original.y0,
    x1: original.y1,
    y0: pageWidth - original.x1,
    y1: pageWidth - original.x0
  };
  const mappedBack270 = mapRotatedBoxToPage(rotated270, 270, pageWidth, pageHeight);
  assert.deepEqual(mappedBack270, original);
});
