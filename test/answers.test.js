import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswersBody, buildTask } from '../src/answers.js';

test('buildAnswersBody: fast mode and output shape', () => {
  const b = buildAnswersBody({ task: 'hi' });
  assert.equal(b.mode, 'fast');
  assert.equal(b.task, 'hi');
  assert.deepEqual(Object.keys(b.json_format), ['explanation', 'relevance']);
});

test('buildTask: contains the profile and the announcement title', () => {
  const t = buildTask('HTML page', { title: 'Batch API now supports JSON', date: '2026-10-22' });
  assert.ok(t.includes('HTML page'));
  assert.ok(t.includes('Batch API now supports JSON'));
});
