// Unit tests for findBestCrossCompanyMatch (AI module brief §6/§8: "the
// system should identify the Best Match Label based on similarity"). Pure
// function, synthetic CrossCompanyResultEntry fixtures — no artwork
// fetching, extraction or HTTP involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBestCrossCompanyMatch } from '../labelComparisonWorkflowService';
import type { CrossCompanyResultEntry } from '../../types/labelComparisonRecord';
import type { LabelComparisonApiResult } from '../../types/labelComparison';

function successEntry(overallPercentage: number, overrides: Partial<CrossCompanyResultEntry> = {}): CrossCompanyResultEntry {
  const result: LabelComparisonApiResult = {
    labelA: {} as LabelComparisonApiResult['labelA'],
    labelB: {} as LabelComparisonApiResult['labelB'],
    comparison: {
      fields: [],
      overallPercentage,
      totalFieldsCompared: 0,
      matchingFields: 0,
      similarFields: 0,
      conflictingFields: 0,
      missingFields: 0,
      notComparedFields: 0
    }
  };
  return {
    candidateProductId: 'PRD-0001',
    candidateProductName: 'Vitamin C Gummies',
    candidateMarketingCompany: 'HealthCo',
    candidateArtworkId: 'ART-0001',
    candidateArtworkVersion: 'V1',
    outcome: { status: 'success', result },
    ...overrides
  };
}

function unavailableEntry(overrides: Partial<CrossCompanyResultEntry> = {}): CrossCompanyResultEntry {
  return {
    candidateProductId: 'PRD-0002',
    candidateProductName: 'Vitamin C Gummies',
    candidateMarketingCompany: 'OtherCo',
    candidateArtworkId: 'ART-0002',
    candidateArtworkVersion: 'V1',
    outcome: { status: 'file_unavailable' },
    ...overrides
  };
}

test('No candidates at all returns undefined — "No Comparison Available", never a fabricated best match', () => {
  assert.equal(findBestCrossCompanyMatch([]), undefined);
});

test('Every candidate having no retrievable file returns undefined', () => {
  assert.equal(findBestCrossCompanyMatch([unavailableEntry(), unavailableEntry()]), undefined);
});

test('Picks the highest-similarity successful candidate among several', () => {
  const low = successEntry(20, { candidateArtworkId: 'ART-LOW', candidateMarketingCompany: 'LowCo' });
  const high = successEntry(85, { candidateArtworkId: 'ART-HIGH', candidateMarketingCompany: 'HighCo' });
  const mid = successEntry(50, { candidateArtworkId: 'ART-MID', candidateMarketingCompany: 'MidCo' });

  const best = findBestCrossCompanyMatch([low, high, mid]);
  assert.equal(best?.candidateArtworkId, 'ART-HIGH');
  assert.equal(best?.candidateMarketingCompany, 'HighCo');
  assert.equal(best?.overallPercentage, 85);
});

test('Unavailable candidates are skipped rather than treated as a zero score', () => {
  const unavailable = unavailableEntry();
  const onlySuccess = successEntry(30, { candidateArtworkId: 'ART-ONLY' });
  const best = findBestCrossCompanyMatch([unavailable, onlySuccess]);
  assert.equal(best?.candidateArtworkId, 'ART-ONLY');
});

test('A tie keeps the first candidate encountered', () => {
  const first = successEntry(60, { candidateArtworkId: 'ART-FIRST' });
  const second = successEntry(60, { candidateArtworkId: 'ART-SECOND' });
  const best = findBestCrossCompanyMatch([first, second]);
  assert.equal(best?.candidateArtworkId, 'ART-FIRST');
});
