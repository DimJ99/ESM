// Conjugation tables, answer checking and mistake classification.
import { VERBS } from './verbs.js';

export const LANGS = {
  sr: { name: 'Srpski', short: 'SR', tag: 'sr-Latn',
        pronouns: [['ja'], ['ti'], ['on', 'ona', 'ono'], ['mi'], ['vi'], ['oni', 'one']],
        en: [['I'], ['you'], ['he', 'she', 'it'], ['we'], ['you all'], ['they', 'they']],
        neg: 'ne',
        hintLabel: 'infinitiv',
        extraKeys: ['č', 'ć', 'š', 'ž', 'đ', 'dž'] },
  mk: { name: 'Македонски', short: 'МК', tag: 'mk',
        pronouns: [['јас'], ['ти'], ['тој', 'таа', 'тоа'], ['ние'], ['вие'], ['тие']],
        en: [['I'], ['you'], ['he', 'she', 'it'], ['we'], ['you all'], ['they']],
        neg: 'не',
        hintLabel: 'речнички облик',
        extraKeys: ['ѓ', 'ќ', 'ѕ', 'љ', 'њ', 'џ', 'ј', 'ќе'] },
};

export const TENSES = {
  pres: { en: 'present', sr: 'prezent', mk: 'сегашно време' },
  past: { en: 'past', sr: 'perfekat', mk: 'минато време' },
  fut:  { en: 'future', sr: 'futur I', mk: 'идно време' },
};

export const ASPECTS = {
  impf: { en: 'imperfective', sr: 'nesvršeni', mk: 'несвршен' },
  pf:   { en: 'perfective', sr: 'svršeni', mk: 'свршен' },
};

export const PERSON_LABELS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
export const GENDER_TAG = { m: 'M', f: 'F', n: 'N' };
export const GENDERS = {
  m: { en: 'masculine', sr: 'muški rod' },
  f: { en: 'feminine', sr: 'ženski rod' },
  n: { en: 'neuter', sr: 'srednji rod' },
};

export const ERROR_TYPES = {
  diacritics: 'Special letters (č ć š ž đ / ѓ ќ ѕ)',
  gender:     'Wrong gender',
  person:     'Wrong person (ja / ti / on…)',
  tense:      'Wrong tense',
  language:   'Mixed up SR ↔ MK',
  auxiliary:  'Missing auxiliary (sam / si / je…)',
  ke:         'Missing ќе',
  negation:   'Negation (ne / nisam / neću / нема да)',
  aspect:     'Wrong aspect (čitao ↔ pročitao)',
  verb:       'Wrong verb',
  spelling:   'Spelling / stem',
  blank:      'Gave up (blank)',
  other:      'Other',
};

export const VERB_BY_ID = Object.fromEntries(VERBS.map(v => [v.id, v]));

const SR_AUX = ['sam', 'si', 'je', 'smo', 'ste', 'su'];
const SR_FUT_AUX = ['ću', 'ćeš', 'će', 'ćemo', 'ćete', 'će'];
const SR_NEG_AUX = ['nisam', 'nisi', 'nije', 'nismo', 'niste', 'nisu'];
const SR_NEG_FUT = ['neću', 'nećeš', 'neće', 'nećemo', 'nećete', 'neće'];
const words = s => s.split(' ');

// Which genders get their own prompt, per person. Only the Serbian past is gendered.
export function gendersFor(lang, tense, person, includeNeuter) {
  if (lang !== 'sr' || tense !== 'past') return [null];
  if (person === 2) return includeNeuter ? ['m', 'f', 'n'] : ['m', 'f'];
  return ['m', 'f'];
}

function srParticiple(sr, person, gender) {
  const [masc, fem] = words(sr.past);
  const stem = fem.slice(0, -1); // "čitala" -> "čital"
  if (person < 3) return gender === 'm' ? masc : gender === 'f' ? fem : stem + 'o';
  return gender === 'f' ? stem + 'e' : stem + 'i';
}

function srFuture(sr, person) {
  const first = sr.fut || (sr.inf.endsWith('ći') ? sr.inf + ' ću' : sr.inf.slice(0, -2) + 'ću');
  return first.slice(0, -2) + SR_FUT_AUX[person];
}

// The Serbian verb for an aspect: the perfective partner shares "se" with the imperfective.
function srVerb(verb, aspect) {
  return aspect === 'pf' ? { ...verb.sr.pf, refl: verb.sr.refl } : verb.sr;
}

// Macedonian perfective past is the aorist (прочитав); imperfective past the imperfect (читав).
function mkVerb(verb, aspect) {
  return aspect === 'pf' ? verb.mk.pf : verb.mk;
}

export function hasLang(verb, lang, aspect = 'impf') {
  if (lang === 'mk') return !!verb.mk && (aspect === 'impf' || !!verb.mk.pf);
  return aspect === 'impf' || !!verb.sr.pf;
}

// Native tense name for the chip — the Macedonian past differs by aspect.
export function tenseLabel(lang, tense, aspect = 'impf') {
  if (lang === 'mk' && tense === 'past') return aspect === 'pf' ? 'минато свршено' : 'минато несвршено';
  return TENSES[tense][lang];
}

// All accepted answers for one cell, primary form first.
// Negation: SR "ne čitam" / "nisam čitao" / "neću čitati" (nisam, nemam, neću fused);
// MK "не читам" / "не читав" / "нема да читам" (нема- fused for има).
// Reflexive: SR "budim se", "budio sam se", but "budio se" (je drops), "neću se buditi";
// MK "се будам", "не се будам", "ќе се будам". Pronoun-first word orders ("ja se budim")
// arrive here with the pronoun stripped, so "se budim" is accepted too.
export function formsFor(verb, lang, tense, person, gender, neg = false, aspect = 'impf') {
  if (lang === 'sr') {
    const sr = srVerb(verb, aspect);
    const r = sr.refl;
    if (tense === 'pres') {
      if (neg) {
        const b = words(sr.pres)[person];
        if (sr.negPres) return [words(sr.negPres)[person]];
        return r ? [`ne ${b} se`, `se ne ${b}`] : ['ne ' + b];
      }
      const out = [words(sr.pres)[person]];
      if (sr.presAlt) out.push(words(sr.presAlt)[person]);
      return r ? out.flatMap(b => [`${b} se`, `se ${b}`]) : out;
    }
    if (tense === 'past') {
      const part = srParticiple(sr, person, gender || 'm');
      const aux = SR_AUX[person], naux = SR_NEG_AUX[person];
      if (neg) return r ? [`${naux} se ${part}`, `se ${naux} ${part}`] : [`${naux} ${part}`];
      if (!r) return [`${part} ${aux}`, `${aux} ${part}`];
      return person === 2 ? [`${part} se`, `se ${part}`] : [`${part} ${aux} se`, `${aux} se ${part}`];
    }
    const se = r ? 'se ' : '';
    if (neg) return r ? [`${SR_NEG_FUT[person]} se ${sr.inf}`, `se ${SR_NEG_FUT[person]} ${sr.inf}`] : [`${SR_NEG_FUT[person]} ${sr.inf}`];
    return [srFuture(sr, person) + (r ? ' se' : ''), `${SR_FUT_AUX[person]} ${se}${sr.inf}`];
  }
  const mk = mkVerb(verb, aspect);
  const se = mk.refl ? 'се ' : '';
  const no = (fused, plain) => neg ? (fused && !se ? words(fused)[person] : 'не ' + se + plain) : se + plain;
  if (tense === 'pres') return [no(mk.negPres, words(mk.pres)[person])];
  if (tense === 'past') return [no(mk.negPast, words(mk.past)[person])];
  return [(neg ? 'нема да ' : 'ќе ') + se + words(mk.fut || mk.pres)[person]];
}

export function hintFor(verb, lang, aspect = 'impf') {
  if (lang === 'sr') {
    const sr = srVerb(verb, aspect);
    return sr.inf + (sr.refl ? ' se' : '');
  }
  const mk = mkVerb(verb, aspect);
  return (mk.refl ? 'се ' : '') + (mk.dict || words(mk.pres)[2]);
}

export function promptFor(verb, aspect = 'impf') {
  return aspect === 'pf' && verb.enPf ? verb.enPf : verb.en;
}

// Every cell of a verb in one language — used for decoding mistakes.
function cellsFor(verb, lang) {
  const out = [];
  for (const aspect of ['impf', 'pf'].filter(a => hasLang(verb, lang, a)))
    for (const tense of Object.keys(TENSES))
      for (let p = 0; p < 6; p++)
        for (const g of gendersFor(lang, tense, p, true))
          for (const neg of [false, true])
            out.push({ lang, tense, person: p, gender: g, neg, aspect,
                       forms: formsFor(verb, lang, tense, p, g, neg, aspect) });
  return out;
}

export function normalize(s) {
  return s.normalize('NFC').toLowerCase()
    .replace(/[.,!?;:"'«»„“”]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const LOOSE = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd', ѓ: 'г', ќ: 'к', ѕ: 'з', ѐ: 'е', ѝ: 'и' };
export function loose(s) {
  return s.replace(/dj/g, 'd').replace(/[čćšžđѓќѕѐѝ]/g, c => LOOSE[c]);
}

// "ja čitam" -> "čitam". Only strips when something follows the pronoun.
function stripPronoun(s, lang) {
  const parts = s.split(' ');
  if (parts.length < 2) return s;
  const all = LANGS[lang].pronouns.flat();
  return all.includes(parts[0]) ? parts.slice(1).join(' ') : s;
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Find which cell (if any) the answer actually belongs to and name the mistake.
function classify(item, ans, match) {
  const verb = VERB_BY_ID[item.verbId];
  const neg = !!item.neg;
  const aspect = item.aspect || 'impf';
  const all = cellsFor(verb, item.lang);
  const allHits = all.filter(c => c.forms.some(f => match(f)));
  // The other aspect of the same verb — "čitao sam" when "pročitao sam" was wanted.
  const own = all.filter(c => c.aspect === aspect);
  const hits = allHits.filter(c => c.aspect === aspect);
  if (!hits.length && allHits.length) return 'aspect';
  const sameCell = c => c.tense === item.tense && c.person === item.person;
  if (item.lang === 'mk' && item.tense === 'fut' && hits.some(c => c.tense === 'pres')) return neg ? 'negation' : 'ke';
  if (hits.some(c => sameCell(c) && c.gender === item.gender)) return 'negation'; // right form, wrong polarity
  if (hits.some(c => sameCell(c) && c.neg === neg)) return 'gender';
  if (hits.some(sameCell)) return 'negation';
  if (hits.some(c => c.tense === item.tense)) return 'person';
  if (hits.length) return 'tense';

  // Negation built the wrong way: "ne čitao sam", "ne ću čitati", "не ќе читам"
  const rest = ans.match(/^(?:ne|не) (.+)$/)?.[1];
  if (neg && rest && own.some(c => !c.neg && c.tense === item.tense &&
      c.forms.some(f => f === rest || loose(f) === loose(rest)))) return 'negation';

  const other = item.lang === 'sr' ? 'mk' : 'sr';
  if (cellsFor(verb, other).some(c => c.forms.some(f => match(f)))) return 'language';

  if (item.lang === 'sr' && item.tense === 'past' && ['m', 'f', 'n'].some(g => {
    const part = srParticiple(verb.sr, item.person, g);
    return match(part) || match('ne ' + part);
  })) return 'auxiliary';

  for (const v of Object.values(VERB_BY_ID)) {
    if (v === verb || !hasLang(v, item.lang, aspect) || v[item.lang].pres === verb[item.lang].pres) continue;
    if (formsFor(v, item.lang, item.tense, item.person, item.gender, neg, aspect).some(f => match(f))) return 'verb';
  }
  return null;
}

// result: 'correct' | 'close' (right apart from special letters, lenient mode) | 'wrong'
export function check(item, rawAnswer, { lenient }) {
  const verb = VERB_BY_ID[item.verbId];
  const accepted = formsFor(verb, item.lang, item.tense, item.person, item.gender, item.neg, item.aspect);
  const expected = accepted[0];
  const ans = stripPronoun(normalize(rawAnswer), item.lang);

  if (!ans) return { result: 'wrong', error: 'blank', expected, accepted };
  if (accepted.includes(ans)) return { result: 'correct', error: null, expected, accepted };
  if (accepted.some(f => loose(f) === loose(ans)))
    return { result: lenient ? 'close' : 'wrong', error: 'diacritics', expected, accepted };

  const error = classify(item, ans, f => f === ans)
    || classify(item, ans, f => loose(f) === loose(ans))
    || (Math.min(...accepted.map(f => editDistance(f, ans))) <= 2 ? 'spelling' : 'other');
  return { result: 'wrong', error, expected, accepted };
}

export function itemKey(item) {
  return `${item.lang}|${item.verbId}|${item.tense}|${item.person}|${item.gender || '-'}${item.neg ? '|neg' : ''}${item.aspect === 'pf' ? '|pf' : ''}`;
}

export function parseKey(key) {
  const [lang, verbId, tense, person, gender, ...flags] = key.split('|');
  return { lang, verbId, tense, person: +person, gender: gender === '-' ? null : gender,
           neg: flags.includes('neg'), aspect: flags.includes('pf') ? 'pf' : 'impf' };
}

// Perfective is drilled in past and future only — a bare perfective present only
// shows up after da / ako (SR) or да / ќе / ако (MK).
export function buildPool({ langs, tenses, polarity, aspects = ['impf', 'pf'], includeNeuter }) {
  const pool = [];
  for (const lang of langs)
    for (const verb of VERBS)
      for (const aspect of aspects)
        if (hasLang(verb, lang, aspect))
          for (const tense of tenses)
            if (aspect === 'impf' || tense !== 'pres')
              for (let p = 0; p < 6; p++)
                for (const g of gendersFor(lang, tense, p, includeNeuter))
                  for (const pol of polarity)
                    pool.push({ lang, verbId: verb.id, tense, person: p, gender: g, neg: pol === 'neg', aspect });
  return pool;
}

// Pronoun shown in the prompt (native + English). Gender-specific in the Serbian
// past; otherwise a random choice for 3rd person so on/ona/ono all show up.
export function pronounFor(item) {
  const L = LANGS[item.lang];
  const opts = L.pronouns[item.person];
  let i = 0;
  if (item.gender) {
    if (item.person === 2) i = { m: 0, f: 1, n: 2 }[item.gender];
    if (item.person === 5) i = item.gender === 'f' ? 1 : 0;
  } else {
    i = Math.floor(Math.random() * opts.length);
  }
  const en = L.en[item.person];
  return { text: opts[i], en: en[Math.min(i, en.length - 1)], tag: item.gender ? GENDER_TAG[item.gender] : '' };
}
