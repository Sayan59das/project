// accuracy3 Step 1.1-1.4: scanPageWithPpOcr's rotation/upscale/caching
// extensions, and recoverBodyTextViaPpOcr's every-page iteration. Uses the
// real PP-OCR engine against real fixture pages (same discipline as
// paddleOcr.test.ts) rather than mocking it -- the whole point of these
// features is what the real recognizer does with a rotated or oversized
// image, which a mock can't tell us anything about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { scanPageWithPpOcr, recoverBodyTextViaPpOcr } from '../services/labelExtraction.service';
import { rasterizePdfPages } from '../services/pdf.service';
import { env } from '../config/env';

const fixturesDir = path.join(__dirname, 'fixtures');

async function unicarePage(): Promise<Buffer> {
  const [page] = await rasterizePdfPages(
    readFileSync(path.join(fixturesDir, 'unicare-homeo-vita-gummies.pdf')),
    { maxPages: 1 }
  );
  return page;
}

// scanPageWithPpOcr caches per page-bytes for the process lifetime, so the
// caching test below needs a page no earlier test in this file has already
// scanned -- otherwise its "first" call would silently already be a cache
// hit from a previous test.
async function chyawanprashPage(): Promise<Buffer> {
  const [page] = await rasterizePdfPages(
    readFileSync(path.join(fixturesDir, 'chyawanprash-gummies.pdf')),
    { maxPages: 1 }
  );
  return page;
}

// accuracy3 Step 1.2: rotation passes. No text layer (spans: []) is one of
// the two triggers, so an image-upload-style scan of a label rotated 90deg
// should still recover its own real text -- proving the rotated pass runs,
// the recognizer reads it the right way up, and mapRotatedBoxToPage's
// coordinate math (already unit-tested in outlinedText.test.ts) is wired in
// correctly end to end.
// Full-suite parallel runs push this well past 300s (observed 303s) since it
// pays for 0deg + 90deg + 270deg passes, each with its own per-strip upscale
// retry, while competing with every other real-PDF/OCR test's CPU work --
// same "raise the timeout, never weaken the test" fix as paddleOcr.test.ts
// and extractPipelineCli.test.ts already needed (accuracy3 Step 0).
test(
  'scanPageWithPpOcr: a page rotated 90deg with no text layer still recovers its own known text',
  { timeout: 600_000 },
  async () => {
    const page = await unicarePage();

    const upright = await scanPageWithPpOcr(page, [], env.pdfRasterDpi);
    assert.ok(upright, 'upright scan should not fail outright');
    assert.ok(
      upright!.deduped.some((l) => /Homeo-Vita/i.test(l.text)),
      'sanity baseline: the upright page should read "Homeo-Vita" directly'
    );

    const rotated = await sharp(page).rotate(90).png().toBuffer();
    const rotatedScan = await scanPageWithPpOcr(rotated, [], env.pdfRasterDpi);
    assert.ok(rotatedScan, 'rotated scan should not fail outright');
    assert.ok(
      rotatedScan!.deduped.some((l) => /Homeo-Vita/i.test(l.text)),
      'a 90deg-rotated page with no text layer should still recover "Homeo-Vita" via a rotation pass'
    );
  }
);

// accuracy3 Step 1.4: process-lifetime cache keyed on page bytes. A second
// scan of the EXACT SAME buffer must not pay for OCR again -- proven by
// timing, since there is no dependency-injection seam to count calls
// through: a real strip-based multi-angle scan takes well over a second,
// a cache hit resolves in a handful of milliseconds.
test('scanPageWithPpOcr: scanning the same page bytes twice reuses the cached scan', { timeout: 300_000 }, async () => {
  const page = await chyawanprashPage();

  const start1 = Date.now();
  const first = await scanPageWithPpOcr(page, [], env.pdfRasterDpi);
  const elapsed1 = Date.now() - start1;
  assert.ok(first, 'first scan should not fail outright');

  const start2 = Date.now();
  const second = await scanPageWithPpOcr(page, [], env.pdfRasterDpi);
  const elapsed2 = Date.now() - start2;

  assert.strictEqual(second, first, 'the cached call should return the exact same result object, not a fresh scan');
  assert.ok(
    elapsed2 < Math.min(500, elapsed1),
    `cached call took ${elapsed2}ms (first call took ${elapsed1}ms) -- expected a cache hit to be far faster`
  );
});

// accuracy3 Step 1.1: recoverBodyTextViaPpOcr scans every page it's given,
// not just the first -- a blank first page must not hide real text sitting
// on a later page.
test(
  'recoverBodyTextViaPpOcr: text on a SECOND page is recovered, not just the first',
  { timeout: 300_000 },
  async () => {
    const page = await unicarePage();
    const meta = await sharp(page).metadata();
    const blankPage = await sharp({
      create: { width: meta.width!, height: meta.height!, channels: 3, background: { r: 255, g: 255, b: 255 } }
    })
      .png()
      .toBuffer();

    const recovered = await recoverBodyTextViaPpOcr([blankPage, page], [], env.pdfRasterDpi);
    assert.ok(recovered, 'recovery should not fail outright');
    assert.ok(
      /Homeo-Vita/i.test(recovered!.text),
      'the second page\'s real text should appear in the combined body text'
    );
  }
);

// accuracy3 Step 1.1: PPOCR_MAX_PAGES caps how many pages get scanned
// (default 4) -- a real page sitting beyond the cap must NOT be reached.
test(
  'recoverBodyTextViaPpOcr: a page beyond the PPOCR_MAX_PAGES cap (default 4) is not scanned',
  { timeout: 300_000 },
  async () => {
    assert.equal(env.ppOcrMaxPages, 4, 'this test assumes the default cap -- set PPOCR_MAX_PAGES=4 or unset it to run this test');

    const page = await unicarePage();
    const meta = await sharp(page).metadata();
    const blankPage = await sharp({
      create: { width: meta.width!, height: meta.height!, channels: 3, background: { r: 255, g: 255, b: 255 } }
    })
      .png()
      .toBuffer();

    // 4 blank pages (indices 0-3, exactly the cap) + the real page at index 4 (the 5th page).
    const pageImages = [blankPage, blankPage, blankPage, blankPage, page];
    const recovered = await recoverBodyTextViaPpOcr(pageImages, [], env.pdfRasterDpi);

    // Every scanned page was blank, so either nothing is found at all
    // (null) or an empty-but-real scan came back -- either way, the real
    // page's text must be absent.
    if (recovered) {
      assert.ok(!/Homeo-Vita/i.test(recovered.text), 'the 5th page is beyond the default cap and must not have been scanned');
    }
  }
);
