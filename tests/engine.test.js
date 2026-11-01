import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERBS } from '../js/verbs.js';
import { formsFor, check, buildPool, hintFor, promptFor, VERB_BY_ID } from '../js/engine.js';

const six = s => s && s.split(' ').length === 6;
const item = (lang, verbId, tense, person, gender = null, neg = false) => ({ lang, verbId, tense, person, gender, neg });
const neg = (lang, verbId, tense, person, gender = null) => item(lang, verbId, tense, person, gender, true);
const pf = (verbId, tense, person, gender = null, n = false) => ({ ...item('sr', verbId, tense, person, gender, n), aspect: 'pf' });
const run = (it, ans, lenient = true) => check(it, ans, { lenient });

test('verb data is well-formed', () => {
  const ids = new Set();
  for (const v of VERBS) {
    assert.ok(!ids.has(v.id), `duplicate id ${v.id}`);
    ids.add(v.id);
    assert.ok(six(v.sr.pres), `${v.id} sr.pres`);
    if (v.sr.pf) {
      assert.ok(six(v.sr.pf.pres), `${v.id} sr.pf.pres`);
      assert.match(v.sr.pf.past, /^\S+o \S+la$/, `${v.id} sr.pf.past`);
      assert.match(v.sr.pf.inf, /(ti|ći)$/, `${v.id} sr.pf.inf`);
    }
    if (!v.mk) continue;
    if (v.sr.presAlt) assert.ok(six(v.sr.presAlt), `${v.id} sr.presAlt`);
    assert.match(v.sr.past, /^\S+o \S+la$/, `${v.id} sr.past should be "masc fem"`);
    assert.match(v.sr.inf, /(ti|ći)$/, `${v.id} sr.inf`);
    assert.doesNotMatch(v.sr.pres + v.sr.inf, /[а-яѓќѕљњџј]/i, `${v.id} sr must be Latin`);
    assert.ok(six(v.mk.pres), `${v.id} mk.pres`);
    assert.ok(six(v.mk.past), `${v.id} mk.past`);
    if (v.mk.fut) assert.ok(six(v.mk.fut), `${v.id} mk.fut`);
    for (const k of ['negPres']) if (v.sr[k]) assert.ok(six(v.sr[k]), `${v.id} sr.${k}`);
    for (const k of ['negPres', 'negPast']) if (v.mk[k]) assert.ok(six(v.mk[k]), `${v.id} mk.${k}`);
    if (v.mk.pf) {
      assert.ok(v.mk.pf.dict, `${v.id} mk.pf.dict`);
      assert.ok(six(v.mk.pf.pres), `${v.id} mk.pf.pres`);
      assert.ok(six(v.mk.pf.past), `${v.id} mk.pf.past`);
      assert.doesNotMatch(v.mk.pf.pres + v.mk.pf.past, /[a-z]/i, `${v.id} mk.pf must be Cyrillic`);
      assert.equal(!!v.mk.pf.refl, !!v.mk.refl, `${v.id} mk.pf.refl should match`);
    }
    assert.doesNotMatch(v.mk.pres + v.mk.past, /[a-z]/i, `${v.id} mk must be Cyrillic`);
  }
  assert.equal(VERBS.length, 74);
  assert.equal(VERBS.filter(v => v.sr.pf).length, 59);
  assert.equal(VERBS.filter(v => v.mk?.pf).length, 61);
  assert.equal(VERBS.filter(v => v.mk).length, 74);
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

test('perfective forms', () => {
  const f = (v, tense, p, g, n = false) => formsFor(VERB_BY_ID[v], 'sr', tense, p, g, n, 'pf')[0];
  assert.equal(f('read', 'past', 0, 'm'), 'pročitao sam');
  assert.equal(f('read', 'fut', 0), 'pročitaću');
  assert.equal(f('read', 'fut', 0, null, true), 'neću pročitati');
  assert.equal(f('come', 'fut', 3), 'doći ćemo');
  assert.equal(f('sit', 'fut', 0), 'sešću');
  assert.equal(f('eat', 'fut', 1), 'poješćeš');
  assert.equal(f('help', 'past', 1, 'f'), 'pomogla si');
  assert.equal(hintFor(VERB_BY_ID.read, 'sr', 'pf'), 'pročitati');
  assert.equal(promptFor(VERB_BY_ID.sleep, 'pf'), 'to fall asleep');
  assert.equal(promptFor(VERB_BY_ID.read, 'pf'), 'to read');
});

test('reflexive forms', () => {
  const w = VERB_BY_ID.wake;
  assert.deepEqual(formsFor(w, 'sr', 'pres', 0), ['budim se', 'se budim']);
  assert.equal(formsFor(w, 'sr', 'past', 2, 'm')[0], 'budio se');           // je drops
  assert.equal(formsFor(w, 'sr', 'past', 0, 'f')[0], 'budila sam se');
  assert.equal(formsFor(w, 'sr', 'past', 0, 'm', true)[0], 'nisam se budio');
  assert.deepEqual(formsFor(w, 'sr', 'fut', 0), ['budiću se', 'ću se buditi']);
  assert.equal(formsFor(w, 'sr', 'fut', 0, null, true)[0], 'neću se buditi');
  assert.equal(formsFor(w, 'sr', 'past', 0, 'm', false, 'pf')[0], 'probudio sam se');
  assert.equal(hintFor(w, 'sr', 'pf'), 'probuditi se');
  assert.equal(formsFor(w, 'mk', 'pres', 0)[0], 'се будам');
  assert.equal(formsFor(w, 'mk', 'pres', 0, null, true)[0], 'не се будам');
  assert.equal(formsFor(w, 'mk', 'past', 0)[0], 'се будев');
  assert.equal(formsFor(w, 'mk', 'fut', 0)[0], 'ќе се будам');
  assert.equal(formsFor(w, 'mk', 'fut', 0, null, true)[0], 'нема да се будам');
  assert.equal(hintFor(w, 'mk'), 'се буди');
  assert.equal(run(item('sr', 'wake', 'pres', 0), 'ja se budim').result, 'correct');
  assert.equal(run(item('sr', 'wake', 'past', 2, 'f'), 'ona se budila').result, 'correct');
  assert.equal(run(neg('sr', 'wake', 'past', 2, 'm'), 'on se nije budio').result, 'correct');
  assert.equal(run(item('mk', 'return', 'fut', 3), 'ние ќе се враќаме').result, 'correct');
});

test('macedonian perfective forms', () => {
  const f = (v, tense, p, n = false) => formsFor(VERB_BY_ID[v], 'mk', tense, p, null, n, 'pf')[0];
  assert.equal(f('read', 'past', 0), 'прочитав');
  assert.equal(f('read', 'past', 2), 'прочита');
  assert.equal(f('come', 'past', 5), 'дојдоа');
  assert.equal(f('read', 'fut', 3), 'ќе прочитаме');
  assert.equal(f('read', 'past', 0, true), 'не прочитав');
  assert.equal(f('read', 'fut', 0, true), 'нема да прочитам');
  assert.equal(f('wake', 'past', 0), 'се разбудив');
  assert.equal(f('wake', 'fut', 0, true), 'нема да се разбудам');
  assert.equal(f('hear', 'past', 0), 'чув');
  assert.equal(hintFor(VERB_BY_ID.read, 'mk', 'pf'), 'прочита');
  assert.equal(hintFor(VERB_BY_ID.return, 'mk', 'pf'), 'се врати');
  assert.equal(hintFor(VERB_BY_ID.see, 'mk'), 'гледа');
  const mpf = (v, tense, p) => ({ ...item('mk', v, tense, p), aspect: 'pf' });
  assert.equal(run(mpf('read', 'past', 0), 'јас прочитав').result, 'correct');
  assert.equal(run(mpf('read', 'past', 0), 'читав').error, 'aspect');
  assert.equal(run(item('mk', 'buy', 'fut', 0), 'ќе купам').error, 'aspect');
});

test('decodes aspect mistakes', () => {
  assert.equal(run(pf('read', 'past', 0, 'm'), 'čitao sam').error, 'aspect');
  assert.equal(run(item('sr', 'read', 'past', 0, 'm'), 'pročitao sam').error, 'aspect');
  assert.equal(run(pf('buy', 'fut', 0), 'kupovaću').error, 'aspect');
  assert.equal(run(pf('read', 'past', 0, 'm'), 'pročitao si').error, 'person');
});

test('pool', () => {
  const all = buildPool({ langs: ['sr', 'mk'], tenses: ['pres', 'past', 'fut'], polarity: ['pos', 'neg'], aspects: ['impf', 'pf'], includeNeuter: false });
  // per polarity — sr impf: 74*(6+12+6), sr pf: 59*(12+6), mk impf: 74*18, mk pf: 61*(6+6)
  assert.equal(all.length, 2 * (74 * 24 + 59 * 18 + 74 * 18 + 61 * 12));
  assert.ok(!all.some(i => i.aspect === 'pf' && i.tense === 'pres'));
  const pfOnly = buildPool({ langs: ['sr'], tenses: ['past'], polarity: ['pos'], aspects: ['pf'], includeNeuter: false });
  assert.equal(pfOnly.length, 59 * 12);
});

test('conjugation groups', async () => {
  const { groupOf } = await import('../js/engine.js');
  const g = (id, lang, a) => groupOf(VERB_BY_ID[id], lang, a);
  assert.equal(g('read', 'mk'), 'a');      // чита
  assert.equal(g('eat', 'mk'), 'e');       // јаде
  assert.equal(g('make', 'mk'), 'i');      // прави
  assert.equal(g('be', 'mk'), 'irr');      // сум
  assert.equal(g('read', 'sr'), 'a');      // čitam
  assert.equal(g('write', 'sr'), 'e');     // pišem
  assert.equal(g('make', 'sr'), 'i');      // pravim
  assert.equal(g('can', 'sr'), 'irr');     // mogu
  assert.equal(g('be', 'sr'), 'irr');      // sam
  assert.equal(g('give', 'sr', 'pf'), 'a'); // dam
  assert.equal(g('read', 'mk', 'pf'), 'a'); // прочита
});
