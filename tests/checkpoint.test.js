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

test('checkpoints keep their misses and export as CSV', async () => {
  const { toCSV } = await import('../js/checkpoint.js');
  const item = { lang: 'sr', verbId: 'read', tense: 'past', person: 0, gender: 'f', neg: false, aspect: 'impf' };
  const s = summarize([{ item, ok: false, error: 'gender', answer: 'čitao sam', expected: 'čitala sam', ms: 4000 },
                       { item, ok: true, ms: 2000 }], Date.UTC(2026, 10, 12, 9));
  assert.equal(s.misses.length, 1);
  assert.equal(s.medianMs, 4000);
  const csv = toCSV([{ ...s, lang: 'sr' }], () => 'Srpski', m => `${m.v} ${m.te}`).split('\n');
  assert.equal(csv[0].split(',')[0], 'date');
  assert.match(csv[1], /^2026-11-12 09:00,Srpski,verbs,1,2,50,4\.0,,50,,past 50%,gender 1,read past: čitao sam → čitala sam$/);
});

test('noun and connector checkpoints', () => {
  const nouns = buildCheckpoint({ langs: ['sr'], module: 'nouns', nounKinds: ['case', 'count', 'own', 'art'] });
  assert.equal(nouns.length, 30);
  assert.ok(nouns.every(i => i.mod === 'noun' && i.lang === 'sr'));
  for (const k of ['case', 'count', 'own']) assert.ok(nouns.filter(i => i.kind === k).length >= 8, k);
  assert.ok(nouns.filter(i => i.kind === 'count').every(i => i.n));
  assert.equal(new Set(nouns.map(i => i.nounId)).size, 30);
  const conns = buildCheckpoint({ langs: ['mk'], module: 'connectors' });
  assert.equal(conns.length, 30);
  assert.equal(new Set(conns.map(i => i.connId)).size, 30);
});

test('pronoun checkpoints', () => {
  const items = buildCheckpoint({ langs: ['sr'], module: 'pronouns', pronKinds: ['drill', 'form', 'poss'] });
  assert.equal(items.length, 30);
  assert.ok(items.every(i => i.mod === 'pron' && i.lang === 'sr'));
  assert.equal(new Set(items.map(i => `${i.pid}|${i.detail}`)).size, 30);
  for (const k of ['drill', 'form', 'poss']) assert.ok(items.some(i => i.kind === k), k);
});

test('adjective checkpoints', () => {
  const items = buildCheckpoint({ langs: ['mk'], module: 'adjectives', adjKinds: ['agree', 'poss3', 'cmp', 'art', 'indef'] });
  assert.equal(items.length, 30);
  assert.ok(items.every(i => i.mod === 'adj' && i.lang === 'mk' && i.nounId));
  assert.equal(new Set(items.map(i => i.adjId)).size, 30);
});
