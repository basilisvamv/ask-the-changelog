import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPlans, pickPlans, saveRaw, creditsOf } from './extract.js';
import { normalizePlan, diffPlans, checkExtraction, summarize } from './diff.js';
import { safeLink } from './links.js';
import { loadSnapshot, saveSnapshot, loadChanges, appendChanges, loadProfile, saveProfile } from './store.js';
import { rankChanges, rankPlans, bestPerCompany, TAG_MAP, TOP_FOR_ANSWERS } from './relevance.js';
import { askAnswers } from './answers.js';
import { createRateLimiter, createLock } from './limits.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_MS = 60 * 60 * 1000; // one check per hour and company, only for calls without force
const PORT = Number(process.env.PORT ?? 3000);
const AUTO_CHECK_MINUTES = Number(process.env.AUTO_CHECK_MINUTES ?? 60); // 0 means off

// Companies without a URL are skipped. Fill in config/companies.json when you have the URLs.
const companies = JSON.parse(await readFile(path.join(ROOT, 'config/companies.json'), 'utf8'))
  .filter((c) => c.url);
const extractCfg = JSON.parse(await readFile(path.join(ROOT, 'config/schema.json'), 'utf8'));

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

const findCompany = (id) => companies.find((c) => c.id === id);
// Only tags that still exist in TAG_MAP. Old tags from earlier versions are ignored.
const currentTags = async () => ((await loadProfile())?.tags ?? []).filter((t) => Object.hasOwn(TAG_MAP, t));
const httpError = (status, message) => Object.assign(new Error(message), { status });

// One check at a time per company: manual and automatic checks never run together.
const locks = createLock();
// The "Explain" calls use Answers, so we limit them to 10 per minute.
const explainLimit = createRateLimiter({ max: 10, windowMs: 60_000 });
let lastAutoRun = null;

// Runs one check with a lock. Returns { busy: true } if another one is already running.
async function checkCompany(company, { force = false } = {}) {
  if (!locks.tryLock(company.id)) return { busy: true };
  try {
    return await runCheck(company, force);
  } finally {
    locks.unlock(company.id);
  }
}

async function runCheck(company, force) {
  const prev = await loadSnapshot(company.id);
  const now = new Date().toISOString();

  // Cache only for successful checks, and only when force was not requested.
  if (prev?.status === 'ok' && !force && Date.now() - Date.parse(prev.checked_at) < CACHE_MS) {
    return { cached: true, checkedAt: prev.checked_at, changes: [] };
  }

  let raw;
  try {
    raw = await extractPlans({ url: company.url, ...extractCfg });
  } catch (err) {
    // Keep the last good data and note that the extraction failed.
    await saveSnapshot(company.id, { ...(prev ?? {}), status: 'stale', error: err.message, attempted_at: now });
    throw httpError(502, err.message);
  }
  await saveRaw(company.id, raw);

  const plans = pickPlans(raw);
  const next = {
    url: company.url,
    plans: (plans ?? []).map(normalizePlan),
    status: 'ok',
    error: null,
    checked_at: now,
    credits: creditsOf(raw),
  };

  const problem = plans ? checkExtraction(prev, next) : 'The response has no "plans" list. See data/raw.';
  if (problem) {
    await saveSnapshot(company.id, { ...(prev ?? {}), status: 'stale', error: problem, attempted_at: now });
    throw httpError(502, problem);
  }

  const diff = diffPlans(prev, next);
  const tags = await currentTags();
  const ranked = rankChanges(tags, diff.changes);

  // Only the top items get a full explanation from Answers, so we do not spend credits.
  for (let i = 0; i < Math.min(ranked.length, TOP_FOR_ANSWERS) && tags.length; i++) {
    try {
      const a = await askAnswers({ profileText: tags.join(', '), change: ranked[i] });
      Object.assign(ranked[i], { explanation: a.explanation, relevance: a.relevance, sources: a.sources });
    } catch (err) {
      ranked[i].answers_error = err.message;
    }
  }

  const changes = ranked.map((c) => ({
    ...c,
    company: company.name,
    companyId: company.id,
    at: now,
    text: summarize(c),
    url: safeLink(c.url, company.url),
  }));

  // Many changes at once: the page probably changed. We do not report them, and this extraction becomes the new baseline.
  const warning = diff.bulk
    ? `Found ${diff.count} changes at once. The page may have changed. Not reporting them; starting a new baseline.`
    : null;

  await appendChanges(changes);
  await saveSnapshot(company.id, next);
  return { cached: false, baseline: diff.baseline, checkedAt: now, changes, warning, credits: next.credits };
}

// Automatic check of all companies. Skips any company that is already being checked.
async function autoCheckAll() {
  lastAutoRun = new Date().toISOString();
  for (const c of companies) {
    try {
      const r = await checkCompany(c, { force: true });
      if (r.busy) {
        console.log(`[auto] ${c.name}: already running, skipping`);
        continue;
      }
      const n = r.changes?.length ?? 0;
      console.log(`[auto] ${c.name}: ${r.warning ?? (r.baseline ? 'first check' : `${n} new`)}`);
    } catch (err) {
      console.log(`[auto] ${c.name}: ${err.message}`);
    }
  }
}

app.get('/api/companies', async (_req, res) => {
  const out = [];
  for (const c of companies) {
    const snap = await loadSnapshot(c.id);
    out.push({
      id: c.id,
      name: c.name,
      url: c.url,
      status: snap?.status ?? 'new',
      checkedAt: snap?.checked_at ?? null,
      planCount: snap?.plans?.length ?? 0,
      error: snap?.error ?? null,
      credits: snap?.credits ?? null,
    });
  }
  res.json(out);
});

// Automatic check settings, so they can be shown on the page.
app.get('/api/status', (_req, res) => {
  res.json({ autoCheckMinutes: AUTO_CHECK_MINUTES, lastAutoRun });
});

app.post('/api/refresh/:id', async (req, res) => {
  const company = findCompany(req.params.id);
  if (!company) return res.status(404).json({ error: 'Unknown company' });
  try {
    const body = await checkCompany(company, { force: req.query.force === '1' });
    if (body.busy) {
      return res.status(409).json({ error: 'This company is already being checked. Please wait a moment.' });
    }
    res.json(body);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// The available tags and the user's selected ones.
app.get('/api/profile', async (_req, res) => {
  res.json({ tags: await currentTags(), suggestions: Object.keys(TAG_MAP) });
});

// Saves only known tags, without duplicates, up to 16.
app.post('/api/profile', async (req, res) => {
  const known = new Set(Object.keys(TAG_MAP));
  const input = Array.isArray(req.body?.tags) ? req.body.tags : [];
  const tags = [...new Set(input.filter((t) => typeof t === 'string' && known.has(t)))].slice(0, 16);
  await saveProfile(tags);
  res.json({ tags });
});

// All stored announcements, scored with the user's tags,
// and the top announcement of each company for the recommendation.
app.get('/api/compat', async (_req, res) => {
  const tags = await currentTags();
  const all = [];
  for (const c of companies) {
    const snap = await loadSnapshot(c.id);
    for (const p of snap?.plans ?? []) {
      all.push({ ...p, companyId: c.id, company: c.name, url: safeLink(p.url, c.url) });
    }
  }
  const ranked = rankPlans(tags, all);
  res.json({ tags, items: ranked, recommendation: bestPerCompany(ranked) });
});

// Full explanation for one announcement, only when requested. Calls Answers, so it is rate limited.
app.post('/api/explain', async (req, res) => {
  if (!explainLimit()) {
    return res.status(429).json({ error: 'Too many explanation requests. Please wait a minute.' });
  }
  const tags = await currentTags();
  if (tags.length === 0) return res.status(400).json({ error: 'Choose keywords first.' });
  const title = String(req.body?.title ?? '').slice(0, 300);
  const date = req.body?.date ? String(req.body.date).slice(0, 10) : null;
  try {
    const a = await askAnswers({ profileText: tags.join(', '), change: { title, date } });
    res.json(a);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/changes', async (_req, res) => {
  // Only companies in the current config. Old entries (for example from the demo) are not shown.
  res.json((await loadChanges()).filter((c) => findCompany(c.companyId)).slice(0, 100));
});

app.listen(PORT, () => {
  console.log(`Ask the Changelog: http://localhost:${PORT}`);
  console.log(`Companies with a URL: ${companies.length}`);
  if (AUTO_CHECK_MINUTES > 0) {
    // The first automatic check runs after the first interval, not on startup,
    // so credits are not spent on every restart.
    setInterval(autoCheckAll, AUTO_CHECK_MINUTES * 60_000);
    console.log(`Automatic check every ${AUTO_CHECK_MINUTES} minutes.`);
  }
});
