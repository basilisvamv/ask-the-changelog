import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLink } from '../src/links.js';

const BASE = 'https://www.anthropic.com/news';

test('safeLink: accepts a link on the same domain', () => {
  assert.equal(
    safeLink('https://docs.anthropic.com/en/release-notes', BASE),
    'https://docs.anthropic.com/en/release-notes',
  );
});

test('safeLink: a foreign domain falls back to the company page', () => {
  assert.equal(safeLink('https://evil.example.com/x', BASE), BASE);
});

test('safeLink: non-http links, invalid text and empty values fall back to the base', () => {
  assert.equal(safeLink('javascript:alert(1)', BASE), BASE);
  assert.equal(safeLink('not a url', BASE), BASE);
  assert.equal(safeLink(undefined, BASE), BASE);
  assert.equal(safeLink('', BASE), BASE);
});
