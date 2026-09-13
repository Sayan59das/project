// readArtworkVisualComparison: logoSimilarity is copied through only when the
// backend sent it (Phase E logo pass), never invented from artworkSimilarity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readArtworkVisualComparison } from '../labelComparisonService';

test('readArtworkVisualComparison copies logoSimilarity through when present', () => {
  const visual = readArtworkVisualComparison({
    artworkSimilarity: { status: 'SIMILAR', similarityPercentage: 81 },
    colourSimilarity: { status: 'MATCH', similarityPercentage: 96 },
    logoSimilarity: { status: 'MATCH', similarityPercentage: 98 }
  });
  assert.deepEqual(visual.logoSimilarity, { status: 'MATCH', similarityPercentage: 98 });
  assert.deepEqual(visual.artworkSimilarity, { status: 'SIMILAR', similarityPercentage: 81 });
});

test('readArtworkVisualComparison leaves logoSimilarity undefined when the backend did not send it', () => {
  const visual = readArtworkVisualComparison({
    artworkSimilarity: { status: 'SIMILAR', similarityPercentage: 81 },
    colourSimilarity: { status: 'MATCH', similarityPercentage: 96 }
  });
  assert.equal(visual.logoSimilarity, undefined);
  assert.equal('logoSimilarity' in visual, false);
});

test('readArtworkVisualComparison ignores a non-object logoSimilarity', () => {
  const visual = readArtworkVisualComparison({
    artworkSimilarity: { status: 'MATCH' },
    colourSimilarity: { status: 'MATCH' },
    logoSimilarity: 'MATCH'
  });
  assert.equal(visual.logoSimilarity, undefined);
});
