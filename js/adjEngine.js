// Adjective agreement: an adjective + noun phrase, built from the noun data.
//   Serbian: agree in a case frame ("idem u ___ (nov · prodavnica)" → "novu prodavnicu"),
//            triple agreement (moja nova prodavnica), comparatives (veća kuća).
//   Macedonian: the article on the first word (новиот компјутер, мојот нов компјутер),
//            plain agreement (нов компјутер), comparatives (по-голема куќа).
// An adjective item: { mod: 'adj', lang, adjId, kind, detail, num, ag, nounId }
//   kind: agree (SR, detail = frame) · poss3 (detail = owner) · cmp · art (MK) · indef (MK)
//   ag: the agreement class (SR m / f / n / plM… with * for an animate masculine accusative,
//   MK m / f / n / pl). Skills follow from it; the noun is picked per card within that class.
import { ADJECTIVES, ADJ_BY_ID } from './adjectives.js';
import { NOUNS, NOUN_BY_ID, PEOPLE, PLACES, FRAMES, CASES, CASE_NAMES, OWNERS, frameText, srSlot, srBase, mkBase,
  agreeSR, srPoss, mkPoss } from './nounEngine.js';
import { normalize, loose, skeleton, editDistance } from './engine.js';
import { POSSESSIVE } from './pronouns.js';

const MK_PLAIN_POSS = POSSESSIVE.flatMap(p => p.mk.forms.split(' '));

export { ADJ_BY_ID };

const words = s => s.split(' ');
const alts = s => s && s !== '-' ? s.split('/') : [];
const first = s => s.split('/')[0].trim();

// Which nouns make sense with which adjectives. Listed adjectives only pair with their
// list ('people' = every person noun); anything not listed pairs with any noun.
const P = 'people';
const PAIRS = {
  young: [P], happy: [P, 'day', 'life', 'film', 'music'], sad: [P, 'day', 'life', 'film', 'music'],
  tired: [P, 'dog'], busy: [P, 'street', 'day', 'week', 'city'], hungry: [P, 'dog'], sick: [P, 'dog'],
  healthy: [P, 'dog', 'meat', 'fruit', 'vegetables', 'breakfast', 'lunch', 'dinner', 'life'],
  rich: [P, 'city', 'village'], poor: [P, 'city', 'village'], kind: [P],
  smart: [P, 'dog', 'idea', 'question', 'phone'], stupid: [P, 'idea', 'question', 'game', 'film', 'error'],
  strong: [P, 'coffee', 'beer', 'network', 'system', 'computer'], weak: [P, 'coffee', 'beer', 'network', 'system'],
  tall: [P, 'house', 'window', 'door'], low: ['house', 'window', 'door', 'table', 'chair', 'bed'],
  long: ['street', 'road', 'film', 'trip', 'message', 'book', 'day', 'week', 'night', 'question', 'name', 'life', 'hand', 'leg', 'weekend'],
  short: ['street', 'road', 'film', 'trip', 'message', 'book', 'day', 'week', 'night', 'question', 'name', 'life', 'weekend'],
  expensive: ['phone', 'computer', 'car', 'bag', 'book', 'apartment', 'house', 'restaurant', 'cafe', 'coffee', 'beer', 'bread', 'meat', 'trip', 'gym', 'city', 'machine'],
  cheap: ['phone', 'computer', 'car', 'bag', 'book', 'apartment', 'house', 'restaurant', 'cafe', 'coffee', 'beer', 'bread', 'meat', 'trip', 'gym', 'machine'],
  fast: [P, 'dog', 'car', 'bus', 'computer', 'phone', 'network', 'machine', 'program', 'system', 'lunch', 'breakfast'],
  slow: [P, 'dog', 'car', 'bus', 'computer', 'phone', 'network', 'machine', 'program', 'system'],
  hot: ['coffee', 'water', 'milk', 'meat', 'bread', 'room', 'kitchen', 'day', 'night', 'city', 'lunch', 'dinner'],
  warm: ['coffee', 'water', 'milk', 'bread', 'room', 'kitchen', 'house', 'apartment', 'day', 'night', 'morning', 'evening', 'hand'],
  cold: ['coffee', 'water', 'milk', 'beer', 'meat', 'room', 'kitchen', 'house', 'apartment', 'day', 'night', 'morning', 'evening', 'hand', 'city'],
  open: ['door', 'window', 'store', 'market', 'bank', 'cafe', 'restaurant', 'office', 'school', 'park', 'gym', 'book', 'bag', 'file', 'question', 'eye'],
  closed: ['door', 'window', 'store', 'market', 'bank', 'cafe', 'restaurant', 'office', 'school', 'park', 'gym', 'book', 'bag', 'file', 'eye'],
  easy: ['question', 'job', 'problem', 'game', 'language', 'word', 'trip', 'life', 'day', 'week', 'project', 'code', 'program'],
  hard: ['question', 'job', 'problem', 'game', 'language', 'word', 'trip', 'life', 'day', 'week', 'project', 'code', 'bag', 'book'],
  technical: ['problem', 'question', 'error', 'system', 'file', 'program', 'code', 'data', 'project', 'job', 'university', 'school', 'book', 'language'],
  interesting: [P, 'film', 'book', 'game', 'idea', 'question', 'job', 'project', 'city', 'trip', 'music', 'sport', 'life', 'language', 'word', 'message', 'name'],
  boring: [P, 'film', 'book', 'game', 'idea', 'job', 'project', 'city', 'trip', 'music', 'sport', 'life', 'day', 'week', 'weekend'],
  important: [P, 'question', 'problem', 'message', 'job', 'project', 'day', 'idea', 'file', 'data', 'thing', 'word', 'name', 'error'],
  correct: ['time', 'word', 'name', 'data', 'code', 'message', 'question', 'idea', 'hour', 'minute'],
  free: ['time', 'day', 'weekend', 'room', 'chair', 'table', 'apartment', 'hour', 'minute', 'evening', 'morning'],
  near: [P, 'city', 'village', 'street', 'store', 'market', 'school', 'church', 'hospital', 'office', 'restaurant', 'cafe', 'bank', 'park', 'gym', 'house', 'apartment'],
  far: ['city', 'village', 'street', 'store', 'market', 'school', 'church', 'hospital', 'office', 'restaurant', 'cafe', 'bank', 'park', 'gym', 'house', 'apartment', 'road', 'trip'],
  black: ['car', 'bag', 'phone', 'house', 'door', 'window', 'table', 'chair', 'bed', 'book', 'bus', 'coffee', 'eye', 'key', 'dog', 'computer', 'bread'],
  white: ['car', 'bag', 'phone', 'house', 'door', 'window', 'table', 'chair', 'bed', 'book', 'bus', 'coffee', 'key', 'dog', 'computer', 'bread', 'meat', 'church', 'tooth'],
  red: ['car', 'bag', 'phone', 'house', 'door', 'window', 'table', 'chair', 'bed', 'book', 'bus', 'key', 'computer', 'meat', 'eye'],
  blue: ['car', 'bag', 'phone', 'house', 'door', 'window', 'table', 'chair', 'bed', 'book', 'bus', 'key', 'computer', 'eye'],
  green: ['car', 'bag', 'phone', 'house', 'door', 'window', 'table', 'chair', 'bed', 'book', 'bus', 'key', 'computer', 'eye', 'park', 'fruit', 'vegetables'],
  serbian: [P, 'language', 'word', 'coffee', 'bread', 'city', 'village', 'film', 'music', 'name', 'book', 'school', 'church', 'restaurant', 'meat'],
  macedonian: [P, 'language', 'word', 'coffee', 'bread', 'city', 'village', 'film', 'music', 'name', 'book', 'school', 'church', 'restaurant', 'meat'],
  whole: ['day', 'night', 'week', 'month', 'year', 'weekend', 'city', 'village', 'street', 'life', 'project', 'book', 'film', 'system', 'house', 'apartment'],
  every: ['day', 'night', 'morning', 'evening', 'week', 'month', 'year', 'weekend', 'hour', 'minute', 'time', 'question', 'word', 'person', 'child', 'student', 'store', 'city', 'street'],
  next: ['day', 'night', 'morning', 'evening', 'week', 'month', 'year', 'weekend', 'holiday', 'question', 'word', 'trip', 'match', 'game', 'bus', 'project', 'film', 'street', 'hour', 'minute'],
  last: ['day', 'night', 'morning', 'evening', 'week', 'month', 'year', 'weekend', 'holiday', 'question', 'word', 'trip', 'match', 'game', 'bus', 'project', 'film', 'message', 'hour', 'minute'],
  first: ['day', 'night', 'morning', 'week', 'month', 'year', 'question', 'word', 'trip', 'match', 'game', 'project', 'film', 'message', 'job', 'love', 'idea', 'child', 'student', 'book'],
};
const pairsWith = (adj, noun) => {
  const list = PAIRS[adj.id];
  return !list || list.includes(noun.id) || (list.includes(P) && PEOPLE.has(noun.id));
};

// determiners: no possessive in front (moj svaki…) and no comparative
const DETERMINERS = new Set(['every', 'same', 'other', 'next', 'last', 'first', 'whole']);
const SG_ONLY = new Set(['every', 'whole']);

export const KIND_NAMES = {
  agree: 'agreement in a case', poss3: 'possessive + adjective + noun', cmp: 'comparative',
  art: 'article on the first word', indef: 'agreement (no article)',
};

// ---------- forms ----------

const gKey = (g, num) => num === 'sg' ? g : 'pl' + g.toUpperCase();
export const adjBase = (adj, lang) => lang === 'sr' ? first(words(adj.sr.m)[0]) : words(adj.mk.forms)[0];
const nounWord = (noun, lang, num) => lang === 'sr' ? srSlot(noun, num, 0) : [num === 'pl' ? noun.mk.pl : noun.mk.sg];
const mkIdx = (noun, num) => num === 'pl' || noun.mk.g === 'pl' ? 3 : { m: 0, f: 1, n: 2 }[noun.mk.g];
const isSoft = adj => words(adj.sr.m)[1].endsWith('eg');

// Serbian adjective case for a noun: masculine animate accusative singular = genitive.
function srAdjCase(adj, noun, num, c) {
  const [g, n] = agreeSR(noun, num);
  const animAcc = c === 3 && n === 'sg' && g === 'm' && noun.sr.anim;
  return { gk: gKey(g, n), c: animAcc ? 1 : c, animAcc };
}
function srCmpForms(adj, gk) {
  const st = adj.sr.cmp.slice(0, -1);   // comparatives are soft: veći → veća, veće
  return [{ m: adj.sr.cmp, f: st + 'a', n: st + 'e', plM: st + 'i', plF: st + 'e', plN: st + 'a' }[gk]];
}

export function adjForms(item) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const combos = (as, ns) => as.flatMap(a => ns.map(n => `${a} ${n}`));
  if (item.lang === 'sr') {
    if (item.kind === 'agree') {
      const c = FRAMES[item.detail].c;
      const { gk, c: ac } = srAdjCase(adj, noun, item.num, c);
      return combos(alts(words(adj.sr[gk])[ac]), srSlot(noun, item.num, c));
    }
    const [g, n] = agreeSR(noun, item.num);
    const gk = gKey(g, n);
    if (item.kind === 'cmp') return combos(srCmpForms(adj, gk), nounWord(noun, 'sr', item.num));
    return combos(alts(words(adj.sr[gk])[0]), nounWord(noun, 'sr', item.num)).map(p => `${srPoss(item.detail, g, n)} ${p}`);
  }
  const i = mkIdx(noun, item.num);
  const nw = nounWord(noun, 'mk', item.num)[0];
  const f = words(adj.mk.forms)[i];
  if (item.kind === 'art') return [`${words(adj.mk.def)[i]} ${nw}`];
  if (item.kind === 'indef') return [`${f} ${nw}`];
  if (item.kind === 'cmp') return [`по-${f} ${nw}`, `по${f} ${nw}`, `по ${f} ${nw}`];
  return [`${mkPoss(item.detail, noun.mk.g, item.num)} ${f} ${nw}`];
}

// ---------- pool & nouns ----------

// The agreement class a noun puts the adjective in, for this prompt.
export function agOf(item, noun) {
  if (item.lang === 'mk') return ['m', 'f', 'n', 'pl'][mkIdx(noun, item.num)];
  const [g, n] = agreeSR(noun, item.num);
  const animAcc = item.kind === 'agree' && FRAMES[item.detail].c === 3 && n === 'sg' && g === 'm' && noun.sr.anim;
  return gKey(g, n) + (animAcc ? '*' : '');
}

function nounFits(item, noun) {
  const adj = ADJ_BY_ID[item.adjId];
  const d = noun[item.lang];
  if (!d || !d[item.num]) return false;
  if (item.ag && agOf(item, noun) !== item.ag) return false;
  if (!pairsWith(adj, noun)) return false;
  if (item.lang === 'sr' && item.kind === 'agree') {
    const f = FRAMES[item.detail];
    if ((f.who && !PEOPLE.has(noun.id)) || (f.thing && PEOPLE.has(noun.id)) || (f.place && !PLACES.has(noun.id))) return false;
  }
  if (item.lang === 'mk' && item.kind === 'art' && !(item.num === 'pl' ? d.plDef : d.def)) return false;
  if (item.lang === 'mk' && d.g === 'pl' && item.num === 'sg') return false;
  return true;
}
export const nounsFor = item => NOUNS.filter(n => nounFits(item, n));

// twinOnly: just what both languages share — agreement in the nominative, possessives, comparatives
export function buildAdjPool({ langs, adjKinds = ['agree', 'poss3', 'cmp', 'art', 'indef'], twinOnly = false }) {
  const pool = [];
  for (const lang of langs) for (const adj of ADJECTIVES) {
    if (!adj[lang]) continue;
    const nums = SG_ONLY.has(adj.id) ? ['sg'] : ['sg', 'pl'];
    // one item per agreement class the fitting nouns fall into
    const push = (kind, detail, num) => {
      const it = { mod: 'adj', lang, adjId: adj.id, kind, detail, num };
      for (const ag of new Set(nounsFor(it).map(n => agOf(it, n)))) pool.push({ ...it, ag });
    };
    const gradable = !!adj.sr.cmp;
    if (lang === 'sr') {
      if (adjKinds.includes('agree') || (twinOnly && adjKinds.includes('art')))
        for (const [fid, f] of Object.entries(FRAMES)) {
          if (twinOnly && fid !== 'nom') continue;
          for (const num of nums) if (f[num]) push('agree', fid, num);
        }
    } else {
      if (adjKinds.includes('art') && adj.mk.def) for (const num of nums) push('art', '', num);
      if (adjKinds.includes('indef') || (twinOnly && adjKinds.includes('agree'))) for (const num of nums) push('indef', '', num);
    }
    if (adjKinds.includes('poss3') && !DETERMINERS.has(adj.id))
      for (let o = 0; o < OWNERS.length; o++) for (const num of nums) push('poss3', o, num);
    if (adjKinds.includes('cmp') && gradable) push('cmp', '', 'sg');
  }
  return pool;
}

// The matching prompt in the other language (same noun), for twin mode.
export function adjTwin(item) {
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  let kind = item.kind, detail = item.detail;
  if (item.lang === 'sr' && item.kind === 'agree') {
    if (item.detail !== 'nom') return null;
    kind = 'indef'; detail = '';
  } else if (item.lang === 'mk' && (item.kind === 'art' || item.kind === 'indef')) {
    kind = 'agree'; detail = 'nom';
  }
  const noun = NOUN_BY_ID[item.nounId];
  const twin = { mod: 'adj', lang: other, adjId: item.adjId, kind, detail, num: item.num, nounId: item.nounId };
  if (!ADJ_BY_ID[item.adjId][other] || !noun || !nounFits(twin, noun)) return null;
  return { ...twin, ag: agOf(twin, noun) };
}

// Pick the noun for a card (and, in twin mode, one that works in both languages).
export function withNoun(item, twin = false) {
  if (item.nounId) return item;
  let nouns = nounsFor(item);
  if (twin) {
    const both = nouns.filter(n => adjTwin({ ...item, nounId: n.id }));
    if (both.length) nouns = both;
  }
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return { ...item, nounId: n?.id };
}

// ---------- checking ----------

function prepare(item, raw) {
  let toks = normalize(raw).split(' ').filter(Boolean);
  if (item.kind === 'agree') {
    const frame = new Set(frameText({ ...item, nounId: item.nounId }).replace(/[,!]/g, '').split(' ').filter(t => t !== '___'));
    const rest = toks.filter(t => !frame.has(t));
    if (rest.length) toks = rest;
  }
  return toks.join(' ');
}

const srAllAdj = adj => ['m', 'f', 'n', 'plM', 'plF', 'plN'].flatMap(gk => words(adj.sr[gk]).flatMap(alts));
const srAllNoun = noun => ['sg', 'pl'].flatMap(num => noun.sr[num] ? words(noun.sr[num]).flatMap(alts) : []);
const mkAllAdj = adj => [...words(adj.mk.forms), ...(adj.mk.def ? words(adj.mk.def) : [])];
const mkAllNoun = noun => [noun.mk.sg, noun.mk.pl, noun.mk.def, noun.mk.plDef].filter(Boolean);
const allIn = (item, lang) => {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  if (!adj[lang] || !noun[lang]) return [];
  return lang === 'sr' ? [...srAllAdj(adj), ...srAllNoun(noun)] : [...mkAllAdj(adj), ...mkAllNoun(noun)];
};

function classifyAdj(item, ans, expected) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const toks = ans.split(' '), exp = expected.split(' ');
  const has = (list, t) => list.some(f => f === t || loose(f) === loose(t));
  // bleed first: a word from the other language (нов for nov, novi for нови…)
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  const otherForms = allIn(item, other), ownForms = allIn(item, item.lang);
  if (toks.some(t => otherForms.includes(t) || (!ownForms.some(f => skeleton(f) === skeleton(t)) && otherForms.some(f => skeleton(f) === skeleton(t))))) return 'bleed';
  if (toks.length < exp.length && toks.every(t => has(ownForms, t) || has(OWNERS, t))) return 'incomplete';
  if (toks.length !== exp.length) return null;

  if (item.lang === 'sr') {
    const accepted = adjForms(item).map(p => p.split(' '));
    const adjAt = exp.length - 2, nounAt = exp.length - 1;
    const adjOk = accepted.some(p => p[adjAt] === toks[adjAt]);
    const nounOk = accepted.some(p => p[nounAt] === toks[nounAt]);
    if (item.kind === 'poss3' && adjOk && nounOk) {
      const owner = [0, 1, 2, 3, 4, 5, 6].find(o => ['m', 'f', 'n'].some(g => ['sg', 'pl'].some(n => srPoss(o, g, n) === toks[0])));
      return owner != null && owner !== item.detail ? 'possessive' : 'adjagree';
    }
    if (item.kind === 'cmp' && nounOk && has(srAllAdj(adj), toks[0])) return 'comparative';
    if (nounOk && !adjOk && has(srAllAdj(adj), toks[adjAt])) {
      if (item.kind === 'agree' && srAdjCase(adj, noun, item.num, FRAMES[item.detail].c).animAcc
          && alts(words(adj.sr.m)[0]).includes(toks[adjAt])) return 'animacy';
      return 'adjagree';
    }
    if (adjOk && !nounOk && has(srAllNoun(noun), toks[nounAt])) return 'nounform';
    if (!adjOk && !nounOk && has(srAllAdj(adj), toks[adjAt]) && has(srAllNoun(noun), toks[nounAt])) return 'case';
    return null;
  }

  // Macedonian
  const defs = adj.mk.def ? words(adj.mk.def) : [], forms = words(adj.mk.forms);
  const nounDef = [noun.mk.def, noun.mk.plDef].filter(Boolean);
  const nounAt = toks.length - 1;
  if (item.kind === 'cmp') return /^(нај|по)/.test(toks[0]) ? 'comparative' : has(forms, toks[0]) ? 'comparative' : null;
  if (has(nounDef, toks[nounAt])) return 'artplace';                                   // нов компјутерот
  if (item.kind === 'art') {
    if (has(forms, toks[0])) return 'article';                                            // нов компјутер
    if (has(defs, toks[0]) && toks[0] !== exp[0]) return 'adjagree';
  }
  if (item.kind === 'indef') {
    if (has(defs, toks[0])) return 'article';
    if (has(forms, toks[0]) && toks[0] !== exp[0]) return 'adjagree';
  }
  if (item.kind === 'poss3') {
    if (has(defs, toks[1])) return 'artplace';                                          // мојот новиот компјутер
    const possRow = [0, 1, 2, 3, 4, 5, 6].find(o => [0, 1, 2, 3].some(i => mkPoss(o, ['m', 'f', 'n', 'pl'][i], i === 3 ? 'pl' : 'sg') === toks[0]));
    if (possRow != null && possRow !== item.detail) return 'possessive';
    if (possRow == null && MK_PLAIN_POSS.includes(toks[0])) return 'article';             // мој нов компјутер
    if (toks[0] !== exp[0] || (has(forms, toks[1]) && toks[1] !== exp[1])) return 'adjagree';
  }
  return null;
}

export function checkAdj(item, rawAnswer, { lenient }) {
  const accepted = adjForms(item);
  const expected = accepted[0];
  const ans = prepare(item, rawAnswer);
  if (!ans) return { result: 'wrong', error: 'blank', expected, accepted };
  if (accepted.includes(ans)) return { result: 'correct', error: null, expected, accepted };
  if (accepted.some(f => loose(f) === loose(ans)))
    return { result: lenient ? 'close' : 'wrong', error: 'diacritics', expected, accepted };
  const otherScript = item.lang === 'sr' ? /[а-яѓђѕјљњќћџ]/.test(ans) : /[a-zčćšžđ]/.test(ans);
  if (otherScript && accepted.some(f => skeleton(f) === skeleton(ans))) return { result: 'wrong', error: 'script', expected, accepted };
  const error = classifyAdj(item, ans, expected) || (Math.min(...accepted.map(f => editDistance(f, ans))) <= 3 ? 'spelling' : 'other');
  return { result: 'wrong', error, expected, accepted };
}

// ---------- skills, hints, names ----------

export function adjSkills(item) {
  const adj = ADJ_BY_ID[item.adjId];
  const ag = item.ag || agOf(item, NOUN_BY_ID[item.nounId]);
  const stem = `astem|${item.lang}|${item.adjId}`;
  if (item.lang === 'sr') {
    const gk = ag.replace('*', ''), animAcc = ag.endsWith('*');
    if (item.kind === 'agree') {
      const c = animAcc ? 1 : FRAMES[item.detail].c;
      return [`aend|sr|${CASES[c]}|${gk}|${isSoft(adj) ? 's' : 'h'}`, stem, ...(animAcc ? ['aanim|sr|m'] : [])];
    }
    if (item.kind === 'cmp') return ['acmp|sr', stem];
    return [`aagr|sr|${gk}`, `aposs|sr|${item.detail}`, stem];
  }
  const gn = ag;
  if (item.kind === 'art') return [`aart|mk|art|${gn}`, stem];
  if (item.kind === 'indef') return [`aagr|mk|${gn}`, stem];
  if (item.kind === 'cmp') return ['acmp|mk', stem];
  return ['aart|mk|poss', `aposs|mk|${item.detail}`, `aagr|mk|${gn}`, stem];
}

export function adjBlame(item, err) {
  const main = item.lang === 'sr' ? (item.kind === 'agree' ? 'aend' : item.kind === 'cmp' ? 'acmp' : 'aagr')
    : item.kind === 'cmp' ? 'acmp' : item.kind === 'indef' ? 'aagr' : 'aart';
  return {
    adjagree: item.lang === 'sr' && item.kind === 'agree' ? 'aend' : 'aagr', animacy: 'aanim', nounform: main, case: 'aend',
    artplace: 'aart', article: 'aart', possessive: 'aposs', comparative: 'acmp', incomplete: main, diacritics: 'astem',
  }[err] || null;
}

const GK_NAMES = { m: 'masculine', f: 'feminine', n: 'neuter', plM: 'masculine plural', plF: 'feminine plural', plN: 'neuter plural', pl: 'plural' };
export function adjSkillName(key) {
  const [k, lang, a, b, c] = key.split('|');
  switch (k) {
    case 'aend': return `adjective ${CASE_NAMES[CASES.indexOf(a)]} · ${GK_NAMES[b]} · ${c === 's' ? 'soft (-eg)' : 'hard (-og)'}`;
    case 'aanim': return 'adjective with an animate masculine object (novog profesora)';
    case 'aagr': return `adjective agreement · ${GK_NAMES[a]}`;
    case 'aart': return a === 'poss' ? 'article on the possessive (мојот нов компјутер)' : `article on the adjective · ${GK_NAMES[b]} (новиот компјутер)`;
    case 'aposs': return `possessive · ${OWNERS[a]}`;
    case 'acmp': return lang === 'sr' ? 'comparative (bolji, veći)' : 'comparative по- (по-голем)';
    case 'astem': return `adjective · ${ADJ_BY_ID[a] ? adjBase(ADJ_BY_ID[a], lang) : a}`;
  }
  return key;
}
export const ADJ_SKILL_KINDS = {
  aend: 'Adjective endings', aanim: 'Animate accusative', aagr: 'Agreement', aart: 'Article placement',
  aposs: 'Possessive + adjective', acmp: 'Comparatives', astem: 'Adjectives',
};

export function adjHint(item) {
  const noun = NOUN_BY_ID[item.nounId];
  if (item.lang === 'sr') {
    const [g, n] = agreeSR(noun, item.num);
    const anim = noun.sr.anim && g === 'm' ? ' · animate' : '';
    if (item.kind === 'cmp') return `${GK_NAMES[gKey(g, n)]} noun · comparatives are soft: veći → veća, veće`;
    return `${GK_NAMES[gKey(g, n)]} noun${anim} · the adjective copies its gender, number and case`;
  }
  const g = ['m', 'f', 'n', 'pl'][mkIdx(noun, item.num)];
  if (item.kind === 'cmp') return `${GK_NAMES[g]} · по- + the adjective`;
  if (item.kind === 'indef') return `${GK_NAMES[g]} noun · no article`;
  return `${GK_NAMES[g]} noun · the article goes on the first word only`;
}

export const adjNote = item => ADJ_BY_ID[item.adjId]?.note || '';

// English plural for the prompt (children, people, teeth…).
const EN_IRREGULAR = { child: 'children', 'person': 'people', man: 'men', woman: 'women', tooth: 'teeth', 'leg': 'legs',
  wife: 'wives', life: 'lives', aunt: 'aunts', 'data': 'data', 'money': 'money' };
function pluralEn(w) {
  if (EN_IRREGULAR[w]) return EN_IRREGULAR[w];
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x)$/.test(w)) return w + 'es';
  return w + 's';
}

export function adjEnglish(item) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const a = first(adj.en);
  const n = noun ? (item.num === 'pl' ? pluralEn(first(noun.en)) : first(noun.en)) : '…';
  if (item.kind === 'cmp') return `more ${a} ${n} (comparative)`;
  if (item.kind === 'poss3') return `${OWNERS[item.detail]} ${a} ${n}`;
  if (item.kind === 'art') return `the ${a} ${n}`;
  if (item.kind === 'indef') return item.num === 'pl' ? `${a} ${n}` : `a ${a} ${n}`;
  return `${a} ${n}`;
}

export function adjLabel(item) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const base = noun ? (item.lang === 'sr' ? srBase(noun) : mkBase(noun)) : '';
  const pl = item.num === 'pl' ? ' · plural' : '';
  if (item.kind === 'agree') return `${frameText({ ...item })} (${adjBase(adj, item.lang)} · ${base})${pl}`;
  if (item.kind === 'cmp') return `comparative · ${adjBase(adj, item.lang)} ${base}`;
  return adjEnglish(item);
}

export const adjGroup = item => item.kind;
