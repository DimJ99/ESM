// Weekly checkpoint: a fixed, evenly spread set of prompts. It ignores spacing
// history and never touches practice attempts, skills or the session.
import { buildPool } from './engine.js';

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
export function buildCheckpoint(settings, n = CHECKPOINT_SIZE) {
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
  return {
    t: now,
    n: results.length,
    ok: results.filter(r => r.ok).length,
    byTense: by(r => r.item.tense),
    byLang: by(r => r.item.lang),
    errors,
  };
}
