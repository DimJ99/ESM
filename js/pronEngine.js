// Pronouns: personal forms (long vs short, by case / role), possessive forms, and
// fill-in-the-blank drills for short forms, clitic placement, clusters and MK doubling.
// A pronoun item: { mod: 'pron', lang, kind: 'form' | 'poss' | 'drill', pid, detail }
//   form   pid = personal id; detail = SR "<case><s|l>" (e.g. "2s" = dative short) or MK acc / accS / dat / datS
//   poss   pid = possessive id; detail = SR slot 0–5, MK f0–f3 (мој…), d0–d3 (мојот…), k (мајка ми)
//   drill  pid = drill id
import { PERSONAL, POSSESSIVE, DRILLS, PERSONAL_BY_ID, POSSESSIVE_BY_ID, DRILL_BY_ID } from './pronouns.js';
import { normalize, loose, skeleton, editDistance } from './engine.js';

export { PERSONAL_BY_ID, POSSESSIVE_BY_ID, DRILL_BY_ID };

const words = s => s.split(' ');
const alts = s => s && s !== '-' ? s.split('/') : [];

// ---------- forms ----------

export const SR_CASES = ['nominativ', 'genitiv', 'dativ', 'akuzativ', 'vokativ', 'instrumental', 'lokativ'];
const SR_ROLE = ['subject', 'of … (genitive)', 'to … (dative)', 'object (accusative)', '', 'with … (instrumental)', 'about … (locative)'];
export const MK_ROLES = {
  acc: 'direct object', accS: 'direct object', dat: 'indirect object (to …)', datS: 'indirect object (to …)',
};
export const PERSON_COLOUR = { '1sg': 0, '2sg': 1, '3m': 2, '3f': 2, '3n': 2, '1pl': 3, '2pl': 4, '3pl': 5 };
export const SLOT_NAMES = {
  sr: ['masculine', 'feminine', 'neuter', 'masculine plural', 'feminine plural', 'neuter plural'],
  mk: ['masculine', 'feminine', 'neuter', 'plural'],
};
export const DRILL_SKILLS = {
  short: 'short form', place: 'clitic placement', cluster: 'clitic cluster', long: 'long form',
  double: 'clitic doubling', own: 'possessive',
};
const DRILL_HINTS = {
  short: 'a short (clitic) form', place: 'which clitic goes in this slot',
  cluster: 'two clitics: dative before accusative', long: 'the long form (emphasis / after a preposition)',
  double: 'MK doubles a definite object with a clitic', own: 'ownership',
};

const srShort = d => d.endsWith('s');
export function personalForms(item) {
  const p = PERSONAL_BY_ID[item.pid];
  if (item.lang === 'sr') {
    const c = parseInt(item.detail, 10);
    return alts(words(srShort(item.detail) ? p.sr.short : p.sr.long)[c]);
  }
  return alts(p.mk[item.detail]);
}
export function possForms(item) {
  const p = POSSESSIVE_BY_ID[item.pid];
  if (item.lang === 'sr') return alts(words(p.sr)[item.detail]);
  if (item.detail === 'k') return alts(p.mk.kin);
  return alts(words(item.detail[0] === 'd' ? p.mk.def : p.mk.forms)[+item.detail[1]]);
}
export const drillForms = item => DRILL_BY_ID[item.pid][item.lang].ans.split('/');
export const pronForms = item => item.kind === 'form' ? personalForms(item) : item.kind === 'poss' ? possForms(item) : drillForms(item);

// The base shown for a form prompt: the nominative (oneself has none).
export function pronBase(item) {
  const p = PERSONAL_BY_ID[item.pid];
  const nom = item.lang === 'sr' ? words(p.sr.long)[0] : p.mk.nom;
  return nom !== '-' ? nom : item.lang === 'sr' ? 'sebe' : 'себе';
}
export function formRole(item) {
  if (item.lang === 'sr') {
    const c = parseInt(item.detail, 10);
    return { cas: SR_CASES[c], role: SR_ROLE[c], type: srShort(item.detail) ? 'short' : 'long' };
  }
  return { cas: MK_ROLES[item.detail], role: '', type: item.detail.endsWith('S') ? 'short' : 'long' };
}

// ---------- pool ----------

export function buildPronPool({ langs, pronKinds = ['drill', 'form', 'poss'] }) {
  const pool = [];
  const push = it => pool.push({ mod: 'pron', ...it });
  for (const lang of langs) {
    if (pronKinds.includes('drill')) for (const d of DRILLS) if (d[lang]) push({ lang, kind: 'drill', pid: d.id, detail: '' });
    if (pronKinds.includes('form')) for (const p of PERSONAL) {
      if (lang === 'sr') {
        // nominative and vocative aren't worth drilling: the base already shows them
        for (const c of [1, 2, 3, 5, 6]) for (const t of ['l', 's'])
          if (alts(words(t === 's' ? p.sr.short : p.sr.long)[c]).length) push({ lang, kind: 'form', pid: p.id, detail: `${c}${t}` });
      } else {
        for (const d of ['acc', 'accS', 'dat', 'datS']) if (alts(p.mk[d]).length) push({ lang, kind: 'form', pid: p.id, detail: d });
      }
    }
    if (pronKinds.includes('poss')) for (const p of POSSESSIVE) {
      if (lang === 'sr') for (let s = 0; s < 6; s++) push({ lang, kind: 'poss', pid: p.id, detail: s });
      else {
        for (let s = 0; s < 4; s++) for (const t of ['f', 'd']) push({ lang, kind: 'poss', pid: p.id, detail: `${t}${s}` });
        if (alts(p.mk.kin).length) push({ lang, kind: 'poss', pid: p.id, detail: 'k' });
      }
    }
  }
  return pool;
}

export function pronTwin(item) {
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  const base = { mod: 'pron', lang: other, kind: item.kind, pid: item.pid };
  if (item.kind === 'drill') return DRILL_BY_ID[item.pid][other] ? { ...base, detail: '' } : null;
  if (item.kind === 'poss') {
    if (item.lang === 'sr') return { ...base, detail: `d${Math.min(item.detail, 3)}` };   // moja → мојата
    return item.detail === 'k' ? null : { ...base, detail: +item.detail[1] };
  }
  // forms: only the direct / indirect object exist in both
  if (item.lang === 'sr') {
    const c = parseInt(item.detail, 10);
    if (c !== 2 && c !== 3) return null;
    const d = (c === 3 ? 'acc' : 'dat') + (srShort(item.detail) ? 'S' : '');
    return alts(PERSONAL_BY_ID[item.pid].mk[d]).length ? { ...base, detail: d } : null;
  }
  const d = `${item.detail.startsWith('acc') ? 3 : 2}${item.detail.endsWith('S') ? 's' : 'l'}`;
  return alts(words((d.endsWith('s') ? PERSONAL_BY_ID[item.pid].sr.short : PERSONAL_BY_ID[item.pid].sr.long))[parseInt(d, 10)]).length ? { ...base, detail: d } : null;
}

// ---------- checking ----------

function prepare(item, raw) {
  const ans = normalize(raw);
  if (item.kind !== 'drill') return ans;
  const frame = normalize(DRILL_BY_ID[item.pid][item.lang].frame.replace('___', 'BLANKSLOT'));
  const [before, after] = frame.split('blankslot').map(s => s.trim());
  if ((before || after) && ans.startsWith(before) && ans.endsWith(after) && ans.length > before.length + after.length) {
    const mid = ans.slice(before.length, ans.length - after.length).trim();
    if (mid) return mid;
  }
  return ans;
}

// Every personal / possessive form in a language, tagged so a miss can be explained.
function allPersonal(lang) {
  const out = [];
  for (const p of PERSONAL) {
    if (lang === 'sr') for (let c = 0; c < 7; c++) for (const t of ['l', 's'])
      for (const f of alts(words(t === 's' ? p.sr.short : p.sr.long)[c])) out.push({ pid: p.id, c: String(c), t, f });
    else for (const d of ['nom', 'acc', 'accS', 'dat', 'datS'])
      for (const f of alts(p.mk[d])) out.push({ pid: p.id, c: d.replace('S', ''), t: d.endsWith('S') ? 's' : 'l', f });
  }
  return out;
}
function allPossessive(lang) {
  const out = [];
  for (const p of POSSESSIVE) {
    if (lang === 'sr') words(p.sr).forEach((s, i) => alts(s).forEach(f => out.push({ pid: p.id, slot: String(i), f })));
    else {
      words(p.mk.forms).forEach((s, i) => alts(s).forEach(f => out.push({ pid: p.id, slot: `f${i}`, f })));
      words(p.mk.def).forEach((s, i) => alts(s).forEach(f => out.push({ pid: p.id, slot: `d${i}`, f })));
      alts(p.mk.kin).forEach(f => out.push({ pid: p.id, slot: 'k', f }));
    }
  }
  return out;
}
const everything = lang => [...allPersonal(lang).map(x => x.f), ...allPossessive(lang).map(x => x.f),
  ...DRILLS.flatMap(d => d[lang] ? d[lang].ans.split('/') : [])];

function classifyPron(item, ans, expected) {
  const eq = f => f === ans || loose(f) === loose(ans);
  if (item.kind === 'form' || item.kind === 'drill') {
    // the long form where a short one was wanted (njega for ga) or the reverse
    const hits = allPersonal(item.lang).filter(x => eq(x.f));
    const target = allPersonal(item.lang).filter(x => expected.split(' ').includes(x.f) || x.f === expected);
    if (item.kind === 'drill' && expected.includes(' ') && ans.split(' ').reverse().join(' ') === expected) return 'order';
    if (hits.length && target.length) {
      const same = (a, b) => a.pid === b.pid;
      if (hits.some(h => target.some(t => same(h, t) && h.c === t.c && h.t !== t.t))) return 'longshort';
      if (item.kind === 'form') {
        if (hits.some(h => target.some(t => same(h, t) && h.c !== t.c))) return 'case';
        if (hits.some(h => target.some(t => !same(h, t) && h.c === t.c && h.t === t.t))) return 'person';
      }
      if (item.kind === 'drill' && hits.some(h => target.some(t => same(h, t)))) return 'case';
    }
    if (item.kind === 'drill' && (hits.length || allPossessive(item.lang).some(x => eq(x.f)))) return 'pronoun';
  }
  if (item.kind === 'poss') {
    const hits = allPossessive(item.lang).filter(x => eq(x.f));
    if (hits.length) {
      const slot = String(item.detail);
      if (hits.some(h => h.pid === item.pid)) {
        if (item.lang === 'mk' && (slot === 'k' || hits.some(h => h.slot === 'k'))) return 'ownership';
        if (item.lang === 'mk' && hits.some(h => h.slot[0] !== slot[0] && h.slot[1] === slot[1])) return 'article';
        return 'agreement';
      }
      return 'possessive';
    }
  }
  // bleed: the other language's pronoun (ја for je, mene for мене typed in Latin…)
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  const sk = skeleton(ans);
  if (everything(other).includes(ans)) return 'bleed';   // typed exactly, in the other alphabet
  if (!everything(item.lang).some(f => skeleton(f) === sk) && everything(other).some(f => skeleton(f) === sk)) return 'bleed';
  return null;
}

export function checkPron(item, rawAnswer, { lenient }) {
  const accepted = pronForms(item);
  const expected = accepted[0];
  const ans = prepare(item, rawAnswer);
  if (!ans) return { result: 'wrong', error: 'blank', expected, accepted };
  if (accepted.includes(ans)) return { result: 'correct', error: null, expected, accepted };
  if (accepted.some(f => loose(f) === loose(ans)))
    return { result: lenient ? 'close' : 'wrong', error: 'diacritics', expected, accepted };
  const otherScript = item.lang === 'sr' ? /[а-яѓђѕјљњќћџ]/.test(ans) : /[a-zčćšžđ]/.test(ans);
  if (otherScript && accepted.some(f => skeleton(f) === skeleton(ans))) return { result: 'wrong', error: 'script', expected, accepted };
  const error = classifyPron(item, ans, expected) || (Math.min(...accepted.map(f => editDistance(f, ans))) <= 2 ? 'spelling' : 'other');
  return { result: 'wrong', error, expected, accepted };
}

// ---------- skills ----------

export function pronSkills(item) {
  const L = item.lang;
  if (item.kind === 'form') {
    const { type } = formRole(item);
    const role = L === 'sr' ? `c${parseInt(item.detail, 10)}` : item.detail.replace('S', '');
    return [`pcase|${L}|${role}|${type}`, `pper|${L}|${item.pid}`];
  }
  if (item.kind === 'poss') return [`pown|${L}|${item.detail}`, `pposs|${L}|${item.pid}`];
  return [`pdr|${L}|${DRILL_BY_ID[item.pid].skill}`, `pdw|${L}|${item.pid}`];
}
// The word-level skill (like a verb's stem) — takes blank / unknown misses and hints.
export const pronWordKind = item => item.kind === 'form' ? 'pper' : item.kind === 'poss' ? 'pposs' : 'pdw';

export function pronBlame(item, err) {
  const main = item.kind === 'form' ? 'pcase' : item.kind === 'poss' ? 'pown' : 'pdr';
  return {
    longshort: main, case: main, order: 'pdr', pronoun: 'pdr', person: 'pper', diacritics: pronWordKind(item),
    agreement: 'pown', article: 'pown', ownership: 'pown', possessive: 'pposs', spelling: main,
  }[err] || null;
}

export function pronSkillName(key) {
  const [k, lang, a, b] = key.split('|');
  switch (k) {
    case 'pcase': return lang === 'sr' ? `${b} form · ${SR_CASES[+a.slice(1)]}` : `${b} form · ${MK_ROLES[a]}`;
    case 'pper': return `pronoun · ${PERSONAL_BY_ID[a]?.en || a}`;
    case 'pown': {
      if (lang === 'sr') return `possessive · ${SLOT_NAMES.sr[+a]}`;
      if (a === 'k') return 'possessive · close family short form (мајка ми)';
      return `possessive · ${a[0] === 'd' ? 'with article (мојот)' : 'plain (мој)'} ${SLOT_NAMES.mk[+a[1]]}`;
    }
    case 'pposs': return `possessive · ${POSSESSIVE_BY_ID[a]?.en || a}`;
    case 'pdr': return `drill · ${DRILL_SKILLS[a] || a}`;
    case 'pdw': return `drill · ${DRILL_BY_ID[a]?.prompt || a}`;
  }
  return key;
}
export const PRON_SKILL_KINDS = {
  pcase: 'Long vs short forms', pper: 'Personal pronouns', pown: 'Possessive forms', pposs: 'Possessive words',
  pdr: 'Clitic drills', pdw: 'Drill sentences',
};

export function pronHint(item) {
  if (item.kind === 'drill') {
    const d = DRILL_BY_ID[item.pid];
    return `${DRILL_HINTS[d.skill]} · starts with ${d[item.lang].ans[0]}…`;
  }
  if (item.kind === 'form') {
    const { type } = formRole(item);
    return type === 'short' ? 'short forms are clitics: second position in SR (Vidim ga), before the verb in MK (Го гледам)'
      : 'long forms: for emphasis and after prepositions (za tebe, со мене)';
  }
  const p = POSSESSIVE_BY_ID[item.pid];
  return `${item.lang === 'sr' ? words(p.sr)[0] : words(p.mk.forms)[0]} · agrees with the noun's gender and number`;
}

export const pronNote = item => {
  const src = item.kind === 'form' ? PERSONAL_BY_ID[item.pid] : item.kind === 'poss' ? POSSESSIVE_BY_ID[item.pid] : DRILL_BY_ID[item.pid];
  return src?.note || '';
};

export function pronLabel(item) {
  if (item.kind === 'drill') return DRILL_BY_ID[item.pid][item.lang].frame;
  if (item.kind === 'form') {
    const r = formRole(item);
    return `${pronBase(item)} → ${r.cas}, ${r.type}`;
  }
  const p = POSSESSIVE_BY_ID[item.pid];
  const slot = item.lang === 'sr' ? SLOT_NAMES.sr[item.detail]
    : item.detail === 'k' ? 'close family (мајка ___)' : `${item.detail[0] === 'd' ? 'with article, ' : ''}${SLOT_NAMES.mk[+item.detail[1]]}`;
  return `${p.en} · ${slot}`;
}

// What a checkpoint / stats breakdown groups by.
export const pronGroup = item => item.kind === 'drill' ? DRILL_BY_ID[item.pid].skill : item.kind;
