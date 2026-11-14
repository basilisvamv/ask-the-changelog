import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, pickPlans } from '../src/extract.js';

const schema = { type: 'object', properties: { plans: { type: 'array' } } };

test('buildBody asks for json with schema and a fresh page', () => {
  const body = buildBody({ url: 'https://x.test/pricing', schema, instructions: 'hi' });
  assert.equal(body.url, 'https://x.test/pricing');
  assert.equal(body.maxAgeMs, 0);
  assert.deepEqual(body.formats, { json: true });
  assert.deepEqual(body.jsonParams, { schema, instructions: 'hi' });
});

test('pickPlans reads json.data.plans', () => {
  const raw = { json: { success: true, data: { plans: [{ name: 'Pro', price: 20 }] } } };
  assert.deepEqual(pickPlans(raw), [{ name: 'Pro', price: 20 }]);
});

test('pickPlans returns null when the extraction failed', () => {
  assert.equal(pickPlans({ json: { success: false, message: 'x' } }), null);
});

test('pickPlans returns null when json is missing', () => {
  assert.equal(pickPlans({ markdown: { success: true } }), null);
  assert.equal(pickPlans(null), null);
});
