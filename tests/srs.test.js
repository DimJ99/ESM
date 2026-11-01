import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, itemKey } from '../js/engine.js';
import { nextInterval, schedule, skillsOf, attribute, pickNext, rebuildSkills, skillName, DAY } from '../js/srs.js';

const item = (o) => ({ lang: 'sr', verbId: 'write', tense: 'past', person: 0, gender: 'f', neg: false, aspect: 'impf', ...o });
const grade = (it, ans) => attribute(it, check(it, ans, { lenient: true }), ans, false);
const failed = g => Object.keys(g).filter(k => g[k] === 'again');

test('intervals grow 1 → 3 → 7 → 16 → ×2.3', () => {
  const seq = [0];
  for (let i = 0; i < 5; i++) seq.push(nextInterval(seq.at(-1)));
  assert.deepEqual(seq, [0, 1, 3, 7, 16, 37]);
});

test('a miss shrinks the interval, but not to zero for a well-known skill', () => {
  const now = 1e12;
  assert.equal(schedule({ iv: 16, reps: 5, lapses: 0 }, 'again', now).iv, 5);
  assert.equal(schedule({ iv: 3, reps: 2, lapses: 0 }, 'again', now).iv, 0);
  assert.equal(schedule({ iv: 7, reps: 3, lapses: 0 }, 'hard', now).iv, 7);
  const s = schedule(undefined, 'good', now);
  assert.equal(s.iv, 1);
  assert.equal(s.due, now + DAY);
});

test('skills of a prompt', () => {
  const sk = skillsOf(item({ neg: true }));
  assert.deepEqual(sk.map(k => k.split('|')[0]).sort(), ['agr', 'asp', 'end', 'neg', 'stem', 'tns']);
  assert.ok(sk.includes('agr|sr|f|sg'));
  // present endings are tracked per verb class
  assert.ok(skillsOf(item({ verbId: 'read', tense: 'pres', gender: null })).includes('end|sr|pres|impf|0|am'));
  assert.ok(skillsOf(item({ verbId: 'can', tense: 'pres', gender: null })).includes('end|sr|pres|impf|0|irr'));
  assert.ok(skillsOf({ lang: 'mk', verbId: 'learn', tense: 'pres', person: 0, gender: null, neg: false, aspect: 'impf' }).includes('end|mk|pres|impf|0|иш'));
});

test('only the skill that failed is marked wrong (ja · past · feminine · pisati)', () => {
  const it = item();
  assert.deepEqual(failed(grade(it, 'pisao sam')), ['agr|sr|f|sg']);           // gender agreement
  assert.deepEqual(failed(grade(it, 'pišem')), ['tns|sr|past']);               // wrong tense
  assert.deepEqual(failed(grade(it, 'pisala je')).map(k => k.split('|')[0]), ['end']); // auxiliary / person
  assert.deepEqual(failed(grade(it, 'pisala sam')), []);
  assert.deepEqual(failed(grade(item({ aspect: 'pf' }), 'pisala sam')), ['asp|sr|write']);
  assert.deepEqual(failed(grade(item({ tense: 'pres', gender: null }), 'pisem')), []); // diacritics: stem is "hard", not failed
  assert.equal(grade(item({ tense: 'pres', gender: null }), 'pisem')['stem|sr|write|impf'], 'hard');
});

test('prompts are built around the weakest due skill', () => {
  const now = Date.now();
  const settings = { langs: ['sr'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], aspects: ['impf', 'pf'] };
  const skills = {};
  // everything about one prompt known, except feminine-plural agreement which is due and weak
  skills['agr|sr|f|pl'] = { iv: 0, reps: 3, lapses: 3, due: now - DAY };
  const state = { settings, skills, attempts: Array(30).fill({ ok: 0 }) }; // low accuracy → review only
  for (let i = 0; i < 20; i++) {
    const it = pickNext(state, [], now);
    assert.equal(it.target, 'agr|sr|f|pl');
    assert.equal(it.gender, 'f');
    assert.ok(it.person >= 3);
  }
});

test('consecutive prompts vary', () => {
  const settings = { langs: ['sr', 'mk'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], aspects: ['impf', 'pf'] };
  const state = { settings, skills: {}, attempts: [] };
  let recent = [], sameTense = 0, sameVerb = 0, sameKey = 0;
  for (let i = 0; i < 300; i++) {
    const it = pickNext(state, recent);
    const last = recent.at(-1);
    if (last && it.tense === last.tense) sameTense++;
    if (last && it.verbId === last.verbId) sameVerb++;
    if (recent.slice(-4).some(r => itemKey(r) === itemKey(it))) sameKey++;
    recent = [...recent.slice(-9), it];
  }
  assert.ok(sameTense < 300 / 3, `same tense back to back ${sameTense}/300`);  // random would be ~1/3
  assert.ok(sameVerb < 10, `same verb back to back ${sameVerb}/300`);
  assert.equal(sameKey, 0);
});

test('history is replayed into skills', () => {
  const t = Date.now() - 2 * DAY;
  const skills = rebuildSkills([
    { t, l: 'sr', v: 'write', te: 'past', p: 0, g: 'f', n: 0, pf: 0, ok: 0, e: 'gender', a: 'pisao sam' },
    { t: t + 1000, l: 'sr', v: 'write', te: 'past', p: 0, g: 'f', n: 0, pf: 0, ok: 1, e: null, a: 'pisala sam' },
  ]);
  assert.equal(skills['agr|sr|f|sg'].lapses, 1);
  assert.equal(skills['agr|sr|f|sg'].iv, 1);
  assert.equal(skills['end|sr|past|impf|0|*'].iv, 1);   // right twice a second apart: no early growth
});

test('skill names read naturally', () => {
  assert.equal(skillName('agr|sr|f|sg'), 'past agreement · feminine singular (-la)');
  assert.equal(skillName('end|sr|past|impf|0|*'), 'past · ja (sam)');
  assert.equal(skillName('neg|mk|fut'), 'negation · future (нема да + verb)');
  assert.equal(skillName('asp|sr|read'), 'aspect · čitati / pročitati');
  assert.match(skillName('end|sr|pres|impf|0|am'), /^present · ja · verbs like /);
});

test('a failure loop does not chain the same tense', () => {
  // everything shown so far was answered wrong: accuracy is low, so only review is allowed
  const settings = { langs: ['sr', 'mk'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], aspects: ['impf', 'pf'] };
  const state = { settings, skills: {}, attempts: [] };
  let recent = [], sameTense = 0;
  for (let i = 0; i < 200; i++) {
    const it = pickNext(state, recent);
    if (recent.length && it.tense === recent.at(-1).tense) sameTense++;
    const outcome = { result: 'wrong', error: 'other', expected: 'x' };
    attribute(it, outcome, '', false);
    for (const [k, g] of Object.entries(attribute(it, outcome, '', false))) state.skills[k] = schedule(state.skills[k], g);
    state.attempts.push({ ok: 0 });
    recent = [...recent.slice(-9), it];
  }
  assert.ok(sameTense < 200 * 0.4, `same tense back to back ${sameTense}/200`);
});

test('success before a skill is due does not grow its interval', () => {
  const now = 1e12;
  let s = schedule(undefined, 'good', now);              // new → 1 day
  s = schedule(s, 'good', now + 60000);                  // a minute later: not due yet
  assert.equal(s.iv, 1);
  s = schedule(s, 'good', now + DAY + 1);                // came back after the gap
  assert.equal(s.iv, 3);
  s = schedule(s, 'again', now + DAY + 2);               // misses always count
  assert.equal(s.lapses, 1);
});

test('leeches need misses on more than one day', async () => {
  const { isLeech } = await import('../js/srs.js');
  const now = new Date(2026, 10, 1, 12).getTime();
  let s;
  for (let i = 0; i < 6; i++) s = schedule(s, 'again', now + i * 60000);
  assert.equal(isLeech(s), false);                       // one cram session
  s = schedule(s, 'again', now + 2 * DAY);
  assert.equal(isLeech(s), true);
});
