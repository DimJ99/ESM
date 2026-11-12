// Noun prompts, checking and skills.
//   Serbian: case frames — the trigger, not the case name ("idem u ___ (prodavnica)"),
//   counting (2–4 vs 5+) and possessives (moja sestra).
//   Macedonian: articles (-от / -ов / -он), plurals, counted forms (два стола) and
//   ownership (сестра ми vs моите пријатели).
// A noun item: { mod: 'noun', lang, nounId, kind, detail, num } — detail is the frame
// (SR case), the count rule, the owner (0–6) or the article (def / prox / dist).
import { NOUNS, NOUN_BY_ID } from './nouns.js';
import { normalize, loose, skeleton, editDistance } from './engine.js';

export { NOUNS, NOUN_BY_ID };

const words = s => s.split(' ');

export const CASES = ['nom', 'gen', 'dat', 'acc', 'voc', 'ins', 'loc'];
export const CASE_NAMES = ['nominativ', 'genitiv', 'dativ', 'akuzativ', 'vokativ', 'instrumental', 'lokativ'];

export const PEOPLE = new Set(['mother', 'father', 'parent', 'brother', 'sister', 'son', 'daughter', 'grandmother', 'grandfather',
  'uncle', 'aunt', 'cousin', 'husband', 'wife', 'child', 'friend', 'girlfriend', 'boyfriend', 'man', 'woman', 'person',
  'neighbor', 'boss', 'teacher', 'professor', 'doctor', 'student', 'dog']);
export const PLACES = new Set(['apartment', 'room', 'kitchen', 'bathroom', 'city', 'village', 'street', 'store', 'market', 'school',
  'university', 'church', 'hospital', 'office', 'restaurant', 'cafe', 'bank', 'park', 'gym', 'job', 'match', 'trip']);
const NA = new Set(['street', 'market', 'university', 'job', 'match', 'trip']);   // na pijacu / na poslu, not u

// Serbian frames: the trigger that picks the case. who / place / thing limit which nouns fit.
export const FRAMES = {
  nom:   { c: 0, sg: 'ovo je ___', pl: 'ovo su ___', en: 'this is … / these are …' },
  nema:  { c: 1, sg: 'nema ___', pl: 'nema ___', en: 'there is no …' },
  bez:   { c: 1, sg: 'bez ___', pl: 'bez ___', en: 'without …' },
  iz:    { c: 1, sg: 'dolazim {iz} ___', place: true, en: 'coming from … (origin)' },
  dat:   { c: 2, sg: 'dajem poklon ___', pl: 'dajem poklon ___', who: true, en: 'giving a present to …' },
  vidim: { c: 3, sg: 'vidim ___', pl: 'vidim ___', en: 'I see …' },
  idem:  { c: 3, sg: 'idem {u} ___', place: true, en: 'going to … (motion)' },
  voc:   { c: 4, sg: 'zdravo, ___!', pl: 'zdravo, ___!', who: true, en: 'greeting … directly' },
  sa:    { c: 5, sg: 'razgovaram sa ___', pl: 'razgovaram sa ___', who: true, en: 'talking with …' },
  s:     { c: 5, sg: 'sa ___', pl: 'sa ___', thing: true, en: 'with … (together with)' },
  u:     { c: 6, sg: '{u} ___ sam', place: true, en: 'being in / at … (location)' },
  o:     { c: 6, sg: 'pričam o ___', pl: 'pričam o ___', en: 'talking about …' },
};
const MOTION = new Set(['idem', 'u']);

export function frameText(item) {
  const f = FRAMES[item.detail];
  return f[item.num].replace('{u}', NA.has(item.nounId) ? 'na' : 'u').replace('{iz}', NA.has(item.nounId) ? 'sa' : 'iz');
}

// ---------- Serbian forms ----------

export const srSlot = (noun, num, c) => noun.sr[num] ? words(noun.sr[num])[c].split('/') : null;
export const srBase = noun => noun.sr.sg ? srSlot(noun, 'sg', 0)[0] : srSlot(noun, 'pl', 0)[0];

// Declension class: m (grad), am (deda, komšija), f (žena), i (noć, stvar), n (selo)
export function srClass(noun) {
  const { g } = noun.sr;
  if (g === 'n') return 'n';
  const nom = srBase(noun);
  if (g === 'f') return !noun.sr.sg || nom.endsWith('a') ? 'f' : 'i';
  return noun.sr.sg && nom.endsWith('a') ? 'am' : 'm';
}
export const CLASS_NAMES = {
  m: 'masculine', am: 'masculine in -a (deda, komšija)', f: 'feminine in -a', i: 'feminine i-stem (noć, stvar)', n: 'neuter',
};

// Possessives: my your his her our your(pl) their
export const OWNERS = ['my', 'your', 'his', 'her', 'our', 'your (pl)', 'their'];
export const OWNER_PERSON = [0, 1, 2, 2, 3, 4, 5];       // for the pronoun colours
const SR_POSS = ['moj', 'tvoj', 'njegov', 'njen', 'naš', 'vaš', 'njihov'];
const SOFT = new Set(['moj', 'tvoj', 'naš', 'vaš']);
// plurals that agree differently: braća / deca like a feminine singular, oči / uši feminine plural
const SR_PL_AGREE = { brother: ['f', 'sg'], child: ['f', 'sg'], eye: ['f', 'pl'], ear: ['f', 'pl'] };
export const agreeSR = (noun, num) => (num === 'pl' && SR_PL_AGREE[noun.id]) || [noun.sr.g, num];

export function srPoss(owner, g, num) {
  const st = SR_POSS[owner];
  if (num === 'pl') return st + { m: 'i', f: 'e', n: 'a' }[g];
  return st + { m: '', f: 'a', n: SOFT.has(st) ? 'e' : 'o' }[g];
}

// Counting: 2–4 + masc/neut = genitive singular (dva grada); feminine and masculine -a
// nouns take the nominative plural (dve kuće, dva dede); 5+ = genitive plural (pet gradova).
const NO_COUNT_SR = new Set(['child', 'evening', 'time']);   // dvoje dece; veče and vreme don't count simply
const countRule = (noun, detail) => detail === '5' ? '5' : ['f', 'i', 'am'].includes(srClass(noun)) ? '24f' : '24m';
function srCountForms(noun, rule) {
  if (rule === '5') return srSlot(noun, 'pl', 1);
  return rule === '24f' ? srSlot(noun, 'pl', 0) : srSlot(noun, 'sg', 1);
}
const NUMS = {
  sr: { 2: 'dva', 3: 'tri', 4: 'četiri', 5: 'pet', 6: 'šest', 10: 'deset' },
  mk: { 2: 'два', 3: 'три', 4: 'четири', 5: 'пет', 6: 'шест', 10: 'десет' },
};
const NUM_WORDS = new Set(['dva', 'dve', 'tri', 'četiri', 'cetiri', 'pet', 'šest', 'sest', 'deset',
  'два', 'две', 'двајца', 'три', 'тројца', 'четири', 'четворица', 'пет', 'петмина', 'шест', 'десет']);
export function numberWord(item) {
  const noun = NOUN_BY_ID[item.nounId];
  if (item.n !== 2) return NUMS[item.lang][item.n];
  return item.lang === 'sr' ? (noun.sr.g === 'f' ? 'dve' : 'dva') : (noun.mk.g === 'm' ? 'два' : 'две');
}

// The numeral shown for a counting prompt is picked per card (2/3/4 or 5/6/10).
export function withNumber(item) {
  if (item.kind !== 'count' || item.n) return item;
  const choices = item.detail === '5' ? [5, 6, 10] : item.detail === '24' ? [2, 3, 4] : [2, 3, 4, 5];
  return { ...item, n: choices[Math.floor(Math.random() * choices.length)] };
}

// ---------- Macedonian forms ----------

// Proximal / distal: swap the т of the article for в / н (градот → градов / градон)
// (the т is last in -от, second to last in -та / -то / -те)
const swapArt = (w, ch) => w.endsWith('т') ? w.slice(0, -1) + ch : w.slice(0, -2) + ch + w.slice(-1);
export function mkArticle(noun, art, num) {
  const base = num === 'pl' ? noun.mk.plDef : noun.mk.def;
  if (!base) return null;
  return art === 'def' ? base : swapArt(base, art === 'prox' ? 'в' : 'н');
}
export const ART_NAMES = { def: 'the …', prox: 'this … (here)', dist: 'that … (there)' };
const MK_POSS = [
  ['мојот', 'мојата', 'моето', 'моите'], ['твојот', 'твојата', 'твоето', 'твоите'],
  ['неговиот', 'неговата', 'неговото', 'неговите'], ['нејзиниот', 'нејзината', 'нејзиното', 'нејзините'],
  ['нашиот', 'нашата', 'нашето', 'нашите'], ['вашиот', 'вашата', 'вашето', 'вашите'],
  ['нивниот', 'нивната', 'нивното', 'нивните'],
];
const MK_CLITIC = ['ми', 'ти', 'му', 'ѝ', 'ни', 'ви', 'им'];
export const mkPoss = (owner, g, num) => MK_POSS[owner][num === 'pl' || g === 'pl' ? 3 : { m: 0, f: 1, n: 2 }[g]];
export const mkBase = noun => noun.mk.sg || noun.mk.pl;

// ---------- prompts ----------

const has = (noun, lang, num) => !!noun[lang]?.[num];

// kinds: case (SR frames), art (MK articles + plurals), count, own.
// twinOnly: just the constructions both languages share (possessives, counting, plurals).
export function buildNounPool({ langs, nounKinds = ['case', 'art', 'count', 'own'], twinOnly = false }) {
  const pool = [];
  const push = it => pool.push({ mod: 'noun', ...it });
  for (const lang of langs) for (const noun of NOUNS) {
    const d = noun[lang];
    if (!d) continue;
    const nums = ['sg', 'pl'].filter(n => has(noun, lang, n));
    const base = { lang, nounId: noun.id };
    if (lang === 'sr') {
      if (!twinOnly && nounKinds.includes('case')) {
        for (const [fid, f] of Object.entries(FRAMES)) {
          if ((f.who && !PEOPLE.has(noun.id)) || (f.thing && PEOPLE.has(noun.id)) || (f.place && !PLACES.has(noun.id))) continue;
          for (const num of nums) if (f[num]) push({ ...base, kind: 'case', detail: fid, num });
        }
      }
      if (twinOnly && (nounKinds.includes('case') || nounKinds.includes('art')) && d.sg && d.pl)
        push({ ...base, kind: 'case', detail: 'nom', num: 'pl' });      // twin of the MK plural
      if (nounKinds.includes('count') && d.sg && d.pl && !NO_COUNT_SR.has(noun.id))
        for (const rule of ['24', '5']) push({ ...base, kind: 'count', detail: rule, num: 'pl' });
    } else {
      if (!twinOnly && nounKinds.includes('art'))
        for (const art of ['def', 'prox', 'dist']) for (const num of nums) push({ ...base, kind: 'art', detail: art, num });
      if ((nounKinds.includes('art') || (twinOnly && nounKinds.includes('case'))) && d.sg && d.pl)
        push({ ...base, kind: 'pl', detail: '', num: 'pl' });
      if (nounKinds.includes('count') && d.pl && d.g !== 'pl') push({ ...base, kind: 'count', detail: 'n', num: 'pl' });
    }
    if (nounKinds.includes('own')) for (let o = 0; o < OWNERS.length; o++) for (const num of nums) push({ ...base, kind: 'own', detail: o, num });
  }
  return pool;
}

// The matching prompt in the other language, for twin mode.
export function nounTwin(item) {
  const noun = NOUN_BY_ID[item.nounId];
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  if (!noun[other]) return null;
  const base = { mod: 'noun', lang: other, nounId: item.nounId };
  if (item.kind === 'own') return has(noun, other, item.num) ? { ...base, kind: 'own', detail: item.detail, num: item.num } : null;
  if (item.kind === 'count') {
    if (other === 'sr') {
      if (!noun.sr.sg || !noun.sr.pl || NO_COUNT_SR.has(noun.id)) return null;
      return { ...base, kind: 'count', detail: item.n >= 5 ? '5' : '24', num: 'pl', n: item.n };
    }
    return noun.mk.pl && noun.mk.g !== 'pl' ? { ...base, kind: 'count', detail: 'n', num: 'pl', n: item.n } : null;
  }
  if (item.kind === 'case' && item.detail === 'nom' && item.num === 'pl')
    return noun.mk.sg && noun.mk.pl ? { ...base, kind: 'pl', detail: '', num: 'pl' } : null;
  if (item.kind === 'pl') return noun.sr.sg && noun.sr.pl ? { ...base, kind: 'case', detail: 'nom', num: 'pl' } : null;
  return null;
}

// ---------- answers ----------

export function nounForms(item) {
  const noun = NOUN_BY_ID[item.nounId];
  if (item.lang === 'sr') {
    if (item.kind === 'case') return srSlot(noun, item.num, FRAMES[item.detail].c);
    if (item.kind === 'count') return srCountForms(noun, countRule(noun, item.n >= 5 ? '5' : item.detail === '5' ? '5' : '24'));
    const [g, num] = agreeSR(noun, item.num);
    return srSlot(noun, item.num, 0).map(f => `${srPoss(item.detail, g, num)} ${f}`);
  }
  const mk = noun.mk;
  if (item.kind === 'art') return [mkArticle(noun, item.detail, item.num)];
  if (item.kind === 'pl') return [mk.pl];
  if (item.kind === 'count') return [mk.cnt || mk.pl];
  if (item.num === 'sg' && mk.kin) return [`${mk.sg} ${MK_CLITIC[item.detail]}`];
  return [`${mkPoss(item.detail, mk.g, item.num)} ${item.num === 'pl' ? mk.pl : mk.sg}`];
}

// Strip what the prompt already shows: frame words ("idem u prodavnicu" → "prodavnicu")
// and a leading numeral ("dve kuće" → "kuće"). A wrong numeral (dva kuće) is remembered.
function prepare(item, raw) {
  let toks = normalize(raw).split(' ').filter(Boolean);
  let numWrong = false;
  if (item.kind === 'case') {
    const frame = new Set(frameText(item).replace(/[,!]/g, '').split(' ').filter(t => t !== '___'));
    const rest = toks.filter(t => !frame.has(t));
    if (rest.length) toks = rest;
  }
  if (item.kind === 'count' && toks.length > 1 && (NUM_WORDS.has(toks[0]) || /^\d+$/.test(toks[0]))) {
    const w = toks.shift();
    if (!/^\d+$/.test(w) && item.n === 2 && loose(w) !== loose(numberWord(item)) && ['dva', 'dve', 'два', 'две'].includes(w)) numWrong = true;
  }
  return { ans: toks.join(' '), numWrong };
}

function allForms(noun, lang) {
  const d = noun[lang];
  if (!d) return [];
  if (lang === 'sr') return ['sg', 'pl'].flatMap(num => d[num] ? words(d[num]).flatMap(s => s.split('/')) : []);
  const out = [d.sg, d.pl, d.def, d.plDef, d.cnt];
  for (const art of ['prox', 'dist']) for (const num of ['sg', 'pl']) out.push(mkArticle(noun, art, num));
  return out.filter(Boolean);
}

function classifyNoun(item, ans) {
  const noun = NOUN_BY_ID[item.nounId];
  const eq = f => f && (f === ans || loose(f) === loose(ans));
  const expected = nounForms(item)[0];

  if (item.kind === 'own') {
    const toks = ans.split(' ');
    const expToks = expected.split(' ');
    if (item.lang === 'sr' && toks.length === 2) {
      const [p, n] = toks;
      const nounOk = srSlot(noun, item.num, 0).some(f => eq(f) || f === n || loose(f) === loose(n));
      if (nounOk && p !== expToks[0]) {
        const stem = SR_POSS.findIndex(st => loose(p).startsWith(loose(st)) && p.length - st.length <= 1);
        return stem >= 0 && stem !== item.detail ? 'possessive' : 'agreement';
      }
    }
    if (item.lang === 'mk') {
      const mk = noun.mk;
      const nounForms = [mk.sg, mk.pl, mk.def, mk.plDef].filter(Boolean);
      const kinStyle = toks.length === 2 && nounForms.some(f => eq(f) || f === toks[0]) && MK_CLITIC.some(c => loose(c) === loose(toks[1]));
      const possStyle = toks.length === 2 && MK_POSS.flat().some(p => p === toks[0]);
      const kinWanted = item.num === 'sg' && mk.kin;
      if ((kinWanted && possStyle) || (!kinWanted && kinStyle)) return 'ownership';
      if (possStyle && !kinWanted) {
        const owner = MK_POSS.findIndex(row => row.includes(toks[0]));
        if (owner !== item.detail) return 'possessive';
        if (toks[0] !== expToks[0]) return 'agreement';
        if ([mk.def, mk.plDef].some(f => f === toks[1])) return 'article';   // мојот телефонот
      }
      if (kinStyle && kinWanted && MK_CLITIC[item.detail] !== toks[1]) return 'possessive';
    }
  }

  if (item.lang === 'sr' && item.kind !== 'own') {
    const cells = [];
    for (const num of ['sg', 'pl']) if (noun.sr[num]) for (let c = 0; c < 7; c++) cells.push({ num, c, forms: srSlot(noun, num, c) });
    const hits = cells.filter(cell => cell.forms.some(eq));
    if (hits.length) {
      if (item.kind === 'count') return 'counting';
      const target = FRAMES[item.detail].c;
      const sameNum = hits.filter(h => h.num === item.num);
      if (sameNum.length) {
        if (MOTION.has(item.detail) && sameNum.some(h => h.c === 3 || h.c === 6)) return 'motion';
        if (target === 3 && item.num === 'sg' && noun.sr.g === 'm' && srClass(noun) === 'm' && sameNum.some(h => h.c === 0 || h.c === 1)) return 'animacy';
        return 'case';
      }
      return hits.some(h => h.c === target) ? 'number' : 'case';
    }
  }

  if (item.lang === 'mk' && item.kind !== 'own') {
    const mk = noun.mk;
    const labelled = [['sg', mk.sg], ['pl', mk.pl], ['sg', mk.def], ['pl', mk.plDef], ['cnt', mk.cnt]];
    for (const art of ['prox', 'dist']) for (const num of ['sg', 'pl']) labelled.push([num, mkArticle(noun, art, num)]);
    const hit = labelled.find(([, f]) => eq(f));
    if (hit) {
      if (item.kind === 'count') return 'counted';
      if (hit[0] === 'cnt') return item.kind === 'pl' ? 'plural' : 'number';   // стола for столови
      if (item.kind === 'pl') return hit[0] === 'pl' ? 'article' : 'number';
      return hit[0] !== item.num ? 'number' : 'article';
    }
    if (item.kind === 'pl' && mk.pl && editDistance(ans, mk.pl) <= 3) return 'plural';
  }

  // bleed: the other language's word, in either script (kniga ≈ книга)
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  const last = ans.split(' ').pop();
  const sks = [skeleton(ans), skeleton(last)];
  const ownLike = allForms(noun, item.lang).some(f => sks.includes(skeleton(f)));
  if (!ownLike && allForms(noun, other).some(f => f === ans || f === last || sks.includes(skeleton(f)))) return 'bleed';
  return null;
}

export function checkNoun(item, rawAnswer, { lenient }) {
  const accepted = nounForms(item);
  const expected = accepted[0];
  const { ans, numWrong } = prepare(item, rawAnswer);
  if (!ans) return { result: 'wrong', error: 'blank', expected, accepted };
  if (accepted.includes(ans)) return numWrong
    ? { result: 'wrong', error: 'agreement', expected, accepted }
    : { result: 'correct', error: null, expected, accepted };
  if (accepted.some(f => loose(f) === loose(ans)))
    return { result: lenient ? 'close' : 'wrong', error: 'diacritics', expected, accepted };
  const otherScript = item.lang === 'sr' ? /[а-яѓђѕјљњќћџ]/.test(ans) : /[a-zčćšžđ]/.test(ans);
  if (otherScript && accepted.some(f => skeleton(f) === skeleton(ans))) return { result: 'wrong', error: 'script', expected, accepted };
  const error = classifyNoun(item, ans) || (Math.min(...accepted.map(f => editDistance(f, ans))) <= 2 ? 'spelling' : 'other');
  return { result: 'wrong', error, expected, accepted };
}

// ---------- hints, skills, names ----------

const GENDER_NAMES = {
  sr: { m: 'muški rod', f: 'ženski rod', n: 'srednji rod' },
  mk: { m: 'машки род', f: 'женски род', n: 'среден род', pl: 'само множина' },
};
export function nounHint(item) {
  const noun = NOUN_BY_ID[item.nounId];
  if (item.lang === 'sr') {
    const g = noun.sr.g;
    return { g, text: `${GENDER_NAMES.sr[g]} · ${CLASS_NAMES[srClass(noun)]}${noun.sr.anim ? ' · animate' : ''}` };
  }
  const g = noun.mk.g;
  return { g: g === 'pl' ? null : g, text: `${GENDER_NAMES.mk[g]}${noun.mk.kin ? ' · close family (сестра ми)' : ''}` };
}

export function nounSkills(item) {
  const noun = NOUN_BY_ID[item.nounId];
  const stem = `nstem|${item.lang}|${item.nounId}`;
  if (item.lang === 'sr') {
    const cls = srClass(noun);
    if (item.kind === 'case') {
      const c = FRAMES[item.detail].c;
      const out = [`ncase|sr|${CASES[c]}|${item.num}|${cls}`, stem];
      if (c === 3 && item.num === 'sg' && noun.sr.g === 'm' && cls === 'm') out.push(`nanim|sr|${noun.sr.anim ? 'a' : 'i'}`);
      if (MOTION.has(item.detail)) out.push(`nmot|sr|${CASES[c]}`);
      return out;
    }
    if (item.kind === 'count') return [`ncnt|sr|${countRule(noun, item.detail)}`, stem];
    const [g, num] = agreeSR(noun, item.num);
    return [`nown|sr|${g}|${num}`, `nposs|sr|${item.detail}`, stem];
  }
  const mk = noun.mk;
  const pl = mk.sg && item.num === 'pl' ? [`npl|mk|${item.nounId}`] : [];
  if (item.kind === 'art') return [`nart|mk|${item.detail}|${item.num}|${mk.g}`, ...pl, stem];
  if (item.kind === 'pl') return [`npl|mk|${item.nounId}`, stem];
  if (item.kind === 'count') return [`ncnt|mk|${mk.cnt ? 'cnt' : 'pl'}`, ...(mk.cnt ? [] : pl), stem];
  return [`nown|mk|${item.num === 'sg' && mk.kin ? 'kin' : 'poss'}|${item.num}`, `nposs|mk|${item.detail}`, ...pl, stem];
}

// Which skill kind a decoded noun mistake points at.
export const NOUN_BLAME = {
  case: 'ncase', animacy: 'nanim', motion: 'nmot', counting: 'ncnt', counted: 'ncnt',
  agreement: 'nown', ownership: 'nown', possessive: 'nposs', article: 'nart', plural: 'npl', diacritics: 'nstem',
};
export const nounNumberBlame = item => item.lang === 'sr' ? 'ncase' : item.kind === 'art' ? 'nart' : 'npl';

const NUM_NAME = { sg: 'singular', pl: 'plural' };
const G_NAME = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural-only' };
export function nounSkillName(key) {
  const [k, lang, a, b, c] = key.split('|');
  switch (k) {
    case 'ncase': return `${CASE_NAMES[CASES.indexOf(a)]} ${NUM_NAME[b]} · ${CLASS_NAMES[c]}`;
    case 'nanim': return a === 'a' ? 'animate masculine accusative (vidim brata)' : 'inanimate masculine accusative (vidim grad)';
    case 'nmot': return a === 'acc' ? 'motion: u / na + akuzativ (idem u prodavnicu)' : 'location: u / na + lokativ (u prodavnici sam)';
    case 'ncnt': return {
      '24m': '2–4 + masculine / neuter → genitive singular (dva grada)',
      '24f': '2–4 + feminine → nominative plural (dve kuće)',
      5: '5 and up → genitive plural (pet gradova)',
      cnt: 'counted plural (два стола)', pl: 'counting with the plural (две куќи)',
    }[a];
    case 'nown': return lang === 'sr' ? `possessive agreement · ${G_NAME[a]} ${NUM_NAME[b]} (${srPoss(0, a, b)})`
      : a === 'kin' ? 'ownership · close family (сестра ми)' : `ownership · мој + article (${b === 'pl' ? 'моите' : 'мојот'} …)`;
    case 'nposs': return `possessive · ${OWNERS[a]} (${lang === 'sr' ? SR_POSS[a] : MK_POSS[a][0]})`;
    case 'nart': return `article · ${ART_NAMES[a]} ${G_NAME[c]} ${NUM_NAME[b]}`;
    case 'npl': return `plural · ${NOUN_BY_ID[a] ? mkBase(NOUN_BY_ID[a]) : a}`;
    case 'nstem': {
      const n = NOUN_BY_ID[a];
      return `noun · ${n ? (lang === 'sr' ? srBase(n) : mkBase(n)) : a}`;
    }
  }
  return key;
}
export const NOUN_SKILL_KINDS = {
  ncase: 'Cases', nanim: 'Animacy', nmot: 'Motion vs location', ncnt: 'Counting', nown: 'Possessives',
  nposs: 'Possessive words', nart: 'Articles', npl: 'Plurals', nstem: 'Noun stems',
};

// Short label for lists and exports.
export function nounLabel(item) {
  const noun = NOUN_BY_ID[item.nounId];
  const base = item.lang === 'sr' ? srBase(noun) : mkBase(noun);
  const pl = item.num === 'pl' ? ' · plural' : '';
  if (item.kind === 'case') return `${frameText(item)} (${base})`;
  if (item.kind === 'count') return `${item.n ?? (item.detail === '5' ? '5+' : item.detail === '24' ? '2–4' : 'n')} × ${base}`;
  if (item.kind === 'own') return `${OWNERS[item.detail]} ${base}${pl}`;
  if (item.kind === 'pl') return `plural · ${base}`;
  return `${ART_NAMES[item.detail]} ${base}${pl}`;
}

export const nounNote = item => NOUN_BY_ID[item.nounId][item.lang]?.note || '';
