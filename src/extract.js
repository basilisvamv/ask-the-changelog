// Call to Context.dev: POST /web/scrape with formats.json.
// Confirmed from docs.context.dev/scrape/json: the extraction is returned in json.data.
// Body fields are in camelCase.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'https://api.context.dev/v1';
const SCRAPE_PATH = '/web/scrape';
const ROOT = path.resolve(import.meta.dirname, '..');

// Builds the request body. A pure function, so it can be tested.
export function buildBody({ url, schema, instructions }) {
  return {
    url,
    // Without this, Context.dev may return a cached page up to 3 days old.
    // For change detection we always want a fresh page.
    maxAgeMs: 0,
    formats: { json: true },
    jsonParams: { schema, instructions },
    sharedParams: { mainContentOnly: true },
  };
}

export async function extractPlans({ url, schema, instructions }) {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error('CONTEXT_DEV_API_KEY is missing from .env');

  const res = await fetch(BASE_URL + SCRAPE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(buildBody({ url, schema, instructions })),
    signal: AbortSignal.timeout(90_000),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Context.dev ${res.status}: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The Context.dev response is not valid JSON');
  }
}

// Returns the list of plans or null. HTTP 200 can still contain a failed result,
// so we check success before reading data.
export function pickPlans(raw) {
  const out = raw?.json;
  if (!out || out.success === false) return null;
  const plans = out.data?.plans;
  return Array.isArray(plans) ? plans : null;
}

// How many credits the check cost and how many are left. The fields may be in another part of the response.
export function creditsOf(raw) {
  const consumed = raw?.credits_consumed ?? raw?.key_metadata?.credits_consumed ?? null;
  const remaining = raw?.key_metadata?.credits_remaining ?? raw?.credits_remaining ?? null;
  return { consumed, remaining };
}

// Saves the raw response, so the real format can be seen on the first try.
export async function saveRaw(id, raw) {
  const dir = path.join(ROOT, 'data', 'raw');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(raw, null, 2));
}
