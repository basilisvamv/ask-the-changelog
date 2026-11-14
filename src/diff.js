// Pure logic: takes data, returns new announcements. No network and no files,
// so it is easy to test.
// Each item here is one announcement from a changelog: date, title, category, summary.

// If more than this many new announcements are found together, we do not report them (see diffPlans).
const MAX_NEW_PER_CHECK = 10;

// For title comparison we ignore case, accents, apostrophes, quotes, dashes and full stops.
// The LLM may write the same title once with a straight (') and another time with a typographic (’) apostrophe.
export function normName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// Date in YYYY-MM-DD format. Accepts "2026-11-09" or "November 9, 2026".
// Without a year (for example "Nov 5") we do not accept it, because JavaScript would use the wrong year.
// We take the local parts of the Date, so the day does not shift with the time zone.
export function toIsoDate(v) {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!/\b\d{4}\b/.test(s)) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function normalizePlan(p) {
  const url = str(p?.url);
  return {
    date: toIsoDate(p?.date),
    title: str(p?.title) ?? '',
    category: str(p?.category)?.toLowerCase() ?? null,
    summary: str(p?.summary),
    // The link is optional. If it is missing, it is not added to the record at all.
    ...(url ? { url } : {}),
  };
}

// Matching key: date and title. The same title on another day is another announcement.
const keyOf = (p) => `${p.date ?? ''}|${normName(p.title)}`;

// Does the previous record have titles? Old records (from another version) do not.
const hasTitles = (snap) => Boolean(snap?.plans?.some((p) => p.title));

// Checks if the new extraction is reliable before we compare it.
// Returns an error message or null.
export function checkExtraction(prev, next) {
  if (!next || !Array.isArray(next.plans)) return 'The extraction did not return a list of announcements.';
  if (next.plans.some((p) => normName(p.title) === '')) return 'Some announcement has no title.';
  const keys = next.plans.map(keyOf);
  if (new Set(keys).size !== keys.length)
    return 'There are duplicate announcements (same date and title).';
  if (prev?.plans?.length > 0 && next.plans.length === 0)
    return 'The extraction returned 0 announcements, but there were some before. Probably an error, so nothing is compared.';
  return null;
}

// Returns only the new announcements. Removed or changed ones are ignored.
export function diffPlans(prev, next) {
  // First run or old record: only record, no alerts.
  if (!hasTitles(prev)) return { baseline: true, changes: [], bulk: false, count: 0 };

  const before = new Set(prev.plans.map(keyOf));

  // The most recent date we already know. The LLM rewrites titles between runs,
  // so older announcements are not compared by title: they are not new.
  const watermark = prev.plans.map((p) => p.date).filter(Boolean).sort().at(-1) ?? null;

  const fresh = next.plans.filter((p) => {
    if (watermark) {
      // Older or without a date: ignored.
      if (!p.date || p.date < watermark) return false;
    }
    // Newer than the baseline, or same day with another title.
    return !before.has(keyOf(p));
  });

  // Many at once: the page layout probably changed, or the extraction returns other titles.
  // We do not report them. The new extraction becomes the new baseline, so the comparison does not get stuck.
  if (fresh.length > MAX_NEW_PER_CHECK)
    return { baseline: false, changes: [], bulk: true, count: fresh.length };

  const changes = fresh.map((p) => ({
    type: 'added',
    title: p.title,
    date: p.date,
    category: p.category,
    summary: p.summary,
    ...(p.url ? { url: p.url } : {}),
  }));
  return { baseline: false, changes, bulk: false, count: fresh.length };
}

// Text for the change card, in English.
export function summarize(c) {
  if (c.type !== 'added') return 'Change.';
  const date = c.date ? ` (${c.date})` : '';
  const text = c.summary ? ` ${c.summary}` : '';
  // Remove full stops at the end of the title, so it does not show "title.".
  const title = String(c.title ?? '').replace(/[.!?]+$/, '');
  return `New announcement${date}: "${title}".${text}`;
}
