import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckpoint, summarize, CHECKPOINT_SIZE } from '../js/checkpoint.js';

const all = { langs: ['sr', 'mk'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], aspects: ['impf', 'pf'] };

test('30 prompts, spread across everything switched on', () => {
  const items = buildCheckpoint(all);
  assert.equal(items.length, CHECKPOINT_SIZE);
  assert.equal(new Set(items.map(i => i.verbId + i.lang)).size, 30, 'no verb repeated within a language');
  for (const t of all.tenses) assert.ok(items.filter(i => i.tense === t).length >= 6, `tense ${t}`);
  for (const l of all.langs) assert.ok(items.filter(i => i.lang === l).length >= 10, `lang ${l}`);
  assert.ok(items.filter(i => i.neg).length >= 10 && items.filter(i => !i.neg).length >= 10);
  for (let p = 0; p < 6; p++) assert.ok(items.filter(i => i.person === p).length >= 3, `person ${p}`);
  let same = 0;
  for (let i = 1; i < items.length; i++) if (items[i].tense === items[i - 1].tense) same++;
  assert.ok(same <= 3, `same tense back to back ${same}`);
});

test('respects settings', () => {
  const items = buildCheckpoint({ ...all, langs: ['mk'], tenses: ['past'] });
  assert.equal(items.length, 30);
  assert.ok(items.every(i => i.lang === 'mk' && i.tense === 'past'));
  assert.deepEqual(buildCheckpoint({ ...all, tenses: [] }), []);
});

test('summary', () => {
  const r = (tense, ok, error = null, hinted = false) => ({ item: { tense, lang: 'sr' }, ok, error, hinted });
  const s = summarize([r('past', true), r('past', false, 'gender'), r('fut', false, null, true)], 5);
  assert.deepEqual({ n: s.n, ok: s.ok, t: s.t }, { n: 3, ok: 1, t: 5 });
  assert.deepEqual(s.byTense.past, { n: 2, ok: 1 });
  assert.deepEqual(s.errors, { gender: 1, hint: 1 });
});
