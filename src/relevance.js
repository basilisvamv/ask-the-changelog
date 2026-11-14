// Relevance score based on the keywords the user selected.
// Needs no network and costs no credits.

// How many top announcements get a full explanation from Answers (costs credits).
export const TOP_FOR_ANSWERS = 3;

// Each tag is activated by the words that appear in the announcements.
// Words are lowercase and without accents, as tokens() returns them.
export const TAG_MAP = {
  HTML: ['html', 'web', 'page', 'frontend'],
  CSS: ['css', 'style', 'web', 'page', 'frontend'],
  JavaScript: ['javascript', 'js', 'code', 'sdk', 'web'],
  Python: ['python', 'code', 'sdk'],
  'Node.js': ['node', 'js', 'sdk', 'code'],
  Text: ['text', 'language'],
  Voice: ['voice', 'audio', 'speech'],
  Images: ['image', 'images', 'vision'],
  Video: ['video'],
  Code: ['code', 'coding', 'sdk'],
  Pricing: ['price', 'pricing', 'cost'],
  Fast: ['fast', 'latency', 'speed', 'ultrafast'],
  Agents: ['agent', 'agents'],
  Search: ['search'],
  'API removals': ['deprecation', 'deprecated', 'removed', 'retired'],
  Games: ['game', 'games'],
};

// Words that do not help the comparison.
const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'from', 'your', 'you', 'are']);

// Without accents and in lowercase.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Words of the text, at least 2 characters long and without common words.
export function tokens(text) {
  return norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

// Relevance level from the share of the selected tags that match.
export function levelOf(matched, total) {
  if (!total || matched === 0) return 'none';
  const r = matched / total;
  if (r >= 0.6) return 'high';
  if (r >= 0.3) return 'medium';
  return 'low';
}

// Which of the selected tags match the announcement.
export function scorePlan(tags, plan) {
  const have = new Set(tokens(`${plan.title ?? ''} ${plan.summary ?? ''} ${plan.category ?? ''}`));
  const matched = tags.filter((t) => (Object.hasOwn(TAG_MAP, t) ? TAG_MAP[t] : []).some((k) => have.has(k)));
  const ratio = tags.length ? matched.length / tags.length : 0;
  return { matched, ratio, level: levelOf(matched.length, tags.length) };
}

// Sorts the announcements of one check: those with more matching tags first.
// Equal scores keep the order they arrived in.
export function rankChanges(tags, changes) {
  return changes
    .map((c) => {
      const s = scorePlan(tags, c);
      return { ...c, score: s.matched.length, reasons: s.matched, level: s.level };
    })
    .sort((a, b) => b.score - a.score);
}

// Sorts all stored announcements: highest share first, then the most recent.
export function rankPlans(tags, plans) {
  return plans
    .map((p) => ({ ...p, ...scorePlan(tags, p) }))
    .sort((a, b) => b.ratio - a.ratio || String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

// Keeps only the top announcement for each company. It does not count how many each company has,
// so the company with the longer changelog does not win automatically.
export function bestPerCompany(ranked) {
  const best = new Map();
  for (const it of ranked) if (!best.has(it.companyId)) best.set(it.companyId, it);
  return [...best.values()].sort((a, b) => b.ratio - a.ratio);
}
