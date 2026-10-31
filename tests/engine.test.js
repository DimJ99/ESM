import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERBS } from '../js/verbs.js';
import { formsFor, check, buildPool, hintFor, VERB_BY_ID } from '../js/engine.js';

const six = s => s && s.split(' ').length === 6;
const item = (lang, verbId, tense, person, gender = null, neg = false) => ({ lang, verbId, tense, person, gender, neg });
const neg = (lang, verbId, tense, person, gender = null) => item(lang, verbId, tense, person, gender, true);
const run = (it, ans, lenient = true) => check(it, ans, { lenient });

test('verb data is well-formed', () => {
  const ids = new Set();
  for (const v of VERBS) {
    assert.ok(!ids.has(v.id), `duplicate id ${v.id}`);
    ids.add(v.id);
    assert.ok(six(v.sr.pres), `${v.id} sr.pres`);
    if (v.sr.presAlt) assert.ok(six(v.sr.presAlt), `${v.id} sr.presAlt`);
    assert.match(v.sr.past, /^\S+o \S+la$/, `${v.id} sr.past should be "masc fem"`);
    assert.match(v.sr.inf, /(ti|ći)$/, `${v.id} sr.inf`);
    assert.doesNotMatch(v.sr.pres + v.sr.inf, /[а-яѓќѕљњџј]/i, `${v.id} sr must be Latin`);
    assert.ok(six(v.mk.pres), `${v.id} mk.pres`);
    assert.ok(six(v.mk.past), `${v.id} mk.past`);
    if (v.mk.fut) assert.ok(six(v.mk.fut), `${v.id} mk.fut`);
    for (const k of ['negPres']) if (v.sr[k]) assert.ok(six(v.sr[k]), `${v.id} sr.${k}`);
    for (const k of ['negPres', 'negPast']) if (v.mk[k]) assert.ok(six(v.mk[k]), `${v.id} mk.${k}`);
    assert.doesNotMatch(v.mk.pres + v.mk.past, /[a-z]/i, `${v.id} mk must be Cyrillic`);
  }
  assert.equal(VERBS.length, 50);
});

test('serbian forms', () => {
  const read = VERB_BY_ID.read;
  assert.deepEqual(formsFor(read, 'sr', 'pres', 0), ['čitam']);
  assert.deepEqual(formsFor(read, 'sr', 'past', 0, 'f'), ['čitala sam', 'sam čitala']);
  assert.equal(formsFor(read, 'sr', 'past', 2, 'n')[0], 'čitalo je');
  assert.equal(formsFor(read, 'sr', 'past', 5, 'f')[0], 'čitale su');
  assert.equal(formsFor(read, 'sr', 'past', 3, 'm')[0], 'čitali smo');
  assert.deepEqual(formsFor(read, 'sr', 'fut', 1), ['čitaćeš', 'ćeš čitati']);
  assert.equal(formsFor(VERB_BY_ID.go, 'sr', 'fut', 0)[0], 'ići ću');
  assert.equal(formsFor(VERB_BY_ID.can, 'sr', 'fut', 3)[0], 'moći ćemo');
  assert.equal(formsFor(VERB_BY_ID.eat, 'sr', 'fut', 0)[0], 'ješću');
  assert.equal(formsFor(VERB_BY_ID.be, 'sr', 'fut', 2)[0], 'biće');
  assert.equal(formsFor(VERB_BY_ID.go, 'sr', 'past', 1, 'f')[0], 'išla si');
  assert.equal(formsFor(VERB_BY_ID.want, 'sr', 'past', 4, 'f')[0], 'htele ste');
  assert.equal(formsFor(VERB_BY_ID.be, 'sr', 'past', 0, 'm')[0], 'bio sam');
});

test('macedonian forms', () => {
  assert.deepEqual(formsFor(VERB_BY_ID.read, 'mk', 'fut', 3), ['ќе читаме']);
  assert.deepEqual(formsFor(VERB_BY_ID.be, 'mk', 'fut', 0), ['ќе бидам']);
  assert.deepEqual(formsFor(VERB_BY_ID.go, 'mk', 'past', 5), ['одеа']);
  assert.equal(hintFor(VERB_BY_ID.read, 'mk'), 'чита');
  assert.equal(hintFor(VERB_BY_ID.be, 'mk'), 'сум');
  assert.equal(hintFor(VERB_BY_ID.read, 'sr'), 'čitati');
});

test('accepts pronouns, word order and alternatives', () => {
  assert.equal(run(item('sr', 'read', 'pres', 0), 'Ja čitam.').result, 'correct');
  assert.equal(run(item('sr', 'read', 'past', 0, 'f'), 'ja sam čitala').result, 'correct');
  assert.equal(run(item('sr', 'read', 'past', 0, 'f'), 'čitala sam').result, 'correct');
  assert.equal(run(item('sr', 'read', 'fut', 0), 'ja ću čitati').result, 'correct');
  assert.equal(run(item('sr', 'be', 'pres', 0), 'jesam').result, 'correct');
  assert.equal(run(item('mk', 'read', 'fut', 2), 'таа ќе чита').result, 'correct');
});

test('special letters: lenient vs strict', () => {
  const it = item('sr', 'read', 'pres', 0);
  assert.deepEqual([run(it, 'citam').result, run(it, 'citam').error], ['close', 'diacritics']);
  assert.equal(run(it, 'citam', false).result, 'wrong');
  assert.equal(run(item('mk', 'pay', 'pres', 0), 'плакам').error, 'diacritics');
});

test('decodes mistakes', () => {
  const err = (it, ans) => run(it, ans).error;
  assert.equal(err(item('sr', 'read', 'past', 0, 'f'), 'čitao sam'), 'gender');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'čitaš'), 'person');
  assert.equal(err(item('sr', 'read', 'past', 0, 'm'), 'čitao si'), 'person');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'čitao sam'), 'tense');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'читам'), 'language');
  assert.equal(err(item('sr', 'read', 'past', 0, 'f'), 'čitala'), 'auxiliary');
  assert.equal(err(item('mk', 'read', 'fut', 0), 'читам'), 'ke');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'pišem'), 'verb');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'citas'), 'person'); // wrong person AND no diacritics
  assert.equal(err(item('sr', 'read', 'pres', 0), 'čitem'), 'spelling');
  assert.equal(err(item('sr', 'read', 'pres', 0), 'banana'), 'other');
  assert.equal(err(item('sr', 'read', 'pres', 0), ''), 'blank');
});

test('negative forms', () => {
  const f = (v, lang, tense, p, g) => formsFor(VERB_BY_ID[v], lang, tense, p, g, true)[0];
  assert.equal(f('read', 'sr', 'pres', 0), 'ne čitam');
  assert.equal(f('be', 'sr', 'pres', 2), 'nije');
  assert.equal(f('have', 'sr', 'pres', 3), 'nemamo');
  assert.equal(f('want', 'sr', 'pres', 0), 'neću');
  assert.equal(f('read', 'sr', 'past', 0, 'f'), 'nisam čitala');
  assert.equal(f('go', 'sr', 'past', 5, 'm'), 'nisu išli');
  assert.equal(f('read', 'sr', 'fut', 1), 'nećeš čitati');
  assert.equal(f('go', 'sr', 'fut', 0), 'neću ići');
  assert.equal(f('read', 'mk', 'pres', 0), 'не читам');
  assert.equal(f('have', 'mk', 'pres', 2), 'нема');
  assert.equal(f('have', 'mk', 'past', 0), 'немав');
  assert.equal(f('be', 'mk', 'pres', 0), 'не сум');
  assert.equal(f('read', 'mk', 'fut', 3), 'нема да читаме');
  assert.equal(f('be', 'mk', 'fut', 0), 'нема да бидам');
  assert.equal(run(neg('sr', 'read', 'past', 0, 'f'), 'ja nisam čitala').result, 'correct');
  assert.equal(run(neg('mk', 'read', 'fut', 2), 'тој нема да чита').result, 'correct');
});

test('decodes negation mistakes', () => {
  const err = (it, ans) => run(it, ans).error;
  assert.equal(err(neg('sr', 'read', 'pres', 0), 'čitam'), 'negation');          // forgot "ne"
  assert.equal(err(item('sr', 'read', 'pres', 0), 'ne čitam'), 'negation');      // added "ne"
  assert.equal(err(neg('sr', 'read', 'past', 0, 'm'), 'ne čitao sam'), 'negation');
  assert.equal(err(neg('sr', 'read', 'fut', 0), 'ne ću čitati'), 'negation');
  assert.equal(err(neg('sr', 'be', 'pres', 0), 'ne sam'), 'negation');
  assert.equal(err(neg('mk', 'read', 'fut', 0), 'не ќе читам'), 'negation');
  assert.equal(err(neg('mk', 'read', 'fut', 0), 'не читам'), 'negation');
  assert.equal(err(neg('mk', 'have', 'pres', 0), 'не имам'), 'negation');
  assert.equal(err(neg('sr', 'read', 'past', 0, 'f'), 'nisam čitao'), 'gender');
  assert.equal(err(neg('sr', 'read', 'pres', 0), 'ne čitaš'), 'person');
});

test('pool size', () => {
  const all = buildPool({ langs: ['sr', 'mk'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], includeNeuter: false });
  // per polarity — sr: 50*(6 + 12 + 6), mk: 50*18
  assert.equal(all.length, 2 * (50 * 24 + 50 * 18));
});
