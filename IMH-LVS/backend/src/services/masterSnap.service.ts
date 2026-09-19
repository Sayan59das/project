// Step 2 of the accuracy2 plan: grounds a candidate string (a brand name
// read off a label by any source — the text layer, PP-OCR, a VLM
// transcript) against the client's own Masters catalogue, read at runtime
// (masters.repository.ts / eval/masters.json), never a string literal in
// this file — a master list consumed here is data, not the hardcoding
// the brief's Section 3 forbids.
//
// WHY THIS EXISTS: the by-source accuracy table has repeatedly shown
// text-layer-flattened brand at roughly 1 correct / 13 wrong — a source
// that, left alone, is actively hurting the field it's supposed to fill.
// Once a real master list is available, a candidate that doesn't match
// anything in it has no business being accepted as the brand; snapping a
// near-miss to the master's own spelling (rather than leaving the
// candidate's own OCR-noisy text) is what lets two labels for the same
// brand always compare identically too.

/** Levenshtein edit distance — insertions, deletions and substitutions each
 * cost 1. Small, in-file, no new dependency (per the directive). Not the
 * exact algorithm rapidfuzz.fuzz.ratio() uses server-side (that's an
 * indel/longest-matching-blocks ratio), but normalized the same way —
 * `(lenA + lenB - distance) / (lenA + lenB)` — so the two agree closely
 * enough at the 0.85 threshold this function and the scorer both use. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

function levenshteinRatio(a: string, b: string): number {
  const totalLength = a.length + b.length;
  if (totalLength === 0) return 1;
  return (totalLength - levenshteinDistance(a, b)) / totalLength;
}

// Case- and hyphen-insensitive per the directive: collapse hyphens to
// spaces before comparing, so "Novocal-Kid" and "NovocalKid"/"Novocal Kid"
// all normalize to the same thing.
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, ' ').trim();
}

// Whole-word containment either way. Checked with word boundaries so a
// short master name never trivially matches as a mid-word substring of an
// unrelated candidate (the "Chew" inside "ChewNectar" case): the boundary
// is required on the side of whichever string is being searched INTO.
function wholeWordContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystack);
}

const RATIO_THRESHOLD = 0.85;

export type MasterSnapResult = { value: string; score: number };

/**
 * Snaps `candidate` to whichever entry in `masters` it most plausibly is,
 * or returns null if nothing plausibly matches.
 *
 * Match rule (either side wins, whole-word containment checked before the
 * more expensive ratio fallback): exact match after normalizing case and
 * hyphens (score 1), OR whole-word containment either way (score 0.9, a
 * badge/wordmark box catching nearby text is a real, common shape — see
 * the "BioFaith Healthcare" test), OR a Levenshtein ratio >= 0.85 (an OCR
 * misread of one or two characters). When more than one master entry
 * matches, the HIGHEST-scoring one wins; ties keep whichever was checked
 * first (the master list's own order).
 *
 * Returns the MASTER's own spelling, not the candidate's — two labels for
 * the same brand should always compare identically once grounded,
 * regardless of which one's OCR read was cleaner.
 */
export function snapToMaster(candidate: string, masters: readonly string[]): MasterSnapResult | null {
  const trimmedCandidate = candidate.trim();
  if (trimmedCandidate === '' || masters.length === 0) return null;

  const normalizedCandidate = normalize(trimmedCandidate);
  let best: MasterSnapResult | null = null;

  for (const master of masters) {
    const normalizedMaster = normalize(master);
    if (normalizedMaster === '') continue;

    let score: number;
    if (normalizedCandidate === normalizedMaster) {
      score = 1;
    } else if (wholeWordContains(normalizedCandidate, normalizedMaster) || wholeWordContains(normalizedMaster, normalizedCandidate)) {
      score = 0.9;
    } else {
      const ratio = levenshteinRatio(normalizedCandidate, normalizedMaster);
      if (ratio < RATIO_THRESHOLD) continue;
      score = ratio;
    }

    if (!best || score > best.score) {
      best = { value: master, score };
    }
  }

  return best;
}
