// Persistence (localStorage), spaced-repetition boxes and stats aggregation.
import { itemKey, buildPool, PERSON_LABELS } from './engine.js';

const KEY = 'esm.v1';
const MAX_ATTEMPTS = 20000;

const DEFAULT_SETTINGS = {
  langs: ['sr', 'mk'],
  tenses: ['pres', 'past', 'fut'],
  polarity: ['pos', 'neg'],
  aspects: ['impf', 'pf'],
  lenient: true,
  includeNeuter: false,
};

function blank() {
  return { attempts: [], boxes: {}, sessionStart: Date.now(), settings: { ...DEFAULT_SETTINGS } };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    return { ...blank(), ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
  } catch {
    return blank();
  }
}

export function save(state) {
  try {
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts = state.attempts.slice(-MAX_ATTEMPTS);
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage full or blocked — the session still works */ }
}

// Box 0 = recently missed … box 5 = solid. Unseen items sit between.
const WEIGHTS = [10, 5, 3, 1.5, 0.7, 0.3];
const UNSEEN_WEIGHT = 3;

export function record(state, item, outcome, answer, hinted) {
  const key = itemKey(item);
  const box = state.boxes[key];
  if (outcome.result === 'wrong') state.boxes[key] = 0;
  else if (outcome.result === 'correct' && !hinted) state.boxes[key] = Math.min(5, (box ?? 0) + 1);
  else state.boxes[key] = box ?? 0;

  state.attempts.push({
    t: Date.now(), l: item.lang, v: item.verbId, te: item.tense, p: item.person,
    g: item.gender, n: item.neg ? 1 : 0, pf: item.aspect === 'pf' ? 1 : 0, ok: outcome.result === 'wrong' ? 0 : outcome.result === 'close' ? 2 : 1,
    e: outcome.error, a: answer.slice(0, 60), h: hinted ? 1 : 0,
  });
  save(state);
}

// A session is just a start time — starting a new one never deletes data.
export function newSession(state) {
  state.sessionStart = Date.now();
  save(state);
}

export function sessionAttempts(state) {
  return state.attempts.filter(a => a.t >= state.sessionStart);
}

export function pickNext(state, last) {
  const pool = buildPool(state.settings);
  if (!pool.length) return null;
  const weights = pool.map(it => {
    const box = state.boxes[itemKey(it)];
    const w = box === undefined ? UNSEEN_WEIGHT : WEIGHTS[box];
    return last && it.verbId === last.verbId ? w * 0.05 : w;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const DAY = 86400000;
const dayKey = t => new Date(t).toDateString();

function tally(list, keyFn) {
  const m = new Map();
  for (const a of list) {
    const k = keyFn(a);
    const s = m.get(k) || { n: 0, ok: 0 };
    s.n++;
    if (a.ok) s.ok++;
    m.set(k, s);
  }
  return m;
}

// window: 'session' | number of days | 0 for all time
export function stats(state, window) {
  const now = Date.now();
  const list = window === 'session' ? sessionAttempts(state)
    : window ? state.attempts.filter(a => now - a.t < window * DAY) : state.attempts;
  const correct = list.filter(a => a.ok).length;

  const days = new Set(state.attempts.map(a => dayKey(a.t)));
  let streak = 0;
  for (let t = now; days.has(dayKey(t)); t -= DAY) streak++;
  if (!streak && days.has(dayKey(now - DAY))) // today not started yet — keep yesterday's streak alive
    for (let t = now - DAY; days.has(dayKey(t)); t -= DAY) streak++;

  const errors = new Map();
  for (const a of list) if (a.e && a.ok !== 1) errors.set(a.e, (errors.get(a.e) || 0) + 1);

  const verbs = [...tally(list, a => a.v)]
    .filter(([, s]) => s.n >= 3)
    .map(([v, s]) => ({ v, ...s, acc: s.ok / s.n }))
    .sort((a, b) => a.acc - b.acc || b.n - a.n);

  const boxes = [0, 0, 0, 0, 0, 0];
  for (const b of Object.values(state.boxes)) boxes[b]++;

  return {
    total: list.length,
    acc: list.length ? correct / list.length : null,
    today: state.attempts.filter(a => dayKey(a.t) === dayKey(now)).length,
    streak,
    errors: [...errors].sort((a, b) => b[1] - a[1]),
    byTense: tally(list, a => `${a.l}|${a.te}`),
    byPerson: tally(list, a => PERSON_LABELS[a.p]),
    byLang: tally(list, a => a.l),
    byPolarity: tally(list, a => a.n ? 'neg' : 'pos'),
    // aspect is only drilled in past & future
    byAspect: tally(list.filter(a => a.te !== 'pres'), a => a.pf ? 'pf' : 'impf'),
    weakVerbs: verbs.slice(0, 8),
    mistakes: list.filter(a => !a.ok).slice(-15).reverse(),
    boxes,
    seen: Object.keys(state.boxes).length,
    poolSize: buildPool(state.settings).length,
  };
}

function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7); // back to Monday
  return d.getTime();
}

// This week (since Monday) against the average of earlier weeks you practised in.
export function weekly(state) {
  const thisWeek = weekStart(Date.now());
  const weeks = new Map();
  for (const a of state.attempts) {
    const w = weekStart(a.t);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(a);
  }
  const cur = weeks.get(thisWeek) || [];
  const past = [...weeks].filter(([w]) => w < thisWeek).map(([, l]) => l);
  const acc = l => l.length ? l.filter(a => a.ok).length / l.length : null;
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const tenses = ['pres', 'past', 'fut'];
  return {
    weeks: past.length,
    cur: { n: cur.length, acc: acc(cur) },
    avg: { n: mean(past.map(l => l.length)), acc: mean(past.map(acc)) },
    byTense: tenses.map(t => ({
      t,
      cur: acc(cur.filter(a => a.te === t)),
      avg: acc(past.flat().filter(a => a.te === t)),
    })),
  };
}

export function exportData(state) {
  return JSON.stringify({ app: 'esm', version: 1, exported: new Date().toISOString(), ...state });
}

export function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== 'esm' || !Array.isArray(data.attempts)) throw new Error('Not an ESM backup file');
  return { attempts: data.attempts, boxes: data.boxes || {}, sessionStart: data.sessionStart || Date.now(), settings: { ...DEFAULT_SETTINGS, ...data.settings } };
}

export function reset() {
  const s = blank();
  save(s);
  return s;
}
