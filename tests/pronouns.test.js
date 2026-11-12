import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAL, POSSESSIVE, DRILLS } from '../js/pronouns.js';
import { pronForms, checkPron, buildPronPool, pronTwin, pronSkills } from '../js/pronEngine.js';

const P = (lang, kind, pid, detail = '') => ({ mod: 'pron', lang, kind, pid, detail });
const run = (it, a) => checkPron(it, a, { lenient: true });
const err = (it, a) => run(it, a).error;

test('pronoun data', () => {
  for (const p of PERSONAL) for (const k of ['long', 'short']) assert.equal(p.sr[k].split(' ').length, 7, `${p.id} sr.${k}`);
  for (const p of POSSESSIVE) {
    assert.equal(p.sr.split(' ').length, 6, p.id);
    assert.equal(p.mk.forms.split(' ').length, 4, p.id);
    assert.equal(p.mk.def.split(' ').length, 4, p.id);
  }
  for (const d of DRILLS) for (const l of ['sr', 'mk']) if (d[l]) assert.match(d[l].frame, /___/, `${d.id} ${l}`);
});

test('forms', () => {
  assert.deepEqual(pronForms(P('sr', 'form', '3m', '2s')), ['mu']);
  assert.deepEqual(pronForms(P('sr', 'form', '3m', '2l')), ['njemu']);
  assert.deepEqual(pronForms(P('sr', 'form', '1sg', '5l')), ['mnom', 'mnome']);
  assert.deepEqual(pronForms(P('sr', 'form', '3f', '3s')), ['je', 'ju']);
  assert.deepEqual(pronForms(P('mk', 'form', '3f', 'accS')), ['ја']);
  assert.deepEqual(pronForms(P('mk', 'form', '1pl', 'accS')), ['нѐ', 'не']);
  assert.deepEqual(pronForms(P('sr', 'poss', 'her', 1)), ['njena', 'njezina']);
  assert.deepEqual(pronForms(P('mk', 'poss', 'my', 'd1')), ['мојата']);
  assert.deepEqual(pronForms(P('mk', 'poss', 'his', 'k')), ['му']);
  assert.equal(run(P('sr', 'drill', 'see-him'), 'Vidim ga.').result, 'correct');     // whole sentence typed
  assert.equal(run(P('mk', 'drill', 'gave-it-her'), 'и го').result, 'correct');
});

test('decodes pronoun mistakes', () => {
  assert.equal(err(P('sr', 'form', '3m', '2s'), 'njemu'), 'longshort');
  assert.equal(err(P('sr', 'form', '3m', '2s'), 'ga'), 'case');
  assert.equal(err(P('sr', 'form', '3m', '2s'), 'joj'), 'person');
  assert.equal(err(P('sr', 'drill', 'see-him'), 'njega'), 'longshort');
  assert.equal(err(P('sr', 'drill', 'gave-it-her'), 'ga joj'), 'order');
  assert.equal(err(P('sr', 'drill', 'know-her'), 'ја'), 'bleed');
  assert.equal(err(P('mk', 'drill', 'know-her'), 'je'), 'bleed');
  assert.equal(err(P('mk', 'drill', 'that-x'.replace('that-x', 'see-him')), 'ме'), 'pronoun');
  assert.equal(err(P('sr', 'poss', 'my', 1), 'moj'), 'agreement');
  assert.equal(err(P('sr', 'poss', 'my', 1), 'tvoja'), 'possessive');
  assert.equal(err(P('mk', 'poss', 'my', 'd1'), 'моја'), 'article');
  assert.equal(err(P('mk', 'poss', 'my', 'k'), 'мојата'), 'ownership');
});

test('pool, twins, skills', () => {
  const pool = buildPronPool({ langs: ['sr', 'mk'], pronKinds: ['drill', 'form', 'poss'] });
  assert.ok(!pool.some(i => i.lang === 'sr' && i.kind === 'drill' && i.pid === 'saw-marko'));   // MK-only drill
  assert.ok(pool.some(i => i.lang === 'mk' && i.kind === 'drill' && i.pid === 'saw-marko'));
  assert.deepEqual(pronForms(pronTwin(P('sr', 'form', '3m', '3s'))), ['го']);
  assert.deepEqual(pronForms(pronTwin(P('mk', 'form', '3m', 'dat'))), ['njemu']);
  assert.deepEqual(pronForms(pronTwin(P('sr', 'poss', 'my', 3))), ['моите']);
  assert.equal(pronTwin(P('sr', 'form', '3m', '5l')), null);
  assert.deepEqual(pronSkills(P('sr', 'form', '3m', '2s')), ['pcase|sr|c2|short', 'pper|sr|3m']);
});
