// Unit tests for the app-wide date/time formatter (src/utils/dateFormat.ts).
// Standard: Date = DD-MM-YYYY, Time = HH:MM, and a time is only ever shown
// when the underlying value actually carries a real time-of-day component —
// never fabricated for a field that only ever stored a date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateOnly, formatDateTime } from '../../utils/dateFormat';

test('formatDateTime renders a date-only value as DD-MM-YYYY with no time', () => {
  assert.equal(formatDateTime('2026-09-02'), '02-09-2026');
});

test('formatDateTime renders a full ISO timestamp as DD-MM-YYYY HH:MM', () => {
  // Fixed to UTC so the assertion isn't sensitive to the test runner's timezone.
  const result = formatDateTime('2026-09-02T14:05:00.000Z');
  assert.match(result, /^02-09-2026 \d{2}:\d{2}$/);
});

test('formatDateTime returns an em dash for missing values', () => {
  assert.equal(formatDateTime(undefined), '—');
  assert.equal(formatDateTime(null), '—');
  assert.equal(formatDateTime(''), '—');
});

test('formatDateTime passes through a non-date placeholder unchanged', () => {
  assert.equal(formatDateTime('—'), '—');
});

test('formatDateOnly ignores a time component even when present', () => {
  assert.equal(formatDateOnly('2026-09-02T14:05:00.000Z'), '02-09-2026');
});

test('formatDateOnly renders a plain date-only string as DD-MM-YYYY', () => {
  assert.equal(formatDateOnly('2026-01-05'), '05-01-2026');
});
