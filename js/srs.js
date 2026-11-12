// Skill-based spaced repetition.
//
// Every prompt exercises a handful of skills — the ending for that tense/person
// (per verb class), past-tense gender agreement, forming the tense, negation, the
// aspect choice for a verb pair, and the verb's own stem. Each skill has its own
// interval (1 → 3 → 7 → 16 days, then ×2.3). A wrong answer only fails the skill the
// mistake points at; everything else in that answer counts as a success.
//
// Prompts are built around the weakest due skill, on a verb not seen recently, with
// the other slots filled by skills that are already known — one shaky thing at a time.
import { VERB_BY_ID, LANGS, TENSES, GENDERS, buildPool, formsFor, hintFor, itemKey } from './engine.js';
import { NOUN_BY_ID, buildNounPool, nounSkills, nounForms, NOUN_BLAME, nounNumberBlame, nounSkillName, NOUN_SKILL_KINDS } from './nounEngine.js';
import { CONNECTOR_BY_ID, buildConnPool, connSkills, connForms, connSkillName, CONN_SKILL_KINDS } from './connEngine.js';
import { buildPronPool, pronSkills, pronForms, pronBlame, pronSkillName, pronWordKind, PRON_SKILL_KINDS } from './pronEngine.js';
import { ADJ_BY_ID, buildAdjPool, adjSkills, adjForms, adjBlame, adjSkillName, ADJ_SKILL_KINDS } from './adjEngine.js';

// Practice modules. Items carry mod: undefined (verbs), 'noun' or 'conn'.
export const MODULES = { verbs: 'Verbs', nouns: 'Nouns', adjectives: 'Adjectives', pronouns: 'Pronouns', connectors: 'Connectors' };
export const modOf = item => ({ noun: 'nouns', conn: 'connectors', pron: 'pronouns', adj: 'adjectives' })[item.mod] || 'verbs';
export const attemptMod = a => ({ n: 'nouns', c: 'connectors', p: 'pronouns', a: 'adjectives' })[a.mod] || 'verbs';
const stemKind = item => item.mod === 'noun' ? 'nstem' : item.mod === 'conn' ? 'conn' : item.mod === 'pron' ? pronWordKind(item)
  : item.mod === 'adj' ? 'astem' : 'stem';
// The word an item is about, so it isn't repeated back to back.
const wordId = x => x && (x.verbId || x.adjId || x.nounId || x.connId || x.pid);
const WORD_KINDS = ['nstem', 'npl', 'conn', 'pper', 'pposs', 'pdw', 'astem'];

export const DAY = 86400000;
export const MASTERED_DAYS = 21;
export const LEECH_LAPSES = 4;
export const TARGET = [0.7, 0.85];
const STEPS = [1, 3, 7, 16];
const COOLDOWN = 4;          // the same prompt can't come back within this many cards
const ROLLING = 30;          // answers used for the accuracy that paces new material

// ---------- intervals ----------

export function nextInterval(iv) {
  const step = STEPS.find(s => s > iv);
  return step ?? Math.round(iv * 2.3);
}

const dayOf = t => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);

// Fluency: an answer counts as fast if it comes within ~3 s plus typing time.
export const fastEnough = (ms, expected) => ms == null || ms <= 3000 + 300 * expected.length;

// grade: 'good' | 'hard' (no growth) | 'again'. A miss keeps part of a long interval.
// Success only grows the interval once the skill is due — getting it right again an
// hour later isn't spaced practice. Misses count whenever they happen.
// A correct but slow answer can't push a skill into "mastered": that needs correct *and* fast.
export function schedule(skill, grade, now = Date.now(), fast = true) {
  const prev = skill || { iv: 0, reps: 0, lapses: 0, lapseDays: 0 };
  const s = { ...prev, reps: prev.reps + 1, last: now };
  if (grade === 'again') {
    s.lapses = prev.lapses + 1;
    if (prev.lapseDay !== dayOf(now)) s.lapseDays = (prev.lapseDays || 0) + 1;
    s.lapseDay = dayOf(now);
    s.iv = prev.iv >= 7 ? Math.round(prev.iv / 3) : 0;
    s.due = now + s.iv * DAY;
  } else if (grade === 'good' && (!skill || prev.due <= now)) {
    s.iv = nextInterval(prev.iv);
    if (!fast) s.iv = Math.min(s.iv, Math.max(prev.iv, STEPS[STEPS.length - 1]));
    s.due = now + s.iv * DAY;
  }
  if (grade !== 'again') s.slow = !fast;
  return s;
}

// Failed often, and across more than one day — a cram session alone doesn't make a leech.
export const isLeech = sk => sk.lapses >= LEECH_LAPSES && (sk.lapseDays || 0) >= 2;

// ---------- skills ----------

const words = s => s.split(' ');

// Conjugation class — the ending pattern a verb follows in this tense.
function verbClass(verb, lang, aspect, tense) {
  if (lang === 'sr') {
    if (tense !== 'pres') return '*';       // past = auxiliary + participle, future = -ću: same for every verb
    const sr = aspect === 'pf' ? verb.sr.pf : verb.sr;
    const [s1, s2] = words(sr.pres);
    const end = s1.slice(-2);
    return ({ am: 'aš', im: 'iš', em: 'eš' }[end] === s2.slice(-2)) ? end : 'irr';
  }
  const mk = aspect === 'pf' ? verb.mk.pf : verb.mk;
  if (tense === 'past') {
    const end = words(mk.past)[0].slice(-2);
    return ['ав', 'ев', 'ов', 'ив'].includes(end) ? end : 'в';
  }
  const end = words(mk.pres)[1].slice(-2);
  return ['аш', 'иш', 'еш'].includes(end) ? end : 'irr';
}

export function skillsOf(item) {
  if (item.mod === 'noun') return nounSkills(item);
  if (item.mod === 'conn') return connSkills(item);
  if (item.mod === 'pron') return pronSkills(item);
  if (item.mod === 'adj') return adjSkills(item);
  const verb = VERB_BY_ID[item.verbId];
  const { lang, tense, aspect } = item;
  const out = [
    `end|${lang}|${tense}|${aspect}|${item.person}|${verbClass(verb, lang, aspect, tense)}`,
    `tns|${lang}|${tense}`,
    `stem|${lang}|${item.verbId}|${aspect}`,
  ];
  if (item.gender) out.push(`agr|${lang}|${item.gender}|${item.person < 3 ? 'sg' : 'pl'}`);
  if (item.neg) out.push(`neg|${lang}|${tense}`);
  if (tense !== 'pres' && verb[lang].pf) out.push(`asp|${lang}|${item.verbId}`);
  return out;
}

const kind = key => key.split('|')[0];

// Which skill a decoded mistake points at.
const BLAME = {
  gender: 'agr', person: 'end', auxiliary: 'end', tense: 'tns', ke: 'tns',
  negation: 'neg', aspect: 'asp', verb: 'stem', diacritics: 'stem',
};
const BLEED = new Set(['bleed', 'language']);
// Bleed is tracked per word, but only once it has happened — no point scheduling a skill for every verb.
export const bleedKey = item => item.mod === 'noun' ? `bleed|${item.lang}|n:${item.nounId}`
  : item.mod === 'conn' ? `bleed|${item.lang}|c:${item.connId}`
  : item.mod === 'pron' ? `bleed|${item.lang}|p:${item.pid}`
  : item.mod === 'adj' ? `bleed|${item.lang}|a:${item.adjId}` : `bleed|${item.lang}|${item.verbId}`;

// Spelling slips: near the end of the word = the ending, earlier = the stem.
function spellingBlame(answer, expected) {
  const a = answer.trim().toLowerCase().split(' ').pop() || '';
  const e = expected.split(' ').pop();
  let i = 0;
  while (i < a.length && i < e.length && a[i] === e[i]) i++;
  return i >= e.length - 3 ? 'end' : 'stem';
}

// Per-skill grades for one answer. `target` is the skill the prompt was built around.
export function attribute(item, outcome, answer, hinted) {
  const skills = skillsOf(item);
  const grades = Object.fromEntries(skills.map(s => [s, 'good']));
  const set = (k, g) => skills.filter(s => kind(s) === k).forEach(s => { grades[s] = g; });
  const stem = stemKind(item);
  if (outcome.result === 'close') set(stem, 'hard');
  else if (outcome.result === 'wrong') {
    const err = outcome.error;
    let blame;
    if (item.mod === 'noun') {
      blame = err === 'number' ? nounNumberBlame(item) : NOUN_BLAME[err];
      if (err === 'spelling') blame = spellingBlame(answer, outcome.expected) === 'end' ? kind(skills[0]) : stem;
      if (blame && !skills.some(s => kind(s) === blame)) blame = kind(skills[0]);
    } else if (item.mod === 'adj') {
      blame = err === 'spelling' ? stem : adjBlame(item, err);
      if (blame && !skills.some(s => kind(s) === blame)) blame = kind(skills[0]);
    } else if (item.mod === 'pron') {
      blame = pronBlame(item, err);
      if (blame && !skills.some(s => kind(s) === blame)) blame = kind(skills[0]);
    } else if (item.mod === 'conn') {
      blame = err === 'connector' || err === 'spelling' || err === 'diacritics' ? 'conn' : null;
    } else {
      blame = BLAME[err];
      if (err === 'spelling') blame = spellingBlame(answer, outcome.expected);
    }
    if (BLEED.has(err)) grades[bleedKey(item)] = 'again';
    else if (err === 'script') set(stem, 'hard');   // right word, wrong alphabet: no grammar skill failed
    else if (blame) set(blame, 'again');
    else {
      // blank / unrecognizable: can't tell what failed — the target skill and the stem take it
      if (item.target && grades[item.target]) grades[item.target] = 'again';
      set(stem, 'again');
    }
  }
  if (hinted) skills.filter(s => kind(s) === stem && grades[s] === 'good').forEach(s => { grades[s] = 'hard'; });
  return grades;
}

// ms: time to answer (null when unknown, e.g. older saved answers).
export function applyAnswer(state, item, outcome, answer, hinted, now = Date.now(), ms = null) {
  const grades = attribute(item, outcome, answer, hinted);
  const bk = bleedKey(item);
  if (state.skills[bk] && !grades[bk] && outcome.result !== 'wrong') grades[bk] = 'good';
  const fast = fastEnough(ms, outcome.expected || '');
  for (const [key, g] of Object.entries(grades)) state.skills[key] = schedule(state.skills[key], g, now, fast);
  return grades;
}

// ---------- choosing the next prompt ----------

let poolCache = { sig: '', pool: [], bySkill: new Map() };
function indexedPool(settings) {
  const sig = JSON.stringify(settings);
  if (poolCache.sig !== sig) {
    const build = { nouns: buildNounPool, connectors: buildConnPool, pronouns: buildPronPool, adjectives: buildAdjPool }[settings.module] || buildPool;
    const pool = build(settings).map(it => ({ ...it, skills: skillsOf(it) }));
    const bySkill = new Map();
    for (const it of pool) for (const s of it.skills) {
      if (!bySkill.has(s)) bySkill.set(s, []);
      bySkill.get(s).push(it);
    }
    poolCache = { sig, pool, bySkill };
  }
  return poolCache;
}

// How familiar a skill is: known skills make good "filler" around the target.
function known(state, key) {
  const s = state.skills[key];
  if (!s) return 0.15;
  if (s.iv === 0) return 0.35;
  return Math.min(1, 0.6 + s.iv / 40);
}

function variety(it, recent) {
  let w = 1;
  const last = recent[recent.length - 1], prev = recent[recent.length - 2];
  if (it.mod) {
    // nouns / connectors: don't chain the same word, construction or case
    const id = wordId;
    if (last && last.mod === it.mod) {
      if (id(it) === id(last)) w *= 0.05;
      if (it.kind && it.kind === last.kind) w *= 0.35;
      if (it.kind && it.detail === last.detail) w *= 0.3;
      if (it.num && it.num === last.num) w *= 0.7;
      if (it.connId && CONNECTOR_BY_ID[it.connId].group === CONNECTOR_BY_ID[last.connId]?.group) w *= 0.4;
    }
    if (prev && prev.mod === it.mod && id(it) === id(prev)) w *= 0.2;
    return w;
  }
  if (last) {
    if (it.verbId === last.verbId) w *= 0.05;
    if (it.tense === last.tense) w *= 0.25;
    if (it.neg === last.neg) w *= 0.5;
    if (it.aspect === last.aspect) w *= 0.7;
    if (it.person === last.person) w *= 0.6;
  }
  if (prev) {
    if (it.verbId === prev.verbId) w *= 0.2;
    if (it.tense === prev.tense) w *= 0.7;
  }
  return w;
}

// The same idea for choosing the target skill: skills tied to the last prompt's
// tense or verb wait their turn, otherwise the prompts built around them would chain.
function skillVariety(key, recent) {
  const last = recent[recent.length - 1];
  if (!last) return 1;
  const [k, , a] = key.split('|');
  if (last.mod) {
    const id = wordId(last);
    let w = 1;
    if (WORD_KINDS.includes(k) && a === id) w *= 0.05;
    if (k === kind(last.target || '')) w *= 0.5;
    return w;
  }
  const tense = k === 'agr' ? 'past' : ['end', 'tns', 'neg'].includes(k) ? a : null;
  const verb = ['stem', 'asp'].includes(k) ? a : null;
  let w = 1;
  if (tense && tense === last.tense) w *= 0.15;
  if (verb && verb === last.verbId) w *= 0.05;
  if (k === kind(last.target || '')) w *= 0.5;
  return w;
}

function weighted(list, weightOf) {
  const ws = list.map(weightOf);
  const total = ws.reduce((a, b) => a + b, 0);
  if (!total) return list[Math.floor(Math.random() * list.length)];
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i];
  return list[list.length - 1];
}

export function rollingAccuracy(state, n = ROLLING, mod = null) {
  const last = (mod ? state.attempts.filter(a => attemptMod(a) === mod) : state.attempts).slice(-n);
  return last.length >= 10 ? last.filter(a => a.ok).length / last.length : null;
}

// How often to reach for a brand-new skill instead of a due one, steered by accuracy.
function newRate(acc) {
  if (acc === null) return 0.5;                 // just starting: build up a base
  if (acc < 0.65) return 0;                      // struggling: review only
  if (acc > 0.9) return 0.6;                     // cruising: bring in new material faster
  return 0.25;
}

// recent: prompts shown this run, oldest first. Returns an item with .target set.
export function pickNext(state, recent = [], now = Date.now()) {
  const { pool, bySkill } = indexedPool(state.settings);
  if (!pool.length) return null;
  const blocked = new Set(recent.slice(-COOLDOWN).map(itemKey));
  const recentTargets = new Set(recent.slice(-2).map(r => r.target));

  const skills = [...bySkill.keys(), ...Object.keys(state.skills).filter(k => kind(k) === 'bleed' && pool.some(it => bleedKey(it) === k))];
  const due = skills.filter(k => state.skills[k] && state.skills[k].due <= now);
  const fresh = skills.filter(k => !state.skills[k]);

  let target;
  const lastVerb = recent[recent.length - 1]?.verbId;
  const lastWord = wordId(recent[recent.length - 1]);
  const tiedToLastVerb = k => (['stem', 'asp'].includes(kind(k)) && k.split('|')[2] === lastVerb) ||
    (WORD_KINDS.includes(kind(k)) && k.split('|')[2] === lastWord);
  const wantNew = fresh.length && (!due.length || Math.random() < newRate(rollingAccuracy(state, ROLLING, state.settings.module || 'verbs')));
  if (!wantNew && due.length) {
    // weakest first (shortest interval, most lapses, longest overdue); a little randomness among the weakest
    const open = due.filter(k => !tiedToLastVerb(k) && !recentTargets.has(k));
    const ranked = (open.length ? open : due)
      .sort((a, b) => {
        const A = state.skills[a], B = state.skills[b];
        return A.iv - B.iv || B.lapses - A.lapses || A.due - B.due;
      });
    const top = ranked.slice(0, 6);
    const spread = Math.max(...top.map(k => skillVariety(k, recent)));
    // everything due belongs to the word just shown: always slot something else in first
    if (!open.length || (spread < 0.3 && Math.random() < 0.75)) {
      // every due skill would repeat the last prompt's tense or verb — slot in something
      // different (known or new) first; the due skill comes back a card or two later
      const other = skills.filter(k => (!state.skills[k] || state.skills[k].due > now) && !tiedToLastVerb(k));
      if (other.length) target = weighted(other, k => skillVariety(k, recent) * (state.skills[k] ? 2 : 1));
    }
    target ??= weighted(top, k => skillVariety(k, recent));
  } else if (fresh.length) {
    // new skills: lean on stems and endings first, they carry everything else
    const early = k => (['end', 'stem', 'nstem'].includes(kind(k)) ? 2 : 1) * (kind(k) === 'nstem' && NOUN_BY_ID[k.split('|')[2]]?.first ? 3 : 1);
    const freshOpen = fresh.filter(k => !tiedToLastVerb(k));
    target = weighted(freshOpen.length ? freshOpen : fresh, k => early(k) * skillVariety(k, recent));
  } else {
    // nothing due, nothing new: review whatever comes due soonest
    const soon = skills.filter(k => !tiedToLastVerb(k)).sort((a, b) => state.skills[a].due - state.skills[b].due).slice(0, 10);
    target = weighted(soon.length ? soon : skills.slice(0, 10), k => skillVariety(k, recent));
  }

  const forTarget = bySkill.get(target) ||
    (kind(target) === 'bleed' ? pool.filter(it => bleedKey(it) === target) : pool);
  let cands = forTarget.filter(it => !blocked.has(itemKey(it)));
  const lastId = wordId(recent[recent.length - 1]);
  const otherWord = cands.filter(it => wordId(it) !== lastId);
  if (otherWord.length) cands = otherWord;
  const list = cands.length ? cands : pool;
  // variety counts double against familiarity, so "known filler" doesn't keep pulling the same slots back
  const pick = weighted(list, it => {
    let w = variety(it, recent) ** 2;
    for (const s of it.skills) if (s !== target) w *= known(state, s);
    return w;
  });
  const { skills: _, ...item } = pick;
  return { ...item, target };
}

// ---------- rebuilding from history ----------

// Replays saved answers through the skill model, so switching models keeps progress.
export function rebuildSkills(attempts) {
  const state = { skills: {} };
  for (const a of attempts) {
    if (a.mod === 'n' || a.mod === 'c' || a.mod === 'p' || a.mod === 'a') {
      const item = a.mod === 'n' ? { mod: 'noun', lang: a.l, nounId: a.nn, kind: a.k, detail: a.d, num: a.nu, n: a.c }
        : a.mod === 'c' ? { mod: 'conn', lang: a.l, connId: a.cn }
        : a.mod === 'a' ? { mod: 'adj', lang: a.l, adjId: a.ai, kind: a.k, detail: a.d, num: a.nu, ag: a.ag, nounId: a.nn }
        : { mod: 'pron', lang: a.l, kind: a.k, pid: a.pi, detail: a.d };
      if (a.mod === 'a' && (!ADJ_BY_ID[a.ai]?.[a.l] || !NOUN_BY_ID[a.nn]?.[a.l])) continue;
      if ((a.mod === 'n' && !NOUN_BY_ID[a.nn]?.[a.l]) || (a.mod === 'c' && !CONNECTOR_BY_ID[a.cn]?.[a.l])) continue;
      let expected;
      try { expected = (a.mod === 'n' ? nounForms(item) : a.mod === 'c' ? connForms(item) : a.mod === 'a' ? adjForms(item) : pronForms(item))[0]; } catch { continue; }
      if (expected == null) continue;
      const outcome = { result: a.ok === 1 ? 'correct' : a.ok === 2 ? 'close' : 'wrong', error: a.e, expected };
      applyAnswer(state, item, outcome, a.a || '', !!a.h, a.t, a.ms ?? null);
      continue;
    }
    const item = { lang: a.l, verbId: a.v, tense: a.te, person: a.p, gender: a.g ?? null,
                   neg: !!a.n, aspect: a.pf ? 'pf' : 'impf' };
    const verb = VERB_BY_ID[item.verbId];
    if (!verb || !verb[item.lang] || (item.aspect === 'pf' && !verb[item.lang].pf)) continue;
    const expected = formsFor(verb, item.lang, item.tense, item.person, item.gender, item.neg, item.aspect)[0];
    const outcome = { result: a.ok === 1 ? 'correct' : a.ok === 2 ? 'close' : 'wrong', error: a.e, expected };
    applyAnswer(state, item, outcome, a.a || '', !!a.h, a.t, a.ms ?? null);
  }
  return state.skills;
}

// ---------- describing skills ----------

const AGR = { m: { sg: '-o', pl: '-li' }, f: { sg: '-la', pl: '-le' }, n: { sg: '-lo', pl: '-la' } };
const NEG = {
  sr: { pres: 'ne + verb (nisam, nemam, neću)', past: 'nisam + participle', fut: 'neću + infinitive' },
  mk: { pres: 'не + verb', past: 'не + verb', fut: 'нема да + verb' },
};
const SR_AUX = ['sam', 'si', 'je', 'smo', 'ste', 'su'];
const SR_FUT = ['-ću', '-ćeš', '-će', '-ćemo', '-ćete', '-će'];

// A verb that shows the class, e.g. "like čitati".
function classExample(lang, tense, aspect, cls) {
  for (const v of Object.values(VERB_BY_ID)) {
    if (!v[lang] || (aspect === 'pf' && !v[lang].pf)) continue;
    if (verbClass(v, lang, aspect, tense) === cls) return hintFor(v, lang, aspect);
  }
  return '';
}

export function skillName(key) {
  const k0 = kind(key);
  if (k0 in NOUN_SKILL_KINDS) return nounSkillName(key);
  if (k0 in CONN_SKILL_KINDS) return connSkillName(key);
  if (k0 in PRON_SKILL_KINDS) return pronSkillName(key);
  if (k0 in ADJ_SKILL_KINDS) return adjSkillName(key);
  if (k0 === 'bleed' && /\|a:/.test(key)) return `bleed · ${adjSkillName(`astem|${key.split('|')[1]}|${key.split(':')[1]}`).replace('adjective · ', '')}`;
  if (k0 === 'bleed' && /\|p:/.test(key)) return `bleed · ${pronSkillName(`pper|${key.split('|')[1]}|${key.split(':')[1]}`).replace('pronoun · ', '')}`;
  if (k0 === 'bleed' && /\|[nc]:/.test(key)) {
    const [, lang, ref] = key.split('|');
    const [t, id] = ref.split(':');
    return t === 'n' ? `bleed · ${nounSkillName(`nstem|${lang}|${id}`).replace('noun · ', '')}` : `bleed · ${connSkillName(`conn|${lang}|${id}`).replace('connector · ', '')}`;
  }
  const [k, lang, a, b, c, d] = key.split('|');
  const L = LANGS[lang];
  switch (k) {
    case 'end': {
      const [tense, aspect, person, cls] = [a, b, +c, d];
      const pron = L.pronouns[person].join('/');
      const t = TENSES[tense].en;
      const pf = aspect === 'pf' ? ' perfective' : '';
      if (lang === 'sr' && tense === 'past') return `${t} · ${pron} (${SR_AUX[person]})`;
      if (lang === 'sr' && tense === 'fut') return `${t} · ${pron} (${SR_FUT[person]})`;
      if (cls === 'irr') return `${t}${pf} · ${pron} · irregular verbs`;
      return `${t}${pf} · ${pron} · verbs like ${classExample(lang, tense, aspect, cls)}`;
    }
    case 'agr': return `past agreement · ${GENDERS[a].en} ${b === 'sg' ? 'singular' : 'plural'} (${AGR[a][b]})`;
    case 'tns': return `forming the ${TENSES[a].en} (${TENSES[a][lang]})`;
    case 'neg': return `negation · ${TENSES[a].en} (${NEG[lang][a]})`;
    case 'asp': {
      const v = VERB_BY_ID[a];
      return `aspect · ${hintFor(v, lang)} / ${hintFor(v, lang, 'pf')}`;
    }
    case 'stem': return `stem · ${hintFor(VERB_BY_ID[a], lang, b)}`;
    case 'bleed': {
      const v = VERB_BY_ID[a], other = lang === 'sr' ? 'mk' : 'sr';
      return `bleed · ${hintFor(v, lang)} (not ${v[other] ? hintFor(v, other) : '—'})`;
    }
  }
  return key;
}

export const SKILL_KINDS = {
  end: 'Endings', agr: 'Gender agreement', tns: 'Tense formation',
  neg: 'Negation', asp: 'Aspect choice', stem: 'Verb stems', bleed: 'Language bleed',
  ...NOUN_SKILL_KINDS, ...CONN_SKILL_KINDS, ...PRON_SKILL_KINDS, ...ADJ_SKILL_KINDS,
};

// Which module a skill belongs to.
export function skillMod(key) {
  const k = kind(key);
  if (k in NOUN_SKILL_KINDS || key.includes('|n:')) return 'nouns';
  if (k in CONN_SKILL_KINDS || key.includes('|c:')) return 'connectors';
  if (k in PRON_SKILL_KINDS || key.includes('|p:')) return 'pronouns';
  if (k in ADJ_SKILL_KINDS || key.includes('|a:')) return 'adjectives';
  return 'verbs';
}

export function summary(state, now = Date.now(), mod = null) {
  const entries = Object.entries(state.skills).filter(([k]) => !mod || skillMod(k) === mod);
  const startOfTomorrow = new Date(now).setHours(24, 0, 0, 0);
  const s = { seen: entries.length, learning: 0, young: 0, mastered: 0, dueNow: 0, dueToday: 0, dueWeek: 0,
              leeches: [], weakest: [], byKind: {} };
  for (const [key, sk] of entries) {
    const bucket = sk.iv === 0 ? 'learning' : sk.iv < MASTERED_DAYS ? 'young' : 'mastered';
    s[bucket]++;
    const kk = kind(key);
    s.byKind[kk] ??= { learning: 0, young: 0, mastered: 0 };
    s.byKind[kk][bucket]++;
    if (sk.due <= now) s.dueNow++;
    if (sk.due < startOfTomorrow) s.dueToday++;
    if (sk.due < now + 7 * DAY) s.dueWeek++;
    if (isLeech(sk)) s.leeches.push({ key, ...sk });
  }
  s.leeches.sort((a, b) => b.lapses - a.lapses);
  s.weakest = entries.filter(([, sk]) => sk.lapses > 0)
    .sort(([, a], [, b]) => a.iv - b.iv || b.lapses - a.lapses)
    .slice(0, 8).map(([key, sk]) => ({ key, ...sk }));
  return s;
}
