import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekly, stats, sessionAttempts } from '../js/store.js';

const DAY = 86400000;
const att = (daysAgo, ok, te = 'pres') => ({ t: Date.now() - daysAgo * DAY, l: 'sr', v: 'read', te, p: 0, ok });

test('weekly compares this week to earlier active weeks', () => {
  const now = new Date();
  const sinceMonday = (now.getDay() + 6) % 7; // days since Monday
  const state = { boxes: {}, settings: {}, attempts: [
    att(sinceMonday + 8, 1), att(sinceMonday + 8, 0),                    // a past week: 2 answers, 50%
    att(sinceMonday + 15, 1), att(sinceMonday + 15, 1), att(sinceMonday + 15, 1), att(sinceMonday + 15, 1), // 4 answers, 100%
    att(0, 1), att(0, 1), att(0, 0),                                     // this week: 3 answers, 67%
  ] };
  const w = weekly(state);
  assert.equal(w.weeks, 2);
  assert.equal(w.cur.n, 3);
  assert.equal(w.avg.n, 3);
  assert.equal(w.avg.acc, 0.75);
  assert.ok(Math.abs(w.cur.acc - 2 / 3) < 1e-9);
});

test('session window only counts answers since the session started', () => {
  const state = { boxes: {}, settings: { langs: [], tenses: [], polarity: [] }, sessionStart: Date.now() - 1000,
    attempts: [att(2, 0), att(0, 1)] };
  assert.equal(sessionAttempts(state).length, 1);
  assert.equal(stats(state, 'session').total, 1);
  assert.equal(stats(state, 0).total, 2);
});
