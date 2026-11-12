// Weekly checkpoint: a fixed, evenly spread set of prompts. It ignores spacing
// history and never touches practice attempts, skills or the session.
import { buildPool } from './engine.js';
import { buildNounPool, withNumber } from './nounEngine.js';
import { buildConnPool, CONNECTOR_BY_ID } from './connEngine.js';
import { buildPronPool, pronGroup } from './pronEngine.js';
import { buildAdjPool, withNoun } from './adjEngine.js';
import { encodeItem } from './store.js';

export const CHECKPOINT_SIZE = 30;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Reorder so neighbours differ in tense (and polarity) wherever possible.
function interleave(items) {
  const left = [...items], out = [];
  while (left.length) {
    const last = out[out.length - 1];
    let i = left.findIndex(it => !last || (it.tense !== last.tense && it.neg !== last.neg));
    if (i < 0) i = left.findIndex(it => it.tense !== last.tense);
    if (i < 0) i = 0;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

// Balanced by tense first, then rotating through the (language, polarity, aspect)
// groups within each tense and through the persons, with each verb used once
// where the pool allows.
// What a checkpoint breaks its score down by: tense for verbs, construction for nouns,
// group for connectors.
export const breakdownKey = item => item.mod === 'noun' ? item.kind : item.mod === 'conn' ? CONNECTOR_BY_ID[item.connId].group
  : item.mod === 'pron' ? pronGroup(item) : item.mod === 'adj' ? item.kind : item.tense;

// Nouns and connectors: balanced over constructions (or groups), then their variants,
// each word used once where the pool allows.
function balanced(pool, topKey, subKey, idKey, n) {
  const tops = new Map();
  for (const it of pool) {
    const t = topKey(it), s = subKey(it);
    if (!tops.has(t)) tops.set(t, new Map());
    if (!tops.get(t).has(s)) tops.get(t).set(s, []);
    tops.get(t).get(s).push(it);
  }
  const order = shuffle([...tops.keys()]);
  if (!order.length) return [];
  const turns = new Map(order.map(t => [t, { keys: shuffle([...tops.get(t).keys()]), i: 0 }]));
  const used = new Set(), out = [];
  const fresh = list => list.filter(it => !used.has(idKey(it)));
  let live = [...order];   // groups that still have unused words
  for (let round = 0; out.length < n; round++) {
    if (!live.length) live = [...order];   // everything used once: allow repeats
    const t = live[round % live.length], turn = turns.get(t);
    const subs = turn.keys.map((_, j) => tops.get(t).get(turn.keys[(turn.i + j) % turn.keys.length]));
    turn.i++;
    const list = subs.find(l => fresh(l).length);
    if (!list) {
      if (live.length === order.length && order.every(o => [...tops.get(o).values()].every(l => !fresh(l).length))) {
        const any = tops.get(t).get(turn.keys[turn.i % turn.keys.length]);
        const pick = shuffle([...any])[0];
        out.push(pick);
        continue;
      }
      live = live.filter(x => x !== t);
      continue;
    }
    const pick = shuffle(fresh(list))[0];
    used.add(idKey(pick));
    out.push(pick);
  }
  return out;
}

export function buildCheckpoint(settings, n = CHECKPOINT_SIZE) {
  if (settings.module === 'nouns') {
    return balanced(buildNounPool(settings), it => it.kind, it => `${it.lang}|${it.detail}|${it.num}`, it => it.lang + it.nounId, n).map(withNumber);
  }
  if (settings.module === 'adjectives') {
    return balanced(buildAdjPool(settings), it => it.kind, it => `${it.lang}|${it.detail}|${it.num}|${it.ag}`, it => `${it.lang}|${it.adjId}`, n).map(it => withNoun(it));
  }
  if (settings.module === 'pronouns') {
    return balanced(buildPronPool(settings), pronGroup, it => `${it.lang}|${it.detail}`, it => `${it.lang}|${it.pid}|${it.detail}`, n);
  }
  if (settings.module === 'connectors') {
    return balanced(buildConnPool(settings), it => CONNECTOR_BY_ID[it.connId].group, it => it.lang, it => it.lang + it.connId, n);
  }
  const byTense = new Map();
  for (const it of buildPool(settings)) {
    if (!byTense.has(it.tense)) byTense.set(it.tense, new Map());
    const groups = byTense.get(it.tense), k = `${it.lang}|${it.neg}|${it.aspect}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const tenses = shuffle([...byTense.keys()]);
  if (!tenses.length) return [];
  const turns = new Map(tenses.map(t => [t, { keys: shuffle([...byTense.get(t).keys()]), i: 0 }]));
  const used = new Set(), out = [];
  let person = Math.floor(Math.random() * 6);
  for (let round = 0; out.length < n; round++) {
    const t = tenses[round % tenses.length], turn = turns.get(t);
    const list = byTense.get(t).get(turn.keys[turn.i++ % turn.keys.length]);
    const p = person++ % 6;
    const fresh = list.filter(it => !used.has(it.lang + it.verbId));
    const pick = shuffle(fresh.filter(it => it.person === p))[0] || shuffle(fresh)[0] || shuffle([...list])[0];
    used.add(pick.lang + pick.verbId);
    out.push(pick);
  }
  return interleave(out);
}

// results: [{ item, ok, error, hinted, answer, expected }]
export function summarize(results, now = Date.now()) {
  const by = keyFn => results.reduce((m, r) => {
    const k = keyFn(r);
    m[k] ??= { n: 0, ok: 0 };
    m[k].n++;
    if (r.ok) m[k].ok++;
    return m;
  }, {});
  const errors = {};
  for (const r of results) if (!r.ok) {
    const e = r.hinted && !r.error ? 'hint' : r.error || 'other';
    errors[e] = (errors[e] || 0) + 1;
  }
  const times = results.filter(r => r.ms != null).map(r => r.ms).sort((a, b) => a - b);
  return {
    t: now,
    n: results.length,
    ok: results.filter(r => r.ok).length,
    byTense: by(r => r.item.tense),
    byKind: by(r => breakdownKey(r.item)),
    byLang: by(r => r.item.lang),
    errors,
    medianMs: times.length ? Math.round(times[Math.floor(times.length / 2)]) : null,
    // kept so checkpoints can be exported and reviewed later
    misses: results.filter(r => !r.ok).map(({ item, answer, expected, error, hinted }) => ({
      ...encodeItem(item), a: answer, x: expected, e: error, h: hinted ? 1 : 0,
    })),
  };
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// One row per checkpoint. describe(miss) turns a stored miss into a readable prompt.
export function toCSV(checkpoints, langOf, describe) {
  const tenses = ['pres', 'past', 'fut'];
  const head = ['date', 'language', 'module', 'score', 'total', 'percent', 'median_seconds',
    ...tenses.map(t => `${t}_percent`), 'breakdown', 'mistakes', 'misses'];
  const rows = checkpoints.map(c => [
    new Date(c.t).toISOString().slice(0, 16).replace('T', ' '),
    langOf(c),
    c.mod || 'verbs',
    c.ok, c.n, Math.round(100 * c.ok / c.n),
    c.medianMs != null ? (c.medianMs / 1000).toFixed(1) : '',
    ...tenses.map(t => c.byTense[t] ? Math.round(100 * c.byTense[t].ok / c.byTense[t].n) : ''),
    Object.entries(c.byKind || {}).map(([k, v]) => `${k} ${Math.round(100 * v.ok / v.n)}%`).join('; '),
    Object.entries(c.errors).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} ${n}`).join('; '),
    (c.misses || []).map(m => `${describe(m)}: ${m.a || '(blank)'} → ${m.x}`).join(' | '),
  ]);
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}
