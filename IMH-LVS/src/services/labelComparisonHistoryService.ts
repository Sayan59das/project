// Persistence for the Label Comparison feature's history — see
// types/labelComparisonRecord.ts for why this is a separate store from
// comparisonService.ts's approval-pipeline `Comparison` records. Same
// localStorage-backed pattern as every other *Service.ts in this app.
// Starts genuinely empty (no seed data) — every record here was produced by
// a real OCR comparison a user actually ran, never fabricated to make the
// UI look populated.
import type { LabelComparisonRun } from '../types/labelComparisonRecord';

const STORAGE_KEY = 'imh_lvs_label_comparisons';

function readAll(): LabelComparisonRun[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LabelComparisonRun[];
  } catch {
    return [];
  }
}

function writeAll(records: LabelComparisonRun[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function nextId(existing: LabelComparisonRun[]): string {
  const maxSeq = existing.reduce((max, record) => {
    const match = /^LC-(\d+)$/.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `LC-${String(maxSeq + 1).padStart(5, '0')}`;
}

export function getLabelComparisons(): LabelComparisonRun[] {
  return readAll().sort((a, b) => (a.comparisonDate < b.comparisonDate ? 1 : -1));
}

export function getLabelComparisonById(id: string): LabelComparisonRun | undefined {
  return readAll().find((record) => record.id === id);
}

export function saveLabelComparisonRun(record: Omit<LabelComparisonRun, 'id'>): LabelComparisonRun {
  const existing = readAll();
  const withId: LabelComparisonRun = { ...record, id: nextId(existing) };
  writeAll([...existing, withId]);
  return withId;
}
