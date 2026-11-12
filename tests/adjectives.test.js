import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJECTIVES } from '../js/adjectives.js';
import { adjForms, checkAdj, buildAdjPool, adjTwin, adjSkills, nounsFor, withNoun } from '../js/adjEngine.js';

const A = (lang, adjId, kind, detail, num, nounId) => ({ mod: 'adj', lang, adjId, kind, detail, num, nounId });
const first = it => adjForms(it)[0];
const err = (it, a) => checkAdj(it, a, { lenient: true }).error;
const ok = (it, a) => assert.equal(checkAdj(it, a, { lenient: true }).result, 'correct', a);

test('adjective data', () => {
  for (const a of ADJECTIVES) {
    for (const k of ['m', 'f', 'n', 'plM', 'plF', 'plN']) assert.equal(a.sr[k].split(' ').length, 7, `${a.id} sr.${k}`);
    assert.equal(a.mk.forms.split(' ').length, 4, a.id);
    if (a.mk.def) assert.equal(a.mk.def.split(' ').length, 4, a.id);
  }
});

test('Serbian agreement', () => {
  assert.equal(first(A('sr', 'new', 'agree', 'idem', 'sg', 'store')), 'novu prodavnicu');
  assert.equal(first(A('sr', 'new', 'agree', 'u', 'sg', 'store')), 'novoj prodavnici');
  assert.equal(first(A('sr', 'new', 'agree', 'vidim', 'sg', 'professor')), 'novog profesora');     // animate
  assert.deepEqual(adjForms(A('sr', 'new', 'agree', 'vidim', 'sg', 'city')), ['nov grad', 'novi grad']);
  assert.equal(first(A('sr', 'good', 'agree', 'sa', 'pl', 'friend')), 'dobrim prijateljima');
  assert.equal(first(A('sr', 'bad', 'agree', 'o', 'sg', 'problem')), 'lošem problemu');            // soft stem
  assert.equal(first(A('sr', 'new', 'poss3', 0, 'sg', 'store')), 'moja nova prodavnica');
  assert.equal(first(A('sr', 'good', 'poss3', 0, 'pl', 'brother')), 'moja dobra braća');
  assert.equal(first(A('sr', 'big', 'cmp', '', 'sg', 'house')), 'veća kuća');
  ok(A('sr', 'new', 'agree', 'idem', 'sg', 'store'), 'idem u novu prodavnicu');
});

test('Macedonian article on the first word', () => {
  assert.equal(first(A('mk', 'new', 'art', '', 'sg', 'computer')), 'новиот компјутер');
  assert.equal(first(A('mk', 'new', 'art', '', 'pl', 'computer')), 'новите компјутери');
  assert.equal(first(A('mk', 'new', 'poss3', 0, 'sg', 'computer')), 'мојот нов компјутер');
  assert.equal(first(A('mk', 'new', 'indef', '', 'sg', 'house')), 'нова куќа');
  ok(A('mk', 'big', 'cmp', '', 'sg', 'house'), 'по-голема куќа');
  ok(A('mk', 'big', 'cmp', '', 'sg', 'house'), 'поголема куќа');
});

test('decodes adjective mistakes', () => {
  assert.equal(err(A('sr', 'new', 'agree', 'idem', 'sg', 'store'), 'nova prodavnicu'), 'adjagree');
  assert.equal(err(A('sr', 'new', 'agree', 'idem', 'sg', 'store'), 'novu prodavnica'), 'nounform');
  assert.equal(err(A('sr', 'new', 'agree', 'idem', 'sg', 'store'), 'nova prodavnica'), 'case');
  assert.equal(err(A('sr', 'new', 'agree', 'vidim', 'sg', 'professor'), 'novi profesora'), 'animacy');
  assert.equal(err(A('sr', 'new', 'poss3', 0, 'sg', 'store'), 'tvoja nova prodavnica'), 'possessive');
  assert.equal(err(A('sr', 'big', 'cmp', '', 'sg', 'house'), 'velika kuća'), 'comparative');
  assert.equal(err(A('mk', 'new', 'art', '', 'sg', 'computer'), 'нов компјутерот'), 'artplace');
  assert.equal(err(A('mk', 'new', 'art', '', 'sg', 'computer'), 'нов компјутер'), 'article');
  assert.equal(err(A('mk', 'new', 'art', '', 'sg', 'computer'), 'новата компјутер'), 'adjagree');
  assert.equal(err(A('mk', 'new', 'poss3', 0, 'sg', 'computer'), 'мојот новиот компјутер'), 'artplace');
  assert.equal(err(A('mk', 'new', 'poss3', 0, 'sg', 'computer'), 'мој нов компјутер'), 'article');
  assert.equal(err(A('mk', 'new', 'poss3', 0, 'sg', 'computer'), 'твојот нов компјутер'), 'possessive');
  assert.equal(err(A('mk', 'big', 'cmp', '', 'sg', 'house'), 'голема куќа'), 'comparative');
  assert.equal(err(A('sr', 'new', 'agree', 'nom', 'sg', 'computer'), 'нов računar'), 'script');      // same word, Cyrillic
  assert.equal(err(A('sr', 'new', 'agree', 'nom', 'sg', 'computer'), 'nov компјутер'), 'bleed');    // the MK noun
});

test('pool, nouns, twins', () => {
  const pool = buildAdjPool({ langs: ['sr', 'mk'] });
  assert.ok(pool.length > 1000);
  assert.ok(!pool.some(i => i.adjId === 'every' && i.kind === 'poss3'));
  assert.ok(!pool.some(i => i.lang === 'mk' && i.adjId === 'every' && i.kind === 'art'));
  assert.ok(!nounsFor(A('sr', 'hungry', 'agree', 'nom', 'sg')).some(n => n.id === 'table'));
  assert.ok(nounsFor(A('sr', 'hungry', 'agree', 'nom', 'sg')).some(n => n.id === 'dog'));
  assert.ok(!nounsFor(A('sr', 'tall', 'agree', 'nom', 'sg')).some(n => n.id === 'idea'));
  assert.ok(!nounsFor(A('mk', 'correct', 'indef', '', 'sg')).some(n => n.id === 'beer'));
  // every adjective still has nouns to pair with in both languages
  for (const a of ['sr', 'mk']) for (const id of ['new', 'correct', 'free', 'every', 'blue'])
    assert.ok(nounsFor(A(a, id, a === 'sr' ? 'agree' : 'indef', a === 'sr' ? 'nom' : '', 'sg')).length > 3, `${a} ${id}`);
  const it = withNoun(A('mk', 'new', 'poss3', 0, 'pl'), true);
  const tw = adjTwin(it);
  assert.equal(tw.lang, 'sr');
  assert.equal(tw.nounId, it.nounId);
  assert.ok(adjSkills(A('sr', 'new', 'agree', 'vidim', 'sg', 'professor')).includes('aanim|sr|m'));
});

test('pool items carry an agreement class, and the noun matches it', () => {
  const pool = buildAdjPool({ langs: ['sr'], adjKinds: ['agree'] });
  const it = pool.find(i => i.adjId === 'new' && i.detail === 'vidim' && i.num === 'sg' && i.ag === 'm*');
  assert.ok(it, 'animate masculine accusative class exists');
  for (let k = 0; k < 20; k++) {
    const w = withNoun(it);
    assert.ok(adjForms(w)[0].startsWith('novog '), adjForms(w)[0]);
  }
  assert.ok(adjSkills(it).includes('aanim|sr|m'));
});
