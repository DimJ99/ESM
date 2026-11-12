// Persistence (localStorage) and stats aggregation. Scheduling lives in srs.js.
import { buildPool, PERSON_LABELS } from './engine.js';
import { applyAnswer, rebuildSkills, summary, rollingAccuracy, fastEnough, attemptMod } from './srs.js';

const KEY = 'esm.v1';
const MAX_ATTEMPTS = 20000;

const DEFAULT_SETTINGS = {
  langs: ['sr', 'mk'],
  tenses: ['pres', 'past', 'fut'],
  polarity: ['pos', 'neg'],
  aspects: ['impf', 'pf'],
  lenient: true,
  srFutDa: false,
  includeNeuter: false,
  module: 'verbs',
  nounKinds: ['case', 'art', 'count', 'own'],
  pronKinds: ['drill', 'form', 'poss'],
  adjKinds: ['agree', 'poss3', 'cmp', 'art', 'indef'],
};

// Compact storage form of a prompt, shared by practice history and checkpoint misses.
export function encodeItem(item) {
  if (item.mod === 'noun') return { mod: 'n', l: item.lang, nn: item.nounId, k: item.kind, d: item.detail, nu: item.num, ...(item.n && { c: item.n }) };
  if (item.mod === 'conn') return { mod: 'c', l: item.lang, cn: item.connId };
  if (item.mod === 'pron') return { mod: 'p', l: item.lang, k: item.kind, pi: item.pid, d: item.detail };
  if (item.mod === 'adj') return { mod: 'a', l: item.lang, ai: item.adjId, k: item.kind, d: item.detail, nu: item.num, ag: item.ag, nn: item.nounId };
  return { l: item.lang, v: item.verbId, te: item.tense, p: item.person, g: item.gender, n: item.neg ? 1 : 0, pf: item.aspect === 'pf' ? 1 : 0 };
}
export function decodeItem(a) {
  if (a.mod === 'n') return { mod: 'noun', lang: a.l, nounId: a.nn, kind: a.k, detail: a.d, num: a.nu, ...(a.c && { n: a.c }) };
  if (a.mod === 'c') return { mod: 'conn', lang: a.l, connId: a.cn };
  if (a.mod === 'p') return { mod: 'pron', lang: a.l, kind: a.k, pid: a.pi, detail: a.d };
  if (a.mod === 'a') return { mod: 'adj', lang: a.l, adjId: a.ai, kind: a.k, detail: a.d, num: a.nu, ag: a.ag, nounId: a.nn };
  return { lang: a.l, verbId: a.v, tense: a.te, person: a.p, gender: a.g ?? null, neg: !!a.n, aspect: a.pf ? 'pf' : 'impf' };
}

function blank() {
  return { attempts: [], skills: {}, checkpoints: [], sessionStart: Date.now(), settings: { ...DEFAULT_SETTINGS } };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return upgrade(JSON.parse(raw));
  } catch {
    return blank();
  }
}

// Older saves tracked whole prompts (boxes / cards). Skills are rebuilt by replaying the history.
function upgrade(data) {
  const { boxes, cards, ...rest } = data;
  const state = { ...blank(), ...rest, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
  state.skills = data.skills || rebuildSkills(state.attempts);
  return state;
}

export function save(state) {
  try {
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts = state.attempts.slice(-MAX_ATTEMPTS);
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage full or blocked — the session still works */ }
}

// ms: how long the answer took, from the card appearing to pressing Check.
export function record(state, item, outcome, answer, hinted, ms = null) {
  const grades = applyAnswer(state, item, outcome, answer, hinted, Date.now(), ms);
  const failed = Object.keys(grades).filter(k => grades[k] === 'again');

  state.attempts.push({
    t: Date.now(), ...encodeItem(item), ok: outcome.result === 'wrong' ? 0 : outcome.result === 'close' ? 2 : 1,
    e: outcome.error, a: answer.slice(0, 60), h: hinted ? 1 : 0, f: failed,
    ...(ms != null && { ms: Math.round(ms), fast: fastEnough(ms, outcome.expected || '') ? 1 : 0 }),
  });
  save(state);
  return failed;
}

// Checkpoints are kept apart from practice: they never touch attempts, skills or the session.
export function saveCheckpoint(state, summary) {
  state.checkpoints.push(summary);
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

// window: 'session' | number of days | 0 for all time; mod: 'verbs' / 'nouns' / 'connectors' (null = all)
export function stats(state, window, mod = null) {
  const now = Date.now();
  const inMod = a => !mod || attemptMod(a) === mod;
  const list = (window === 'session' ? sessionAttempts(state)
    : window ? state.attempts.filter(a => now - a.t < window * DAY) : state.attempts).filter(inMod);
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
    list,
    srs: summary(state, now, mod),
    rolling: rollingAccuracy(state, 30, mod),
    speed: speedStats(list.filter(a => a.ok === 1 && a.ms != null)),
  };
}

// Fluency over correct answers: median time, and how many were fast enough to count toward mastery.
function speedStats(timed) {
  if (!timed.length) return null;
  const ms = timed.map(a => a.ms).sort((a, b) => a - b);
  return { median: ms[Math.floor(ms.length / 2)], fast: timed.filter(a => a.fast).length / timed.length, n: timed.length };
}

function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7); // back to Monday
  return d.getTime();
}

// This week (since Monday) against the average of earlier weeks you practised in.
export function weekly(state, mod = null) {
  const thisWeek = weekStart(Date.now());
  const weeks = new Map();
  for (const a of state.attempts) {
    if (mod && attemptMod(a) !== mod) continue;
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
  return upgrade({ attempts: data.attempts, skills: data.skills, checkpoints: data.checkpoints || [], sessionStart: data.sessionStart || Date.now(), settings: data.settings });
}

export function reset() {
  const s = blank();
  save(s);
  return s;
}
