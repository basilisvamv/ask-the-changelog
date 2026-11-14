import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, levelOf, scorePlan, rankChanges, rankPlans, bestPerCompany } from '../src/relevance.js';

test('tokens: no accents, lowercase, no common words, no single letters', () => {
  assert.deepEqual(tokens('Voice and HTML, a'), ['voice', 'html']);
});

test('levelOf: none, low, medium, high from the share', () => {
  assert.equal(levelOf(0, 3), 'none');
  assert.equal(levelOf(0, 0), 'none');
  assert.equal(levelOf(1, 4), 'low');     // 0.25
  assert.equal(levelOf(1, 3), 'medium');  // 0.33
  assert.equal(levelOf(2, 3), 'high');    // 0.67
  assert.equal(levelOf(1, 1), 'high');
});

test('scorePlan: only the selected tags match', () => {
  const s = scorePlan(['Voice', 'Pricing'], { title: 'Realtime voice API', summary: 'New voice', category: '' });
  assert.deepEqual(s.matched, ['Voice']);
  assert.equal(s.level, 'medium');
});

test('scorePlan: no tag matches', () => {
  const s = scorePlan(['Pricing'], { title: 'Video model', summary: '', category: '' });
  assert.deepEqual(s.matched, []);
  assert.equal(s.level, 'none');
});

test('rankChanges: more matching tags first', () => {
  const tags = ['Voice', 'Video'];
  const ranked = rankChanges(tags, [
    { title: 'Voice model', summary: '', category: '' },
    { title: 'Price cut', summary: '', category: '' },
    { title: 'Voice and video model', summary: '', category: '' },
  ]);
  assert.deepEqual(ranked.map((r) => r.score), [2, 1, 0]);
  assert.deepEqual(ranked.map((r) => r.level), ['high', 'medium', 'none']);
  assert.equal(ranked[0].title, 'Voice and video model');
});

test('rankPlans: same share, most recent first. Non-matching ones last', () => {
  const tags = ['Pricing'];
  const ranked = rankPlans(tags, [
    { title: 'Price old', date: '2026-11-01', companyId: 'a' },
    { title: 'Model', date: '2026-11-20', companyId: 'a' },
    { title: 'Price new', date: '2026-11-10', companyId: 'b' },
  ]);
  assert.deepEqual(ranked.map((p) => p.title), ['Price new', 'Price old', 'Model']);
});

test('bestPerCompany: one announcement per company, even if one has many articles', () => {
  const ranked = [
    { companyId: 'b', ratio: 0.5, title: 'b1' },
    { companyId: 'a', ratio: 0, title: 'a1' },
    { companyId: 'a', ratio: 0, title: 'a2' },
    { companyId: 'a', ratio: 0, title: 'a3' },
  ];
  const best = bestPerCompany(ranked);
  assert.deepEqual(best.map((x) => x.companyId), ['b', 'a']);
  assert.equal(best.length, 2);
});
