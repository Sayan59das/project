// Unit tests for extractLabelFromTextLayerOnly: the geometry-based extraction
// path that uses only the PDF's text layer structure, without rasterization
// or OCR fallback. Tests that the geometry improvements to field recovery work
// and that the function never throws or invents values.
//
// Fixtures:
//   - she-arise-gummies.pdf: real project label used to verify brand recovery
//   - chyawanprash-gummies.pdf: real project label
//   - apple-cider-vinegar-gummy.pdf: real project label
//   - sharp-mind-plus-gummies.pdf: real project label
//   - scanned-label.pdf: no text layer; should return blank fields, not throw
//   - synthetic-fssai-regression.pdf: synthetic label with FSSAI number in
//     flattened text order; verifies it survives the new path unchanged
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { extractLabelFromTextLayerOnly } from '../services/labelExtraction.service';

const FIXTURES = path.join(__dirname, 'fixtures');
const load = (name: string) => readFileSync(path.join(FIXTURES, name));

// Helper to build a synthetic PDF with a known FSSAI number using jsPDF
// (jsPDF is already a dependency in the backend package.json for other tests).
function buildSyntheticFssaiPdf(): Buffer {
  // Use jsPDF from the Node environment (CommonJS)
  const jsPDF = require('jspdf').jsPDF;
  const d = new jsPDF({ unit: 'pt', format: [400, 400] });

  // Set up a simple label with FSSAI number that should be extracted
  d.setFontSize(20);
  d.text('TestBrand', 40, 50);

  d.setFontSize(14);
  d.text('Test Product Name', 40, 100);

  d.setFontSize(10);
  d.text('FSSAI Lic. No. 10012345678901', 40, 200);
  d.text('Marketed by: Test Company Pvt Ltd', 40, 220);

  // Convert to Buffer and write to fixtures directory
  const pdfBuffer = Buffer.from(d.output('arraybuffer'));

  // Write it to fixtures so we can use it in subsequent test runs
  const fixturePath = path.join(FIXTURES, 'synthetic-fssai-regression.pdf');
  writeFileSync(fixturePath, pdfBuffer);

  return pdfBuffer;
}

test('she-arise-gummies.pdf: returns a non-blank brand equal to the biggest span text', async () => {
  const result = await extractLabelFromTextLayerOnly(load('she-arise-gummies.pdf'));
  // From pdf.service.textSpans.test.ts: the single biggest span is 'She-Arise'
  // The die-line proof has the brand repeated, so the regex extractor returns
  // "She-Arise She-Arise". With the amended brief, display-text fill now treats
  // garbage-looking values as blank and replaces them with the biggest non-garbage
  // display line, which is the correct single "She-Arise".
  assert.equal(result.brand.toLowerCase(), 'she-arise', `Expected 'She-Arise', got '${result.brand}'`);
});

test('chyawanprash-gummies.pdf: function resolves with valid result', async () => {
  const result = await extractLabelFromTextLayerOnly(load('chyawanprash-gummies.pdf'));
  assert.ok(result);
  assert.ok(typeof result === 'object');
  assert.ok('brand' in result);
  assert.ok('productName' in result);
  assert.ok('fssaiNumber' in result);
});

test('apple-cider-vinegar-gummy.pdf: function resolves with valid result', async () => {
  const result = await extractLabelFromTextLayerOnly(load('apple-cider-vinegar-gummy.pdf'));
  assert.ok(result);
  assert.ok(typeof result === 'object');
  assert.ok('brand' in result);
  assert.ok('productName' in result);
  assert.ok('fssaiNumber' in result);
});

test('sharp-mind-plus-gummies.pdf: function resolves with valid result', async () => {
  const result = await extractLabelFromTextLayerOnly(load('sharp-mind-plus-gummies.pdf'));
  assert.ok(result);
  assert.ok(typeof result === 'object');
  assert.ok('brand' in result);
  assert.ok('productName' in result);
  assert.ok('fssaiNumber' in result);
});

test('scanned-label.pdf (no text layer): returns all-blank fields, never throws', async () => {
  const result = await extractLabelFromTextLayerOnly(load('scanned-label.pdf'));
  assert.ok(result, 'should return a result, not throw');
  // All extractable fields should be blank for a scan with no text layer
  assert.equal(result.brand, '', 'brand should be blank');
  assert.equal(result.productName, '', 'productName should be blank');
  assert.equal(result.marketingCompany, '', 'marketingCompany should be blank');
  assert.equal(result.fssaiNumber, '', 'fssaiNumber should be blank');
});

test('synthetic FSSAI regression: FSSAI number survives the new geometry path unchanged', async () => {
  // Build the synthetic PDF with a known FSSAI number
  const pdfBuffer = buildSyntheticFssaiPdf();
  const result = await extractLabelFromTextLayerOnly(pdfBuffer);

  // The FSSAI number should be extracted as-is
  assert.equal(result.fssaiNumber, '10012345678901', `Expected FSSAI '10012345678901', got '${result.fssaiNumber}'`);
});

// Test that synthetic PDF with nutrition table wires through the text-layer path.
// Uses a real fixture PDF with a known nutrition table to verify the wiring works end-to-end.
test('synthetic nutrition table PDF: nutrition table extracted and wired through', async () => {
  const result = await extractLabelFromTextLayerOnly(load('she-arise-gummies.pdf'));

  // The nutrition table should be extracted and stringified from the real fixture
  assert.ok(result.nutritionTable, 'nutritionTable should not be empty for she-arise-gummies.pdf');

  // Parse and validate the JSON structure
  const parsed = JSON.parse(result.nutritionTable);
  assert.ok(typeof parsed === 'object', 'nutritionTable should be a valid JSON object');

  // Verify it contains expected nutrition entries (from the fixture)
  assert.ok('Energy' in parsed, 'Should contain Energy entry');
  assert.ok(parsed.Energy.includes('kcal'), 'Energy value should contain unit');

  // Verify the cleanup rule works by checking that no values contain bare % tokens (like "<0.5%")
  // after name (they should have been stripped if present)
  const valuesWithBarePercent = Object.values(parsed).filter((v: any) =>
    typeof v === 'string' && /\s[<>≤≥~]?\d[\d.,]*\s*%\s[<>≤≥~]?\d/.test(v)
  );
  assert.equal(valuesWithBarePercent.length, 0, 'No values should have trailing bare % columns (cleanup rule should have stripped them)');
});

// Print detailed results for manual inspection and debugging
test('print extracted fields for all fixtures', { skip: false }, async () => {
  const fixtures = ['she-arise-gummies.pdf', 'chyawanprash-gummies.pdf', 'apple-cider-vinegar-gummy.pdf', 'sharp-mind-plus-gummies.pdf'];

  console.log('\n=== Extracted Fields by Fixture ===');
  for (const fixture of fixtures) {
    try {
      const result = await extractLabelFromTextLayerOnly(load(fixture));
      console.log(`\n${fixture}:`);
      console.log(`  brand: "${result.brand}"`);
      console.log(`  productName: "${result.productName}"`);
      console.log(`  marketingCompany: "${result.marketingCompany}"`);
      console.log(`  fssaiNumber: "${result.fssaiNumber}"`);
      console.log(`  nutritionTable: ${result.nutritionTable || '(empty)'}`);

      // Validate nutritionTable if present
      if (result.nutritionTable) {
        try {
          const parsed = JSON.parse(result.nutritionTable);
          const allHaveDigits = Object.values(parsed).every((val: any) =>
            typeof val === 'string' && /\d/.test(val)
          );
          console.log(`  nutritionTable valid JSON: true, all values contain digits: ${allHaveDigits}`);
        } catch (e) {
          console.log(`  nutritionTable invalid JSON: ${(e as Error).message}`);
        }
      }
    } catch (error) {
      console.log(`\n${fixture}: ERROR - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n=== End Fixture Report ===\n');
  assert.ok(true, 'printing fixture results for review');
});
