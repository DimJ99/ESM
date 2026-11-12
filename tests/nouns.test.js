import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOUNS, NOUN_BY_ID, nounForms, checkNoun, buildNounPool, nounTwin, frameText, srClass, nounSkills } from '../js/nounEngine.js';

const N = (lang, nounId, kind, detail, num = 'sg', extra = {}) => ({ mod: 'noun', lang, nounId, kind, detail, num, ...extra });
const first = it => nounForms(it)[0];
const run = (it, ans) => checkNoun(it, ans, { lenient: true });

test('noun data is well-formed', () => {
  assert.equal(NOUNS.length, 117);
  for (const n of NOUNS) {
    for (const num of ['sg', 'pl']) if (n.sr[num]) assert.equal(n.sr[num].split(' ').length, 7, `${n.id} sr.${num}`);
    assert.ok(n.sr.sg || n.sr.pl, n.id);
    assert.ok(['m', 'f', 'n'].includes(n.sr.g), `${n.id} sr.g`);
    assert.ok(['m', 'f', 'n', 'pl'].includes(n.mk.g), `${n.id} mk.g`);
    if (n.mk.sg) assert.ok(n.mk.def, `${n.id} mk.def`);
    if (n.mk.pl) assert.ok(n.mk.plDef, `${n.id} mk.plDef`);
  }
});

test('Serbian case frames', () => {
  const store = N('sr', 'store', 'case', 'idem');
  assert.equal(frameText(store), 'idem u ___');
  assert.equal(first(store), 'prodavnicu');
  assert.equal(first(N('sr', 'store', 'case', 'u')), 'prodavnici');
  assert.equal(frameText(N('sr', 'market', 'case', 'idem')), 'idem na ___');
  assert.equal(first(N('sr', 'brother', 'case', 'vidim')), 'brata');
  assert.equal(first(N('sr', 'city', 'case', 'vidim')), 'grad');
  assert.equal(first(N('sr', 'brother', 'case', 'sa')), 'bratom');
  assert.deepEqual(nounForms(N('sr', 'night', 'case', 's')), ['noći', 'noću']);
  assert.equal(run(store, 'idem u prodavnicu').result, 'correct');            // frame words are ignored
  assert.equal(srClass(NOUN_BY_ID.grandfather), 'am');
  assert.equal(srClass(NOUN_BY_ID.night), 'i');
});

test('counting and possessives', () => {
  assert.equal(first(N('sr', 'city', 'count', '24', 'pl', { n: 2 })), 'grada');
  assert.equal(first(N('sr', 'house', 'count', '24', 'pl', { n: 3 })), 'kuće');
  assert.equal(first(N('sr', 'grandfather', 'count', '24', 'pl', { n: 2 })), 'dede');
  assert.equal(first(N('sr', 'city', 'count', '5', 'pl', { n: 5 })), 'gradova');
  assert.equal(run(N('sr', 'house', 'count', '24', 'pl', { n: 2 }), 'dve kuće').result, 'correct');
  assert.equal(run(N('sr', 'house', 'count', '24', 'pl', { n: 2 }), 'dva kuće').error, 'agreement');
  assert.equal(first(N('sr', 'mother', 'own', 0)), 'moja majka');
  assert.equal(first(N('sr', 'parent', 'own', 0, 'pl')), 'moji roditelji');
  assert.equal(first(N('sr', 'brother', 'own', 0, 'pl')), 'moja braća');
  assert.equal(first(N('sr', 'eye', 'own', 4, 'pl')), 'naše oči');
  assert.equal(first(N('sr', 'child', 'own', 2)), 'njegovo dete');
  assert.equal(first(N('sr', 'door', 'own', 0, 'pl')), 'moja vrata');
  assert.equal(first(N('mk', 'chair', 'count', 'n', 'pl', { n: 2 })), 'стола');
  assert.equal(first(N('mk', 'house', 'count', 'n', 'pl', { n: 2 })), 'куќи');
});

test('Macedonian articles and ownership', () => {
  assert.equal(first(N('mk', 'chair', 'art', 'def')), 'столот');
  assert.equal(first(N('mk', 'chair', 'art', 'prox')), 'столов');
  assert.equal(first(N('mk', 'chair', 'art', 'dist')), 'столон');
  assert.equal(first(N('mk', 'woman', 'art', 'prox')), 'женава');
  assert.equal(first(N('mk', 'child', 'art', 'dist', 'pl')), 'децана');
  assert.equal(first(N('mk', 'person', 'art', 'def', 'pl')), 'луѓето');
  assert.equal(first(N('mk', 'sister', 'own', 0)), 'сестра ми');
  assert.equal(first(N('mk', 'sister', 'own', 3)), 'сестра ѝ');
  assert.equal(first(N('mk', 'sister', 'own', 0, 'pl')), 'моите сестри');
  assert.equal(first(N('mk', 'friend', 'own', 0, 'pl')), 'моите пријатели');
  assert.equal(first(N('mk', 'phone', 'own', 0)), 'мојот телефон');
  assert.equal(first(N('mk', 'book', 'own', 3)), 'нејзината книга');
  assert.equal(first(N('mk', 'money', 'own', 0, 'pl')), 'моите пари');
});

test('decodes noun mistakes', () => {
  const err = (it, a) => run(it, a).error;
  assert.equal(err(N('sr', 'store', 'case', 'idem'), 'prodavnici'), 'motion');
  assert.equal(err(N('sr', 'store', 'case', 'u'), 'u prodavnicu sam'), 'motion');
  assert.equal(err(N('sr', 'brother', 'case', 'vidim'), 'brat'), 'animacy');
  assert.equal(err(N('sr', 'city', 'case', 'vidim'), 'grada'), 'animacy');
  assert.equal(err(N('sr', 'brother', 'case', 'sa'), 'brata'), 'case');
  assert.equal(err(N('sr', 'brother', 'case', 'sa', 'pl'), 'bratom'), 'number');
  assert.equal(err(N('sr', 'city', 'count', '5', 'pl', { n: 5 }), 'gradovi'), 'counting');
  assert.equal(err(N('sr', 'mother', 'own', 0), 'moj majka'), 'agreement');
  assert.equal(err(N('sr', 'mother', 'own', 0), 'tvoja majka'), 'possessive');
  assert.equal(err(N('sr', 'book', 'case', 'nom'), 'kniga'), 'bleed');
  assert.equal(err(N('mk', 'chair', 'art', 'prox'), 'столот'), 'article');
  assert.equal(err(N('mk', 'chair', 'art', 'def'), 'столовите'), 'number');
  assert.equal(err(N('mk', 'chair', 'count', 'n', 'pl', { n: 2 }), 'столови'), 'counted');
  assert.equal(err(N('mk', 'chair', 'pl', ''), 'стола'), 'plural');
  assert.equal(err(N('mk', 'sister', 'own', 0), 'мојата сестра'), 'ownership');
  assert.equal(err(N('mk', 'friend', 'own', 0, 'pl'), 'пријатели ми'), 'ownership');
  assert.equal(err(N('mk', 'phone', 'own', 0), 'твојот телефон'), 'possessive');
  assert.equal(err(N('mk', 'phone', 'own', 0), 'мојата телефон'), 'agreement');
  assert.equal(err(N('mk', 'book', 'art', 'def'), 'knigata'), 'script');          // right word, Latin letters
});

test('pool, twins and skills', () => {
  const pool = buildNounPool({ langs: ['sr', 'mk'], nounKinds: ['case', 'art', 'count', 'own'] });
  assert.ok(pool.length > 3000);
  assert.ok(!pool.some(i => i.lang === 'sr' && i.kind === 'case' && i.detail === 'voc' && i.nounId === 'city'));
  assert.ok(!pool.some(i => i.lang === 'sr' && i.kind === 'count' && i.nounId === 'child'));
  const tw = nounTwin({ ...N('sr', 'parent', 'own', 0, 'pl') });
  assert.equal(first(tw), 'моите родители');
  assert.equal(first(nounTwin(N('mk', 'city', 'pl', '', 'pl'))), 'gradovi');
  assert.ok(nounSkills(N('sr', 'brother', 'case', 'vidim')).includes('nanim|sr|a'));
  assert.ok(nounSkills(N('sr', 'store', 'case', 'idem')).includes('nmot|sr|acc'));
});
