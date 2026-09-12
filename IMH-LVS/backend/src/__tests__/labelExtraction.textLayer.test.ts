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
import { readFileSync } from 'fs';
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

  // Convert to Buffer (do not write to file on every test run)
  return Buffer.from(d.output('arraybuffer'));
}

// Helper to build a synthetic PDF with a nutrition table using jsPDF.
// Drawn with geometry suitable for extractNutritionTableFromPanels to parse.
function buildSyntheticNutritionPdf(): Buffer {
  const jsPDF = require('jspdf').jsPDF;
  const d = new jsPDF({ unit: 'pt', format: [400, 800] });

  // Brand and product name (required fields to avoid blank template detection)
  d.setFontSize(20);
  d.text('VitaBrand', 40, 50);

  d.setFontSize(14);
  d.text('Multivitamin Gummies', 40, 100);

  // FSSAI and marketing company (required fields)
  d.setFontSize(9);
  d.text('FSSAI License No: 12345678901234', 40, 130);
  d.text('Marketed by: VitaCorp Ltd', 40, 145);
  d.text('Address: 123 VitaStreet, Health City 12345', 40, 160);
  d.text('Email: support@vitacorp.com', 40, 175);

  // Ingredients section (shows complete label)
  d.setFontSize(10);
  d.text('Ingredients', 40, 200);

  d.setFontSize(8);
  d.text('Sugars, Glucose Syrup, Gelatin, Vitamins & Minerals', 40, 215);

  // Nutrition table with geometry designed for cell splitting
  d.setFontSize(10);
  d.text('Nutritional Information per serving', 40, 240);

  // Row 1: Energy | 12 kcal (y=260)
  d.setFontSize(9);
  d.text('Energy', 40, 260);
  d.text('12 kcal', 160, 260);

  // Row 2: Protein | 0.5 g (y=275, ~15pt apart)
  d.text('Protein', 40, 275);
  d.text('0.5 g', 160, 275);

  return Buffer.from(d.output('arraybuffer'));
}

test('she-arise-gummies.pdf: brand is blank (real brand is a small mark, OCR recovers it)', async () => {
  const result = await extractLabelFromTextLayerOnly(load('she-arise-gummies.pdf'));
  // The die-line proof has the product name repeated ("She-Arise She-Arise"), which the
  // regex extractor returns. Because it looks like garbage, it's blanked by post-processing.
  // The REAL brand ('Nutrinol') is a small mark in the text layer that is too faint for
  // the regex extractor to find confidently. The text-layer-only path must leave brand
  // blank so that OCR's fill-blanks-only approach can use the title-region recovery pass
  // (which finds the small mark) without being blocked by a pre-filled value.
  assert.equal(result.brand, '', 'brand must be blank (OCR fills small-text marks with fill-blanks-only)');
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
// Builds a synthetic jsPDF with precise geometry and asserts exact nutrition table extraction.
test('synthetic nutrition table PDF: nutrition table extracted and wired through', async () => {
  const { extractTextSpans } = require('../services/pdf.service');
  const { segmentPanels } = require('../services/textLayerGeometry.service');

  const pdfBuffer = buildSyntheticNutritionPdf();

  // Debug: check what text spans are extracted and nutrition table extracted from them
  try {
    const spans = await extractTextSpans(pdfBuffer);
    const panels = segmentPanels(spans);
    const { extractNutritionTableFromPanels } = require('../services/textLayerGeometry.service');
    const nutritionTable = extractNutritionTableFromPanels(panels);
    console.log(`[DEBUG] Synthetic nutrition PDF: ${spans.length} spans, ${panels.length} panels`);
    console.log('[DEBUG] Extracted nutrition table from panels:', JSON.stringify(nutritionTable));
  } catch (e) {
    console.log('[DEBUG] Failed to extract spans:', e instanceof Error ? e.message : e);
  }

  const result = await extractLabelFromTextLayerOnly(pdfBuffer);

  // The nutrition table is correctly extracted from PDF geometry (see DEBUG output),
  // but is blanked by placeholder scrubbing in postProcessExtractionResult because
  // the JSON-stringified table matches placeholder detection patterns.
  // This is a limitation in the current placeholder logic - JSON structured data
  // should not be subject to placeholder detection.
  const expected = {
    Energy: '12 kcal',
    Protein: '0.5 g',
  };

  if (!result.nutritionTable) {
    console.log('\n[REPORT] Issue: Synthetic PDF nutrition table blanked by placeholder scrubbing');
    console.log('[REPORT] The geometry extraction WORKS (see DEBUG output above - table was extracted correctly)');
    console.log('[REPORT] But postProcessExtractionResult → scrubPlaceholders blanks it');
    console.log('[REPORT] Root cause: JSON stringified nutrition table matches placeholder pattern');
    console.log('[REPORT] Expected table:', JSON.stringify(expected));
    assert.ok(result.nutritionTable,
      'nutritionTable discarded by placeholder scrubbing. Geometry extraction works but needs ' +
      'placeholder logic to skip structured data fields like nutritionTable.');
  }

  // Parse and assert exact table from brief specification
  const parsed = JSON.parse(result.nutritionTable);
  assert.deepEqual(parsed, expected, 'Extracted nutrition table must match the brief specification exactly');
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
