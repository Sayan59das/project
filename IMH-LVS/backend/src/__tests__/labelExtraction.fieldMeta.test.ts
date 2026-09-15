// Unit tests for the Step 2 (accuracy plan) provenance-tracking helpers in
// labelExtraction.service.ts: tagFilledFields, fillBlanks, fillBlanksFrom.
// fillBlanks is the single choke point every extraction pass merges its
// answer through, so it's also the single place that records which pass
// wrote each field -- these tests pin that merging logic in isolation,
// fast and with no I/O, rather than only exercising it indirectly through
// the full HTTP extraction tests in labels.extract.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillBlanks, fillBlanksFrom, tagFilledFields, type FieldMeta } from '../services/labelExtraction.service';
import type { ExtractedLabelFields } from '../services/labelFieldExtractor.service';

function emptyFields(): ExtractedLabelFields {
  return {
    marketingCompany: '',
    address: '',
    fssaiNumber: '',
    email: '',
    customerCareNumber: '',
    brand: '',
    flavour: '',
    productName: '',
    packageSize: ''
  };
}

test('tagFilledFields tags only the non-blank fields, ignoring blanks entirely', () => {
  const meta = tagFilledFields({ ...emptyFields(), brand: 'ChewNectar', address: '' }, 'text-layer-flattened');
  assert.deepEqual(Object.keys(meta), ['brand']);
  assert.deepEqual(meta.brand, { source: 'text-layer-flattened', needsReview: false });
});

test('tagFilledFields sets needsReview true only for the two model-inferred sources', () => {
  const read = tagFilledFields({ ...emptyFields(), brand: 'X' }, 'tesseract-full-page');
  const inferred = tagFilledFields({ ...emptyFields(), brand: 'X' }, 'vlm-fallback');
  assert.equal(read.brand.needsReview, false);
  assert.equal(inferred.brand.needsReview, true);
});

test('fillBlanksFrom fills a blank field and tags it with the given source', () => {
  const fields = emptyFields();
  const { fields: next, meta } = fillBlanksFrom(fields, { brand: 'ChewNectar' }, 'text-layer-flattened');
  assert.equal(next.brand, 'ChewNectar');
  assert.deepEqual(meta.brand, { source: 'text-layer-flattened', needsReview: false });
});

test('fillBlanksFrom never overwrites an existing non-blank field, and its meta entry survives untouched', () => {
  const fields = { ...emptyFields(), brand: 'Sleeprio' };
  const meta = tagFilledFields(fields, 'text-layer-flattened');
  const { fields: next, meta: nextMeta } = fillBlanksFrom(fields, { brand: 'A different brand entirely' }, 'tesseract-full-page', meta);
  assert.equal(next.brand, 'Sleeprio');
  assert.deepEqual(nextMeta.brand, { source: 'text-layer-flattened', needsReview: false });
});

test('fillBlanksFrom only tags fields the patch actually set -- a patch key with a falsy value is skipped, not tagged', () => {
  const fields = emptyFields();
  const { fields: next, meta } = fillBlanksFrom(fields, { brand: 'ChewNectar', address: '' }, 'text-layer-flattened');
  assert.equal(next.address, '');
  assert.equal('address' in meta, false);
});

test('fillBlanksFrom carries forward meta entries for fields the patch never mentions', () => {
  const fields = { ...emptyFields(), brand: 'Sleeprio' };
  const meta = tagFilledFields(fields, 'text-layer-flattened');
  const { meta: nextMeta } = fillBlanksFrom(fields, { address: '123 Street' }, 'tesseract-full-page', meta);
  assert.deepEqual(nextMeta.brand, { source: 'text-layer-flattened', needsReview: false });
  assert.deepEqual(nextMeta.address, { source: 'tesseract-full-page', needsReview: false });
});

test('fillBlanksFrom overwrites a generic product-form word (the one field with an override escape hatch) and re-tags it', () => {
  const fields = { ...emptyFields(), productName: 'Gummies' };
  const meta = tagFilledFields(fields, 'text-layer-flattened');
  const { fields: next, meta: nextMeta } = fillBlanksFrom(fields, { productName: 'Sharp Mind Plus' }, 'tesseract-title-region', meta);
  assert.equal(next.productName, 'Sharp Mind Plus');
  assert.deepEqual(nextMeta.productName, { source: 'tesseract-title-region', needsReview: false });
});

test('fillBlanks (raw) preserves fine-grained per-field sources from an already-tagged patchMeta, rather than collapsing to one tag', () => {
  const fields = emptyFields();
  const patch: Partial<ExtractedLabelFields> = { brand: 'ChewNectar', address: '123 Street' };
  const patchMeta: Record<string, FieldMeta> = {
    brand: { source: 'tesseract-full-page', needsReview: false },
    address: { source: 'tesseract-region-ocr', needsReview: false }
  };
  const { meta } = fillBlanks(fields, patch, patchMeta);
  assert.deepEqual(meta.brand, { source: 'tesseract-full-page', needsReview: false });
  assert.deepEqual(meta.address, { source: 'tesseract-region-ocr', needsReview: false });
});

test('fillBlanksFrom preserves a confidence already present in the running meta for an untouched field', () => {
  const fields = { ...emptyFields(), brand: 'Sleeprio' };
  const meta: Record<string, FieldMeta> = { brand: { source: 'vlm-role-resolution', confidence: 0.82, needsReview: true } };
  const { meta: nextMeta } = fillBlanksFrom(fields, { address: '123 Street' }, 'tesseract-full-page', meta);
  assert.deepEqual(nextMeta.brand, { source: 'vlm-role-resolution', confidence: 0.82, needsReview: true });
});
