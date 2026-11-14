// Call to the Context.dev Answers API: POST /v1/web/answers.
// As documented at docs.context.dev/answers/overview: mode, task, json_format, timeoutOpts.
const ANSWERS_URL = 'https://api.context.dev/v1/web/answers';

// The shape we ask Answers to return.
export const ANSWER_SHAPE = { explanation: '', relevance: '' };

// Builds the request body. A pure function, so it can be tested.
export function buildAnswersBody({ task }) {
  return {
    mode: 'fast',
    task,
    json_format: ANSWER_SHAPE,
    timeoutOpts: { milliseconds: 30000, behavior: 'return-partial' },
  };
}

// The question for Answers: the user's profile and one announcement.
export function buildTask(profileText, change) {
  return [
    `A developer describes their project like this: "${profileText}".`,
    `Read the official source about this announcement: "${change.title}" (${change.date ?? 'no date'}).`,
    'Answer in English, in at most two sentences, whether this announcement matters for that project and why.',
    'In relevance put one word: high, medium or low.',
  ].join(' ');
}

export async function askAnswers({ profileText, change }) {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error('CONTEXT_DEV_API_KEY is missing from .env');

  const res = await fetch(ANSWERS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildAnswersBody({ task: buildTask(profileText, change) })),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Context.dev answers ${res.status}: ${text.slice(0, 200)}`);

  const data = JSON.parse(text);
  return {
    explanation: data.json_content?.explanation ?? null,
    relevance: data.json_content?.relevance ?? null,
    // Keep only http(s) addresses, so nothing unsafe reaches the page.
    sources: Array.isArray(data.sources) ? data.sources.filter((u) => /^https?:\/\//.test(u)) : [],
  };
}
