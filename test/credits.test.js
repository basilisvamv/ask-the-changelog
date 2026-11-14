import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditsOf } from '../src/extract.js';

test('creditsOf: reads cost and remaining balance', () => {
  assert.deepEqual(
    creditsOf({ credits_consumed: 5, key_metadata: { credits_remaining: 50895 } }),
    { consumed: 5, remaining: 50895 },
  );
});

test('creditsOf: without fields returns null and does not break', () => {
  assert.deepEqual(creditsOf({}), { consumed: null, remaining: null });
  assert.deepEqual(creditsOf(undefined), { consumed: null, remaining: null });
});
