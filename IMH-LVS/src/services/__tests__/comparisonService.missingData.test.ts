// Regression tests for the comparison engine's handling of label attributes
// that were never captured.
//
// getLabelAttributes() falls back to the literal string 'Not specified' for
// every field it cannot resolve (9 of the 13 compared parameters). Because
// classifyParameterValues() compares those fallbacks as ordinary strings,
// "we don't know" on both sides is indistinguishable from "both labels say
// the same thing" — so an unknown vs. unknown comparison scores MATCH.
//
// These tests pin the CORRECT behaviour: absent data must never be reported
// as agreement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';
import type { Artwork } from '../../types/artwork';

installMemoryLocalStorage();

const { getLabelAttributes, compareParameters, calculateSimilarity, generateComparisonResult, countComparableParameters } =
  await import('../comparisonService');

// An artwork id deliberately absent from SEED_LABEL_ATTRIBUTES, so
// getLabelAttributes() takes its 'Not specified' fallback branch — the same
// branch 6 of the 12 seeded artworks take today.
function artwork(overrides: Partial<Artwork> & Pick<Artwork, 'id'>): Artwork {
  return {
    productId: 'PRD-9001',
    productName: 'Vitamin C Gummies',
    brand: 'VitaFit',
    marketingCompany: 'ABC Healthcare',
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
    version: 'V1',
    artworkType: 'Full Label',
    fileName: 'label.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    filePath: '',
    status: 'Draft',
    remarks: '',
    uploadedBy: 'tester',
    uploadDate: '2026-01-01',
    updatedBy: 'tester',
    updatedDate: '2026-01-01',
    ...overrides
  };
}

test('two artworks with no captured label data are NOT reported as a perfect match', () => {
  // The exact real-world case: V1 vs V2 of the same product, neither of
  // which has had its label content captured. Same product means brand,
  // name, flavour and FSSAI agree legitimately — every other parameter is
  // simply unknown on both sides.
  const v1 = getLabelAttributes(artwork({ id: 'ART-9001', version: 'V1' }));
  const v2 = getLabelAttributes(artwork({ id: 'ART-9002', version: 'V2' }));

  const parameters = compareParameters(v1, v2);
  const similarity = calculateSimilarity(parameters);
  const overall = generateComparisonResult(parameters);

  // Identify "unknown on both sides" by the absence of a value, not by any
  // particular placeholder string — the placeholder is exactly what this fix
  // removed, so matching on one would make the test pass for the wrong
  // reason if it ever came back.
  const unknownParameters = parameters.filter((p) => !p.referenceValue.trim() && !p.newValue.trim());

  // Sanity check that this test is exercising the fallback branch at all.
  assert.ok(unknownParameters.length > 0, 'expected some parameters to be unknown on both sides');

  // The actual assertions: unknown-vs-unknown must not count as agreement.
  assert.ok(
    !unknownParameters.some((p) => p.result === 'MATCH'),
    `parameters with no data on either side were reported as MATCH: ${unknownParameters
      .filter((p) => p.result === 'MATCH')
      .map((p) => p.parameter)
      .join(', ')}`
  );

  assert.notEqual(overall, 'MATCH', 'a comparison with no captured label data must not report an overall MATCH');

  // The similarity score measures agreement across the parameters that could
  // actually be compared, so it can legitimately read 100% off a tiny
  // sample. That number is only safe to show next to its coverage — a score
  // is meaningless without knowing how much of the label it covers, which is
  // why the brief requires the missing count to be reported alongside it.
  const coverage = countComparableParameters(parameters);
  assert.ok(
    coverage.comparable < coverage.total,
    'expected this scenario to have partial coverage so the coverage assertion is meaningful'
  );
  assert.ok(
    similarity === 0 || coverage.comparable > 0,
    'a non-zero similarity must be backed by at least one genuinely compared parameter'
  );
});

test('a known value on one side and no data on the other is not a CONFLICT', () => {
  // The mirror-image failure: when only one label has been captured, the
  // 'Not specified' placeholder is compared as if it were a real value, so a
  // genuine value scores zero token overlap against it and is reported as a
  // business conflict rather than as missing information.
  const captured = getLabelAttributes(artwork({ id: 'ART-9003' }));
  const uncaptured = getLabelAttributes(artwork({ id: 'ART-9004' }));

  const withValue = { ...captured, claims: 'Supports Immunity' };
  const parameters = compareParameters(withValue, uncaptured);
  const claims = parameters.find((p) => p.parameter === 'Claims');

  assert.ok(claims, 'expected a Claims parameter');
  assert.notEqual(
    claims.result,
    'CONFLICT',
    'a value present on one side and absent on the other is missing data, not a conflict'
  );
});
