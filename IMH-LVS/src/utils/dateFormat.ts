// Single source of truth for how dates/timestamps are displayed anywhere
// in the app — workflow history, reports, approvals, uploads, activity
// feeds, exports. Standard: Date = DD-MM-YYYY, Time = HH:MM.
//
// Every stored date field in this app (see services/*.ts) is one of two
// shapes: a date-only string ('YYYY-MM-DD', e.g. Artwork.uploadDate,
// Product.createdDate, Comparison.comparisonDate — none of these ever had
// a time-of-day captured) or a full ISO timestamp (e.g.
// WorkflowHistoryEntry.date, AppUser.lastLogin — real time-of-day).
// formatDateTime() below detects which shape it was given and only ever
// shows a time when one genuinely exists, so it's safe to use everywhere
// without fabricating data.
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// DD-MM-YYYY only, regardless of whether the input also carries a time
// component (the time is simply ignored, not fabricated or removed from
// the underlying data — this is a display-only transform).
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const match = ISO_DATE_PREFIX_PATTERN.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

// DD-MM-YYYY, plus HH:MM appended only when the stored value actually
// carries a real time-of-day (i.e. it is not a bare 'YYYY-MM-DD' string).
// This is the general-purpose formatter — use it for any date/timestamp
// field shown to a user unless the display context specifically calls for
// date-only regardless of granularity.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  if (DATE_ONLY_PATTERN.test(value)) return formatDateOnly(value);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value; // not a parseable date — show as-is rather than hide data

  return `${formatDateOnly(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
