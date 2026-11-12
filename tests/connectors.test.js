import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTORS, checkConn, buildConnPool, connTwin } from '../js/connEngine.js';

const C = (lang, connId) => ({ mod: 'conn', lang, connId });
const run = (it, a) => checkConn(it, a, { lenient: true });

test('connector data', () => {
  for (const c of CONNECTORS) for (const l of ['sr', 'mk']) assert.match(c[l].frame, /___/, `${c.id} ${l}`);
  assert.equal(buildConnPool({ langs: ['sr', 'mk'] }).length, CONNECTORS.length * 2);
});

test('connectors: answers, full sentences, bleed', () => {
  assert.equal(run(C('sr', 'but'), 'ali').result, 'correct');
  assert.equal(run(C('mk', 'but'), 'ама').result, 'correct');
  assert.equal(run(C('sr', 'because'), 'zato što').result, 'correct');
  assert.equal(run(C('sr', 'then'), 'Prvo jedem, onda učim.').result, 'correct');   // whole sentence typed
  assert.equal(run(C('mk', 'but'), 'али').error, 'bleed');
  assert.equal(run(C('mk', 'because'), 'jer').error, 'bleed');
  assert.equal(run(C('mk', 'that'), 'да').error, 'connector');                     // да is a real MK connector, wrong here
  assert.equal(run(C('sr', 'because'), 'zato').error, 'connector');
  assert.equal(connTwin(C('sr', 'but')).lang, 'mk');
});
