import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, createLock } from '../src/limits.js';

test('rate limiter: up to max calls within the window, then no', () => {
  let t = 0;
  const allow = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
  assert.equal(allow(), true);
  assert.equal(allow(), true);
  assert.equal(allow(), false);
});

test('rate limiter: allows again after the window', () => {
  let t = 0;
  const allow = createRateLimiter({ max: 1, windowMs: 1000, now: () => t });
  assert.equal(allow(), true);
  assert.equal(allow(), false);
  t = 1000;
  assert.equal(allow(), true);
});

test('lock: a second lock on the same key fails until it is unlocked', () => {
  const l = createLock();
  assert.equal(l.tryLock('a'), true);
  assert.equal(l.tryLock('a'), false);
  assert.equal(l.tryLock('b'), true);
  l.unlock('a');
  assert.equal(l.tryLock('a'), true);
});
