import { LANGS, TENSES, ASPECTS, ERROR_TYPES, GENDER_TAG, GENDERS, VERB_BY_ID, check, formsFor, gendersFor, groupTag, setPrefs, hintFor, promptFor, pronounFor, tenseLabel } from './engine.js';
import * as store from './store.js';
import { buildCheckpoint, summarize, toCSV, CHECKPOINT_SIZE, breakdownKey } from './checkpoint.js';
import { NOUN_BY_ID, CASES, CASE_NAMES, FRAMES, OWNERS, OWNER_PERSON, ART_NAMES, frameText, srBase, mkBase, srSlot,
  mkArticle, nounForms, checkNoun, nounHint, nounNote, nounLabel, nounTwin, withNumber, numberWord } from './nounEngine.js';
import { CONNECTOR_BY_ID, FILLERS, CONN_GROUPS, checkConn, connTwin, connLabel } from './connEngine.js';
import { PERSONAL_BY_ID, POSSESSIVE_BY_ID, DRILL_BY_ID, DRILL_SKILLS, SR_CASES, MK_ROLES, SLOT_NAMES, PERSON_COLOUR,
  checkPron, pronTwin, pronHint, pronNote, pronLabel, pronBase, formRole, pronForms } from './pronEngine.js';
import { ADJ_BY_ID, KIND_NAMES as ADJ_KIND_NAMES, checkAdj, adjTwin, withNoun, adjHint, adjNote, adjLabel, adjEnglish,
  adjBase, adjForms } from './adjEngine.js';
import { agreeSR } from './nounEngine.js';
import { pickNext, skillName, SKILL_KINDS, MASTERED_DAYS, LEECH_LAPSES, TARGET, fastEnough, MODULES, modOf } from './srs.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = x => x == null ? '–' : Math.round(x * 100) + '%';

let state = store.load();
const applyPrefs = () => setPrefs({ srFutDa: !!state.settings.srFutDa });
applyPrefs();
let current = null;   // { item, pronoun }
let answered = false;
let hinted = false;
let recent = [];      // items shown this run, for spacing and variety
let test = null;      // weekly checkpoint in progress: { lang, items, results }
let twinNext = null;  // twin mode: the same prompt in the other language, shown next
let shownAt = 0;      // when the current card appeared, for answer speed

// ---------- practice ----------

const twinMode = () => state.settings.langs.length > 1;
const mod = () => state.settings.module || 'verbs';
const checkItem = (item, raw) => item.mod === 'noun' ? checkNoun(item, raw, state.settings)
  : item.mod === 'conn' ? checkConn(item, raw, state.settings)
  : item.mod === 'pron' ? checkPron(item, raw, state.settings)
  : item.mod === 'adj' ? checkAdj(item, raw, state.settings) : check(item, raw, state.settings);
const blank = '<span class="blank">___</span>';

// Twin mode: one English prompt, answered in both languages back to back. The first
// language alternates; the second card is the same verb, tense, person, polarity and
// (where it exists) aspect, with the pronoun's gender kept the same.
function pickTwin() {
  if (twinNext) {
    const item = twinNext;
    twinNext = null;
    return item;
  }
  const first = Math.random() < 0.5 ? 'sr' : 'mk', second = first === 'sr' ? 'mk' : 'sr';
  // nouns: only the constructions both languages share (possessives, counting, plurals)
  const settings = { ...state.settings, langs: [first], ...((mod() === 'nouns' || mod() === 'adjectives') && { twinOnly: true }) };
  let item = pickNext({ ...state, settings }, recent);
  if (!item) return null;
  if (item.mod) {
    if (item.mod === 'noun') item = withNumber(item);
    if (item.mod === 'adj') item = { ...withNoun(item, true), target: item.target };
    const twin = item.mod === 'noun' ? nounTwin(item) : item.mod === 'pron' ? pronTwin(item)
      : item.mod === 'adj' ? adjTwin(item) : connTwin(item);
    if (twin) {
      twinNext = { ...twin, twin: 2 };
      item.twin = 1;
    }
    return item;
  }
  const verb = VERB_BY_ID[item.verbId];
  if (!verb[second]) return item;
  const aspect = item.aspect === 'pf' && !verb[second].pf ? 'impf' : item.aspect;
  const genders = gendersFor(second, item.tense, item.person, state.settings.includeNeuter);
  // keep "ona" ↔ "таа" across the pair: the Serbian past needs a gender, other cards just show it
  const third = item.person === 2 ? ['m', 'f', ...(state.settings.includeNeuter ? ['n'] : [])] : item.person === 5 ? ['m', 'f'] : [];
  const choices = genders[0] ? genders : third;
  const g = item.gender || (choices.length ? choices[Math.floor(Math.random() * choices.length)] : null);
  item.showGender = g;
  twinNext = { ...item, lang: second, aspect, gender: genders[0] ? g : null, showGender: g, twin: 2, target: undefined };
  item.twin = 1;
  return item;
}

function next() {
  if (test && test.results.length >= test.items.length) return finishTest();
  let item = test ? test.items[test.results.length] : twinMode() ? pickTwin() : pickNext(state, recent);
  if (item?.mod === 'noun') item = withNumber(item);
  if (item?.mod === 'adj' && !item.nounId) item = { ...withNoun(item), target: item.target };
  $('test-result').hidden = true;
  $('card').hidden = !item;
  $('empty').hidden = !!item;
  if (!item) return;
  if (!test) recent = [...recent.slice(-9), item];
  $('card').classList.toggle('testing', !!test);
  renderTestBar();

  current = { item, pronoun: item.mod ? null : pronounFor(item) };
  answered = false;
  hinted = false;

  const lang = LANGS[item.lang];
  const card = $('card');
  card.dataset.lang = item.lang;
  document.body.style.setProperty('--accent', `var(--${item.lang})`);
  $('word').classList.toggle('sentence', item.mod === 'conn' || (item.mod === 'pron' && item.kind === 'drill'));
  $('subword').hidden = !item.mod;
  $('subword').textContent = '';
  if (item.mod === 'noun') renderNounPrompt(item);
  else if (item.mod === 'conn') renderConnPrompt(item);
  else if (item.mod === 'pron') renderPronPrompt(item);
  else if (item.mod === 'adj') renderAdjPrompt(item);
  else renderVerbPrompt(item);
  $('hint-btn').className = 'hint-pill';
  $('hint-btn').textContent = (item.mod === 'noun' ? 'Hint: gender & type' : item.mod === 'conn' ? 'Hint: first letter' : item.mod === 'pron' || item.mod === 'adj' ? 'Hint'
    : item.lang === 'sr' ? 'Hint: show infinitive' : 'Hint: show dictionary form') + (test ? ' (counts as missed)' : '');
  $('feedback').hidden = true;
  $('conj').hidden = true;
  $('hint-btn').disabled = false;
  $('keys').hidden = false;
  $('actions').hidden = false;

  const input = $('answer');
  input.value = '';
  input.readOnly = false;
  input.className = '';
  input.lang = lang.tag;
  input.placeholder = item.lang === 'sr' ? 'napiši oblik…' : 'напиши облик…';
  $('submit').textContent = 'Check';

  $('keys').innerHTML = lang.extraKeys.map(k => `<button type="button" data-k="${k}">${k}</button>`).join('');
  input.focus({ preventScroll: true });
  shownAt = performance.now();
}

const twinChip = item => item.twin && `<span class="chip lang">${LANGS[item.lang].short} · twin ${item.twin}/2</span>`;

function renderVerbPrompt(item) {
  const lang = LANGS[item.lang];
  const verb = VERB_BY_ID[item.verbId];
  const pr = current.pronoun;
  $('chips').innerHTML = [
    twinChip(item),
    `<span class="chip tense" data-tense="${item.tense}"><i class="dot"></i><span class="eng">${TENSES[item.tense].en}</span><small>${tenseLabel(item.lang, item.tense, item.aspect)}</small></span>`,
    `<span class="chip person" data-person="${item.person}"><b class="pron">${esc(pr.text)}</b><span class="eng">${esc(pr.en)}</span></span>`,
    item.gender &&
      `<span class="chip gender" data-g="${item.gender}"><span class="gbadge" data-g="${item.gender}">${pr.tag}</span><span class="eng">${GENDERS[item.gender].en}</span></span>`,
    verb[item.lang]?.pf &&
      `<span class="chip aspect ${item.aspect}"><span class="eng">${ASPECTS[item.aspect].en}</span><small>${ASPECTS[item.aspect][item.lang]}</small></span>`,
    item.neg
      ? `<span class="chip pol neg"><span class="eng">negative</span><b>${lang.neg}</b></span>`
      : `<span class="chip pol pos"><span class="eng">affirmative</span></span>`,
  ].filter(Boolean).join('');
  $('word').textContent = promptFor(verb, item.aspect);
}

// Nouns: Serbian shows the trigger (frame) and the base form, never the case name.
function renderNounPrompt(item) {
  const noun = NOUN_BY_ID[item.nounId];
  const base = esc(item.lang === 'sr' ? srBase(noun) : mkBase(noun));
  const num = item.num && `<span class="chip num"><span class="eng">${item.num === 'pl' ? 'plural' : 'singular'}</span></span>`;
  const kindChip = t => `<span class="chip ctype"><span class="eng">${t}</span></span>`;
  let chips, word, sub;
  if (item.kind === 'case') {
    chips = [num];
    word = esc(frameText(item)).replace('___', blank);
    sub = `(${base} · ${esc(noun.en)})`;
  } else if (item.kind === 'count') {
    chips = [kindChip('counting')];
    word = `${item.n} ${blank}`;
    sub = `(${base} · ${esc(noun.en)})`;
  } else if (item.kind === 'own') {
    chips = [`<span class="chip person" data-person="${OWNER_PERSON[item.detail]}"><b class="pron">${OWNERS[item.detail]}</b><span class="eng">possessive</span></span>`, num];
    word = `${OWNERS[item.detail]} ${blank}`;
    sub = `(${base} · ${esc(noun.en)})`;
  } else if (item.kind === 'pl') {
    chips = [kindChip('plural')];
    word = base;
    sub = esc(noun.en);
  } else {
    chips = [kindChip(ART_NAMES[item.detail]), num];
    word = base;
    sub = esc(noun.en);
  }
  $('chips').innerHTML = [twinChip(item), ...chips].filter(Boolean).join('');
  $('word').innerHTML = word;
  $('subword').innerHTML = sub;
}

// Pronouns: a drill sentence with a gap, a personal pronoun to put in a case / role
// (long or short), or a possessive to agree with a gender and number.
function renderPronPrompt(item) {
  const kindChip = t => `<span class="chip ctype"><span class="eng">${t}</span></span>`;
  let chips, word, sub;
  if (item.kind === 'drill') {
    const d = DRILL_BY_ID[item.pid];
    chips = [kindChip(DRILL_SKILLS[d.skill])];
    word = esc(d[item.lang].frame).replace('___', blank);
    sub = esc(d.prompt);
  } else if (item.kind === 'form') {
    const r = formRole(item);
    const colour = PERSON_COLOUR[item.pid];
    chips = [`<span class="chip person"${colour != null ? ` data-person="${colour}"` : ''}><b class="pron">${esc(pronBase(item))}</b><span class="eng">${esc(PERSONAL_BY_ID[item.pid].en)}</span></span>`,
      kindChip(r.cas), `<span class="chip aspect ${r.type === 'short' ? 'pf' : 'impf'}"><span class="eng">${r.type}</span></span>`];
    word = `${esc(pronBase(item))} → ${blank}`;
    sub = esc(r.role || r.cas);
  } else {
    const p = POSSESSIVE_BY_ID[item.pid];
    const slot = item.lang === 'sr' ? SLOT_NAMES.sr[item.detail]
      : item.detail === 'k' ? 'close family: мајка ___' : SLOT_NAMES.mk[+item.detail[1]];
    const form = item.lang === 'mk' && item.detail !== 'k' ? kindChip(item.detail[0] === 'd' ? 'with article (мојот)' : 'plain (мој)') : null;
    chips = [kindChip(slot), form];
    word = `${esc(p.en)} ${blank}`;
    sub = item.detail === 'k' ? 'after a singular family word' : 'agrees with the noun';
  }
  $('chips').innerHTML = [twinChip(item), ...chips].filter(Boolean).join('');
  $('word').innerHTML = word;
  $('subword').innerHTML = sub;
}

// Adjectives: the whole phrase is the answer (adjective + noun, with the possessive or
// the case frame), so the prompt shows the base words and what to build.
function renderAdjPrompt(item) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const nb = esc(item.lang === 'sr' ? srBase(noun) : mkBase(noun));
  const base = `(${esc(adjBase(adj, item.lang))} · ${nb})`;
  const num = `<span class="chip num"><span class="eng">${item.num === 'pl' ? 'plural' : 'singular'}</span></span>`;
  const kindChip = `<span class="chip ctype"><span class="eng">${ADJ_KIND_NAMES[item.kind]}</span></span>`;
  let chips = [kindChip, num], word;
  if (item.kind === 'agree') {
    chips = [num];
    word = esc(frameText(item)).replace('___', blank);
  } else if (item.kind === 'poss3') {
    chips = [`<span class="chip person" data-person="${OWNER_PERSON[item.detail]}"><b class="pron">${OWNERS[item.detail]}</b><span class="eng">possessive</span></span>`, num];
    word = esc(adjEnglish(item));
  } else {
    word = esc(adjEnglish(item));
  }
  $('chips').innerHTML = [twinChip(item), ...chips].filter(Boolean).join('');
  $('word').innerHTML = word;
  $('subword').innerHTML = item.kind === 'agree' ? `${base} · ${esc(adjEnglish(item))}` : base;
}

// Connectors: the sentence with the gap, the English sentence underneath.
function renderConnPrompt(item) {
  const c = CONNECTOR_BY_ID[item.connId];
  $('chips').innerHTML = [twinChip(item), `<span class="chip ctype"><span class="eng">${CONN_GROUPS[c.group]}</span></span>`].filter(Boolean).join('');
  $('word').innerHTML = esc(c[item.lang].frame).replace('___', blank);
  $('subword').innerHTML = esc(c.prompt);
}

function showHint() {
  if (answered || !current) return;
  hinted = true;
  const { item } = current;
  if (item.mod === 'noun') {
    const h = nounHint(item);
    $('hint-btn').innerHTML = `${h.g ? `<span class="gbadge sm" data-g="${h.g}">${GENDER_TAG[h.g]}</span> ` : ''}${esc(h.text)}`;
  } else if (item.mod === 'pron') {
    $('hint-btn').innerHTML = esc(pronHint(item));
  } else if (item.mod === 'adj') {
    $('hint-btn').innerHTML = esc(adjHint(item));
  } else if (item.mod === 'conn') {
    const c = CONNECTOR_BY_ID[item.connId];
    $('hint-btn').innerHTML = `${esc(c.en)} · starts with <b>${esc(c[item.lang].ans[0])}…</b>`;
  } else {
    const verb = VERB_BY_ID[item.verbId];
    $('hint-btn').innerHTML = `${LANGS[item.lang].hintLabel} · <b>${esc(hintFor(verb, item.lang, item.aspect))}</b> ${groupTag(verb, item.lang, item.aspect)}`;
  }
  $('hint-btn').classList.add('shown');
  $('hint-btn').disabled = true;
  $('answer').focus({ preventScroll: true });
}

function submit(reveal = false) {
  if (!current) return;
  if (answered) return next();

  const raw = reveal ? '' : $('answer').value;
  if (!reveal && !raw.trim()) return shake();

  const outcome = checkItem(current.item, raw);
  const ms = reveal ? null : performance.now() - shownAt;
  let failed = [];
  if (test) {
    // checkpoint: scored here only — nothing goes into practice history or skills
    test.results.push({ item: current.item, ok: outcome.result !== 'wrong' && !hinted,
                        error: outcome.error, hinted, answer: raw.trim(), expected: outcome.expected, ms });
  } else {
    failed = store.record(state, current.item, outcome, raw, hinted, ms);
  }
  const slow = ms != null && outcome.result !== 'wrong' && !fastEnough(ms, outcome.expected);
  answered = true;

  renderSession();

  const cls = { correct: 'good', close: 'close', wrong: 'bad' }[outcome.result];
  const input = $('answer');
  input.className = cls;
  input.readOnly = true;

  const sr = current.item.lang === 'sr';
  const head = {
    correct: sr ? '✓ Tačno!' : '✓ Точно!',
    close: sr ? '≈ Skoro — pazi na slova' : '≈ Речиси — внимавај на буквите',
    wrong: sr ? '✗ Netačno' : '✗ Неточно',
  }[outcome.result];

  const others = outcome.accepted.slice(1).filter(f => f !== outcome.expected);
  const lines = [];
  if (outcome.result !== 'correct' && raw.trim()) lines.push(`You wrote <s>${esc(raw.trim())}</s>`);
  if (others.length) lines.push(`Also accepted: ${others.map(esc).join(', ')}`);
  if (failed.length) lines.push(`Skill to work on: <b>${failed.map(k => esc(skillName(k))).join(', ')}</b>`);
  if (ms != null) lines.push(`⏱ ${(ms / 1000).toFixed(1)} s`);
  const tags = [outcome.error && ERROR_TYPES[outcome.error], hinted && outcome.result === 'correct' && 'Used hint',
                slow && !test && 'Slow — counts, but needs to be faster to master']
    .filter(Boolean).map(t => `<span class="tag">${t}</span>`).join(' ');

  const fb = $('feedback');
  fb.className = 'feedback ' + cls;
  $('fb-head').textContent = head;
  $('fb-answer').innerHTML = answerLine(current.item, outcome.expected);
  $('fb-detail').innerHTML = lines.join('<br>') + (tags ? `<div>${tags}</div>` : '');
  fb.hidden = false;
  $('conj').innerHTML = tableFor(current.item);
  $('conj').hidden = false;

  $('keys').hidden = true;
  $('actions').hidden = true;
  $('submit').textContent = 'Next →';
  if (outcome.result === 'wrong') shake();
  input.focus({ preventScroll: true });
}

// The right answer, shown in its context.
function answerLine(item, expected) {
  const b = `<b>${esc(expected)}</b>`;
  if (item.mod === 'noun') {
    if (item.kind === 'case') return esc(frameText(item)).replace('___', b);
    if (item.kind === 'count') return `${esc(numberWord(item))} ${b}`;
    return b;
  }
  if (item.mod === 'conn') return esc(CONNECTOR_BY_ID[item.connId][item.lang].frame).replace('___', b);
  if (item.mod === 'pron') return item.kind === 'drill' ? esc(DRILL_BY_ID[item.pid][item.lang].frame).replace('___', b) : b;
  if (item.mod === 'adj') return item.kind === 'agree' ? esc(frameText(item)).replace('___', b) : b;
  return `<span class="pron" data-person="${item.person}">${esc(current.pronoun.text)}</span> ${esc(expected)}`;
}

const tableFor = item => item.mod === 'noun' ? nounTable(item) : item.mod === 'conn' ? connInfo(item)
  : item.mod === 'pron' ? pronTable(item) : item.mod === 'adj' ? adjTable(item) : conjTable(item);

// Every form of the noun, the one asked highlighted: Serbian cases × number, Macedonian
// article forms × number, or the possessive for every owner.
function nounTable(item) {
  const noun = NOUN_BY_ID[item.nounId];
  const h = nounHint(item);
  const base = item.lang === 'sr' ? srBase(noun) : mkBase(noun);
  const badge = h.g ? ` <span class="gbadge sm" data-g="${h.g}">${GENDER_TAG[h.g]}</span>` : '';
  const hi = on => on ? ' class="me"' : '';
  const nums = ['sg', 'pl'].filter(n => noun[item.lang][n]);
  const head = `<thead><tr><th></th>${nums.map(n => `<th>${n === 'sg' ? 'singular' : 'plural'}</th>`).join('')}</tr></thead>`;
  let body, extra = '';
  if (item.kind === 'own') {
    body = OWNERS.map((o, i) => `<tr><th><span class="pron" data-person="${OWNER_PERSON[i]}">${o}</span></th>${nums.map(n =>
      `<td${hi(i === item.detail && n === item.num)}>${esc(nounForms({ ...item, detail: i, num: n })[0])}</td>`).join('')}</tr>`).join('');
  } else if (item.lang === 'sr') {
    const asked = item.kind === 'case' ? FRAMES[item.detail].c : -1;
    body = CASES.map((_, c) => `<tr><th>${CASE_NAMES[c]}</th>${nums.map(n =>
      `<td${hi(c === asked && n === item.num)}>${esc(srSlot(noun, n, c).join(' / '))}</td>`).join('')}</tr>`).join('');
    if (item.kind === 'count') {
      const two = nounForms({ ...item, detail: '24', n: 2 })[0], five = nounForms({ ...item, detail: '5', n: 5 })[0];
      extra = `<p class="conj-note">${esc(numberWord({ ...item, n: 2 }))} ${esc(two)} · tri ${esc(two)} · pet ${esc(five)}</p>`;
    }
  } else {
    const mk = noun.mk;
    const rows = [['base', mk.sg, mk.pl, item.kind === 'pl' && 'pl'], ['the', mk.def, mk.plDef, item.kind === 'art' && item.detail === 'def' && item.num],
      ['this', mkArticle(noun, 'prox', 'sg'), mkArticle(noun, 'prox', 'pl'), item.kind === 'art' && item.detail === 'prox' && item.num],
      ['that', mkArticle(noun, 'dist', 'sg'), mkArticle(noun, 'dist', 'pl'), item.kind === 'art' && item.detail === 'dist' && item.num]];
    body = rows.map(([label, sg, pl, on]) => `<tr><th>${label}</th>${nums.map(n =>
      `<td${hi(on === n)}>${esc((n === 'sg' ? sg : pl) || '—')}</td>`).join('')}</tr>`).join('');
    if (mk.pl && mk.g !== 'pl') extra = `<p class="conj-note"${item.kind === 'count' ? ' data-on="1"' : ''}>counting: ${mk.g === 'm' ? 'два' : 'две'} ${esc(mk.cnt || mk.pl)}${mk.cnt ? ' (counted form)' : ''}</p>`;
  }
  const note = nounNote(item);
  return `<div class="conj-title"><b>${esc(base)}</b>${badge} · ${esc(h.text)}</div><table class="nouns ${item.lang}">${head}<tbody>${body}</tbody></table>${extra}` +
    (note ? `<p class="conj-note">${esc(note)}</p>` : '');
}

// Pronouns: every form of that person (long and short), every form of that possessive,
// or the drill sentence in both languages.
function pronTable(item) {
  const note = pronNote(item);
  const tail = note ? `<p class="conj-note">${esc(note)}</p>` : '';
  const hi = on => on ? ' class="me"' : '';
  if (item.kind === 'drill') {
    const d = DRILL_BY_ID[item.pid];
    const row = l => d[l] ? `<tr${l === item.lang ? ' class="me"' : ''}><th>${LANGS[l].short}</th><td>${esc(d[l].frame).replace('___', `<b>${esc(d[l].ans.split('/').join(' / '))}</b>`)}</td></tr>` : '';
    return `<div class="conj-title"><b>${esc(d.prompt)}</b> · ${DRILL_SKILLS[d.skill]}</div><table class="conn"><tbody>${row('sr')}${row('mk')}</tbody></table>${tail}`;
  }
  if (item.kind === 'form') {
    const p = PERSONAL_BY_ID[item.pid];
    let body;
    if (item.lang === 'sr') {
      const L = p.sr.long.split(' '), S = p.sr.short.split(' ');
      body = SR_CASES.map((name, c) => L[c] === '-' && S[c] === '-' ? '' : `<tr><th>${name}</th>
        <td${hi(item.detail === `${c}l`)}>${esc(L[c].replace(/\//g, ' / '))}</td><td${hi(item.detail === `${c}s`)}>${esc(S[c] === '-' ? '—' : S[c].replace(/\//g, ' / '))}</td></tr>`).join('');
    } else {
      body = [['subject', 'nom', null], ['direct object', 'acc', 'accS'], ['indirect object', 'dat', 'datS']].map(([name, l, s]) =>
        `<tr><th>${name}</th><td${hi(item.detail === l)}>${esc((p.mk[l] || '—').replace(/\//g, ' / '))}</td><td${hi(item.detail === s)}>${esc(s ? p.mk[s].replace(/\//g, ' / ') : '—')}</td></tr>`).join('');
    }
    return `<div class="conj-title"><b>${esc(pronBase(item))}</b> · ${esc(p.en)}</div><table class="nouns"><thead><tr><th></th><th>long</th><th>short</th></tr></thead><tbody>${body}</tbody></table>${tail}`;
  }
  const p = POSSESSIVE_BY_ID[item.pid];
  let body;
  if (item.lang === 'sr') {
    const f = p.sr.split(' ');
    body = ['masculine', 'feminine', 'neuter'].map((g, i) =>
      `<tr><th>${g}</th><td${hi(item.detail === i)}>${esc(f[i].replace(/\//g, ' / '))}</td><td${hi(item.detail === i + 3)}>${esc(f[i + 3].replace(/\//g, ' / '))}</td></tr>`).join('');
    body = `<thead><tr><th></th><th>singular</th><th>plural</th></tr></thead><tbody>${body}</tbody>`;
  } else {
    const f = p.mk.forms.split(' '), d = p.mk.def.split(' ');
    body = SLOT_NAMES.mk.map((g, i) => `<tr><th>${g}</th><td${hi(item.detail === `f${i}`)}>${esc(f[i])}</td><td${hi(item.detail === `d${i}`)}>${esc(d[i])}</td></tr>`).join('');
    body = `<thead><tr><th></th><th>plain</th><th>with article</th></tr></thead><tbody>${body}</tbody>`;
    if (p.mk.kin !== '-') body += `<tbody><tr><th>close family</th><td colspan="2"${hi(item.detail === 'k')}>мајка ${esc(p.mk.kin.replace(/\//g, ' / '))}</td></tr></tbody>`;
  }
  return `<div class="conj-title"><b>${esc(p.en)}</b></div><table class="nouns">${body}</table>${tail}`;
}

// The adjective's forms for this noun's gender: Serbian by case (singular / plural),
// Macedonian plain / with the article, with the comparative.
function adjTable(item) {
  const adj = ADJ_BY_ID[item.adjId], noun = NOUN_BY_ID[item.nounId];
  const note = adjNote(item);
  const hi = on => on ? ' class="me"' : '';
  const pretty = s => esc(s.replace(/\//g, ' / '));
  let body, extra;
  if (item.lang === 'sr') {
    const gkOf = num => { const [g, n] = agreeSR(noun, num); return n === 'sg' ? g : 'pl' + g.toUpperCase(); };
    const sg = adj.sr[gkOf('sg')].split(' '), pl = adj.sr[gkOf('pl')].split(' ');
    const anim = item.ag?.endsWith('*');
    const asked = item.kind === 'agree' ? (anim ? 1 : FRAMES[item.detail].c) : 0;
    body = `<thead><tr><th></th><th>singular</th><th>plural</th></tr></thead><tbody>` + CASE_NAMES.map((name, c) =>
      `<tr><th>${name}</th><td${hi(c === asked && item.num === 'sg')}>${pretty(sg[c])}</td><td${hi(c === asked && item.num === 'pl')}>${pretty(pl[c])}</td></tr>`).join('') + `</tbody>`;
    extra = (anim ? `<p class="conj-note">animate masculine accusative = genitive: ${esc(adjForms(item)[0])}</p>` : '') +
      (adj.sr.cmp ? `<p class="conj-note">comparative: ${esc(adj.sr.cmp)}</p>` : '');
  } else {
    const f = adj.mk.forms.split(' '), d = adj.mk.def ? adj.mk.def.split(' ') : null;
    const i = item.ag ? ['m', 'f', 'n', 'pl'].indexOf(item.ag) : 0;
    body = `<thead><tr><th></th><th>plain</th><th>with article</th></tr></thead><tbody>` + ['masculine', 'feminine', 'neuter', 'plural'].map((g, k) =>
      `<tr><th>${g}</th><td${hi(k === i && item.kind !== 'art')}>${esc(f[k])}</td><td${hi(k === i && item.kind === 'art')}>${esc(d ? d[k] : '—')}</td></tr>`).join('') + `</tbody>`;
    const nw = item.num === 'pl' ? noun.mk.pl : noun.mk.sg;
    extra = `<p class="conj-note">${d ? `${esc(d[i])} ${esc(nw)} · ` : ''}мојот / моите … ${esc(f[i])} ${esc(nw)} · по-${esc(f[i])}</p>`;
  }
  return `<div class="conj-title"><b>${esc(adjBase(adj, item.lang))}</b> · ${esc(adjEnglish({ ...item, kind: 'agree' }))}</div><table class="nouns">${body}</table>${extra}` +
    (note ? `<p class="conj-note">${esc(note)}</p>` : '');
}

// The connector in both languages, plus what it does to the grammar after it.
function connInfo(item) {
  const c = CONNECTOR_BY_ID[item.connId];
  const row = l => c[l] ? `<tr${l === item.lang ? ' class="me"' : ''}><th>${LANGS[l].short}</th><td>${esc(c[l].frame).replace('___', `<b>${esc(c[l].ans.split('/').join(' / '))}</b>`)}</td></tr>` : '';
  return `<div class="conj-title"><b>${esc(c.en)}</b> · ${CONN_GROUPS[c.group]}</div><table class="conn"><tbody>${row('sr')}${row('mk')}</tbody></table>` +
    (c.trigger ? `<p class="conj-note">⚙ ${esc(c.trigger)}</p>` : '') + (c.note ? `<p class="conj-note">${esc(c.note)}</p>` : '');
}

// The whole tense just asked — same aspect and polarity, every person — so the
// pattern is visible even when the logic was right and only the ending slipped.
function conjTable(item) {
  const verb = VERB_BY_ID[item.verbId];
  const L = LANGS[item.lang];
  const form = (p, g) => esc(formsFor(verb, item.lang, item.tense, p, g, item.neg, item.aspect)[0]);
  const pron = (p, text) => `<span class="pron" data-person="${p}">${esc(text)}</span>`;
  const me = (p, g = null) => p === item.person && g === item.gender ? ' class="me"' : '';
  const title = [
    `<b>${esc(hintFor(verb, item.lang, item.aspect))}</b> ${groupTag(verb, item.lang, item.aspect)}`,
    `<span class="tchip" data-tense="${item.tense}">${TENSES[item.tense].en}</span>`,
    verb[item.lang]?.pf && ASPECTS[item.aspect].en,
    item.neg && 'negative',
  ].filter(Boolean).join(' · ');

  let body;
  if (item.lang === 'sr' && item.tense === 'past') {
    // pronoun per gender: 3rd person changes (on / ona, oni / one), the rest don't
    const who = (p, g) => p === 2 ? { m: 'on', f: 'ona', n: 'ono' }[g] : p === 5 ? { m: 'oni', f: 'one' }[g] : L.pronouns[p][0];
    const cell = (p, g) => `<td${me(p, g)}>${pron(p, who(p, g))} ${form(p, g)}</td>`;
    body = `<thead><tr>${['m', 'f'].map(g => `<th><span class="gbadge sm" data-g="${g}">${GENDER_TAG[g]}</span> ${GENDERS[g].en}</th>`).join('')}</tr></thead><tbody>` +
      [0, 1, 2, 3, 4, 5].map(p => `<tr>${cell(p, 'm')}${cell(p, 'f')}</tr>` +
        (p === 2 && (state.settings.includeNeuter || item.gender === 'n')
          ? `<tr><td colspan="2"${me(2, 'n')}><span class="gbadge sm" data-g="n">N</span> ${pron(2, 'ono')} ${form(2, 'n')}</td></tr>` : '')).join('') +
      `</tbody>`;
  } else {
    body = `<tbody>${[0, 1, 2, 3, 4, 5].map(p =>
      `<tr${me(p)}><th>${pron(p, L.pronouns[p].join(' / '))}</th><td>${form(p)}</td></tr>`).join('')}</tbody>`;
  }
  return `<div class="conj-title">${title}</div><table>${body}</table>`;
}

function shake() {
  const card = $('card');
  card.classList.remove('shake');
  requestAnimationFrame(() => card.classList.add('shake'));
}

function renderSession() {
  if (test) {
    $('session').innerHTML = `checkpoint <b>${Math.min(test.results.length + (answered ? 0 : 1), test.items.length)}</b>/${test.items.length}`;
    return;
  }
  const list = store.sessionAttempts(state);
  const ok = list.filter(a => a.ok).length;
  let run = 0;
  for (let i = list.length - 1; i >= 0 && list[i].ok; i--) run++;
  $('session').innerHTML = list.length
    ? `<b>${ok}</b>/${list.length}${run >= 3 ? ` · 🔥${run}` : ''}`
    : '';
}

// ---------- weekly checkpoint ----------

// Older checkpoints (before they were per language) may cover both.
const checkpointLang = c => c.lang || (Object.keys(c.byLang).length === 1 ? Object.keys(c.byLang)[0] : 'mix');
// Checkpoints are tracked per language and per module.
const checkpointKey = c => `${checkpointLang(c)}|${c.mod || 'verbs'}`;
const BREAKDOWN = { case: 'cases in context', count: 'counting', own: 'possessives', art: 'articles', pl: 'plurals', ...CONN_GROUPS,
  ...DRILL_SKILLS, form: 'personal forms (long / short)', poss: 'possessive forms', ...ADJ_KIND_NAMES };
const breakdownLabel = k => BREAKDOWN[k] || TENSES[k]?.en || k;

function renderTestBar() {
  $('test-bar').innerHTML = test
    ? `<span>🏁 ${LANGS[test.lang].name} · ${MODULES[test.mod]} checkpoint — not saved to practice</span><button type="button" class="btn ghost" id="test-quit">Quit</button>`
    : `<span class="test-label">🏁 Weekly checkpoint · ${MODULES[mod()]} · ${CHECKPOINT_SIZE}</span>` +
      ['sr', 'mk'].map(l => `<button type="button" class="btn test-start" data-lang="${l}" data-test="${l}">${LANGS[l].name}</button>`).join('');
  $('langpick').classList.toggle('locked', !!test);
  $('modpick').classList.toggle('locked', !!test);
  renderSession();
}

// One language per checkpoint, so Serbian and Macedonian are tracked separately.
function startTest(lang) {
  const items = buildCheckpoint({ ...state.settings, langs: [lang] });
  if (!items.length) return;
  test = { lang, mod: mod(), items, results: [] };
  current = null;
  window.scrollTo(0, 0);
  next();
}

function quitTest() {
  if (test.results.length && !confirm('Quit the checkpoint? This attempt won’t be saved.')) return;
  test = null;
  current = null;
  next();
}

function finishTest() {
  const { lang, mod: m } = test;
  const sum = { ...summarize(test.results), lang, mod: m };
  const prev = state.checkpoints.filter(c => checkpointKey(c) === `${lang}|${m}`).at(-1);
  store.saveCheckpoint(state, sum);
  const casualLang = store.stats(state, 7, m).byLang.get(lang);
  const casual = casualLang ? casualLang.ok / casualLang.n : null;
  const results = test.results;
  test = null;
  current = null;
  $('card').hidden = true;
  renderTestBar();

  const acc = sum.ok / sum.n;
  const vs = (label, other) => other == null ? '' :
    `<div class="vs"><span>${label}</span><b>${pct(other)}</b>${delta(acc, other, true)}</div>`;
  const misses = results.filter(r => !r.ok);
  const errs = Object.entries(sum.errors).sort((a, b) => b[1] - a[1]);
  $('test-result').innerHTML = `
    <div class="panel result">
      <h2>${LANGS[lang].name} · ${MODULES[m]} checkpoint</h2>
      <div class="score"><b>${sum.ok}</b><span>/ ${sum.n}</span><em>${pct(acc)}</em></div>
      ${vs('last checkpoint', prev && prev.ok / prev.n)}
      ${vs('casual practice, last 7 days', casual)}
      ${sum.medianMs != null ? `<div class="vs"><span>median answer time</span><b>${(sum.medianMs / 1000).toFixed(1)} s</b>${prev?.medianMs ? `<span class="delta ${sum.medianMs < prev.medianMs ? 'up' : 'down'}">${sum.medianMs < prev.medianMs ? '▲ faster' : '▼ slower'}</span>` : ''}</div>` : ''}
    </div>
    ${m === 'verbs'
      ? `<div class="panel"><h2>By tense</h2>${bars(Object.keys(TENSES).filter(t => sum.byTense[t]).map(t => ({
          ...accRow(`<span class="dot" data-tense="${t}"></span>${TENSES[t].en}`, sum.byTense[t]), color: `var(--${t})` })), { fmt: accFmt })}</div>`
      : `<div class="panel"><h2>By ${m === 'connectors' ? 'group' : m === 'pronouns' ? 'skill' : 'construction'}</h2>${bars(Object.entries(sum.byKind).map(([k, v]) =>
          accRow(breakdownLabel(k), v)), { fmt: accFmt })}</div>`}
    ${errs.length ? `<div class="panel"><h2>What tripped you up</h2>${bars(errs.map(([e, n]) => ({
      label: e === 'hint' ? 'Used the hint' : ERROR_TYPES[e] || e, value: n, n })), { max: errs[0][1], fmt: r => `<b>${r.n}</b>` })}</div>` : ''}
    ${misses.length ? `<div class="panel"><h2>Misses</h2><ul class="mistakes">${misses.map(r => `
      <li><div class="q">${describe(r.item)}</div>
      <div class="a">${r.answer ? `<s>${esc(r.answer)}</s> → ` : ''}<b>${esc(r.expected)}</b>${r.hinted ? ' <span class="tag">used hint</span>' : ''}</div></li>`).join('')}</ul></div>` : ''}
    <button type="button" class="btn wide primary" id="test-done">Back to practice</button>`;
  $('test-result').hidden = false;
  window.scrollTo(0, 0);
}

$('test-bar').addEventListener('click', e => {
  const lang = e.target.closest('[data-test]')?.dataset.test;
  if (lang) startTest(lang);
  if (e.target.id === 'test-quit') quitTest();
});
$('test-result').addEventListener('click', e => {
  if (e.target.id === 'test-done') { $('test-result').hidden = true; next(); }
});

function startSession() {
  store.newSession(state);
  renderSession();
  if (!$('view-stats').hidden) renderStats();
}

$('answer-form').addEventListener('submit', e => { e.preventDefault(); submit(); });
$('hint-btn').addEventListener('click', showHint);
$('reveal-btn').addEventListener('click', () => submit(true));
$('keys').addEventListener('pointerdown', e => {
  const k = e.target.closest('button')?.dataset.k;
  if (!k || answered) return;
  e.preventDefault(); // keep focus (and the phone keyboard) on the input
  const input = $('answer');
  const s = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? s;
  const ins = k === 'ќе' ? 'ќе ' : k;
  input.value = input.value.slice(0, s) + ins + input.value.slice(end);
  input.setSelectionRange(s + ins.length, s + ins.length);
});

function renderLangPick() {
  const l = state.settings.langs;
  const mode = l.length > 1 ? 'twin' : l[0];
  $('langpick').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === mode));
  $('modpick').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === mod()));
  $('fillers').hidden = mod() !== 'connectors';
}

$('modpick').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || test) return;
  state.settings.module = b.dataset.m;
  twinNext = null;
  recent = [];
  store.save(state);
  renderLangPick();
  current = null;
  next();
});

// Fillers aren't drilled — a list to keep in your head for conversation.
$('fillers-body').innerHTML = `<table class="fillers-table"><tbody>${FILLERS.map(f => `<tr>
  <th>${esc(f.en)}<small>${esc(f.use)}</small></th><td class="sr">${esc(f.sr)}</td><td class="mk">${esc(f.mk)}</td></tr>
  ${f.note ? `<tr><td colspan="3" class="conj-note">${esc(f.note)}</td></tr>` : ''}`).join('')}</tbody></table>`;

$('langpick').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || test) return;
  state.settings.langs = b.dataset.l === 'twin' ? ['sr', 'mk'] : [b.dataset.l];
  twinNext = null;
  store.save(state);
  renderLangPick();
  current = null;
  next();
});

// ---------- stats ----------

let statsWindow = 'session';

function bars(rows, { max = 1, fmt }) {
  return `<div class="bars">${rows.map(r => `
    <div class="bar-row">
      <div class="bar-top"><span class="lbl">${r.label}</span><span class="val">${fmt(r)}</span></div>
      <div class="track"><div class="fill" style="${r.color ? `background:${r.color};` : ''}width:${r.value ? Math.max(2, (r.value / max) * 100) : 0}%"></div></div>
    </div>`).join('')}</div>`;
}

const accRow = (label, s) => ({ label, value: s ? s.ok / s.n : null, n: s?.n || 0 });
const accFmt = r => r.n ? `<b>${pct(r.value)}</b> · ${r.n}` : '–';

function renderStats() {
  const m = mod();
  const s = store.stats(state, statsWindow, m);
  const body = $('stats-body');

  let html = `<p class="sub mod-label">${MODULES[m]} · switch module on the practice screen</p><div class="tiles">
    <div class="tile"><div class="v">${s.total}</div><div class="k">answers</div></div>
    <div class="tile"><div class="v">${pct(s.acc)}</div><div class="k">accuracy</div></div>
    <div class="tile"><div class="v">${s.today}</div><div class="k">today</div></div>
    <div class="tile"><div class="v">${s.streak}</div><div class="k">day streak</div></div>
  </div>`;

  if (statsWindow === 'session') {
    html = `<div class="session-bar"><span>Session started ${ago(state.sessionStart)}</span>
      <button class="btn" id="new-session-btn">Start new session</button></div>` + html;
  }

  html += weeklyPanel(m);

  if (state.checkpoints.length) {
    html += `<div class="panel"><h2>Checkpoints</h2><p class="sub">weekly tests, per language — kept separate from practice</p>`;
    const keys = [...new Set(state.checkpoints.map(checkpointKey))].sort();
    for (const key of keys) {
      const [l, cm] = key.split('|');
      const all = state.checkpoints.filter(c => checkpointKey(c) === key);
      const scores = all.map(c => c.ok / c.n);
      const cps = all.slice(-8).reverse();
      html += `<p class="sub cp-lang">${l === 'mix' ? 'Mixed (older)' : LANGS[l].name} · ${MODULES[cm]}</p>
        <div class="cp-summary"><span>last <b>${pct(scores.at(-1))}</b></span><span>best <b>${pct(Math.max(...scores))}</b></span>
          <span>average <b>${pct(scores.reduce((a, b) => a + b, 0) / scores.length)}</b></span><span><b>${all.length}</b> taken</span></div>` +
        bars(cps.map((c, i) => ({
          label: new Date(c.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
            (c.medianMs ? ` <small>${(c.medianMs / 1000).toFixed(1)} s</small>` : ''),
          value: c.ok / c.n, n: c.n, ok: c.ok, prev: cps[i + 1], color: l === 'mix' ? null : `var(--${l})`,
        })), { fmt: r => `<b>${r.ok}/${r.n}</b> · ${pct(r.value)}${r.prev ? ' ' + delta(r.value, r.prev.ok / r.prev.n, true) : ''}` });
    }
    html += `<button type="button" class="btn wide" id="cp-export">Export checkpoints (CSV)</button></div>`;
  }


  if (!s.total) {
    body.innerHTML = html + `<div class="panel"><p class="note" style="margin:0">No answers in this period yet. Go practise — this fills in as you go.</p></div>`;
    return;
  }

  const errTotal = s.errors.reduce((a, [, n]) => a + n, 0);
  html += `<div class="panel"><h2>What trips you up</h2>`;
  html += s.errors.length
    ? `<p class="sub">${errTotal} mistakes, decoded by what you actually typed</p>` +
      bars(s.errors.map(([e, n]) => ({ label: ERROR_TYPES[e], value: n, n })),
        { max: s.errors[0][1], fmt: r => `<b>${r.n}</b> · ${pct(r.n / errTotal)}` })
    : `<p class="note" style="margin:0">No mistakes. Suspicious. 😏</p>`;
  html += `</div>`;

  if (m === 'verbs') html += verbPanels(s);
  else html += wordPanels(s, m);

  const r = s.srs;
  const skillRow = sk => `<li><div class="q">${esc(skillName(sk.key))}</div>
    <div class="a"><span class="tag">missed ${sk.lapses}×</span> <span class="tag">${sk.iv ? `next in ${sk.iv} d` : 'learning'}</span></div></li>`;
  if (statsWindow === 0) {
    // all time: long-term stability, per skill
    html += `<div class="panel"><h2>Skills</h2><p class="sub">${r.seen} skills seen · mastered = next review ${MASTERED_DAYS}+ days out</p>
      <div class="boxes four">
        <div><div class="v">${r.learning}</div><div class="k">learning</div></div>
        <div><div class="v">${r.young}</div><div class="k">growing</div></div>
        <div><div class="v">${r.mastered}</div><div class="k">mastered</div></div>
        <div><div class="v">${r.leeches.length}</div><div class="k">leeches</div></div>
      </div>
      <div class="kinds">${Object.entries(SKILL_KINDS).filter(([k]) => r.byKind[k]).map(([k, name]) => {
        const b = r.byKind[k], n = b.learning + b.young + b.mastered;
        return `<div class="kind"><span>${name}</span><span class="stack" title="learning / growing / mastered">` +
          `<i class="l" style="flex:${b.learning}"></i><i class="y" style="flex:${b.young}"></i><i class="m" style="flex:${b.mastered}"></i></span>` +
          `<small>${b.mastered}/${n}</small></div>`;
      }).join('')}</div>
      <p class="sub legend"><i class="l"></i>learning <i class="y"></i>growing <i class="m"></i>mastered</p></div>`;
    if (r.leeches.length) {
      html += `<div class="panel"><h2>Leeches</h2>
        <p class="sub">Failed ${LEECH_LAPSES}+ times, on more than one day. These need a new angle, not more reps: use it in a sentence, find a mnemonic, or compare it with a verb that follows the same pattern.</p>
        <ul class="mistakes">${r.leeches.slice(0, 12).map(skillRow).join('')}</ul></div>`;
    }
  } else {
    // shorter windows: what the spacing has lined up, and whether the pace is right
    const acc = s.rolling;
    const pace = acc === null ? 'answer a few more to set the pace'
      : acc < 0.65 ? 'below 65% — reviewing only, no new material'
      : acc > 0.9 ? 'above 90% — bringing in new material faster'
      : acc < TARGET[0] ? 'a little low — leaning on review'
      : acc > TARGET[1] ? 'a little high — adding new material' : 'right in the target band';
    html += `<div class="panel"><h2>Pace</h2>
      <p class="sub">last 30 answers: <b>${pct(acc)}</b> · target ${TARGET[0] * 100}–${TARGET[1] * 100}% · ${pace}</p>
      ${s.speed ? `<p class="sub">fluency: median <b>${(s.speed.median / 1000).toFixed(1)} s</b> per correct answer · <b>${pct(s.speed.fast)}</b> fast enough to count toward mastered</p>` : ''}
      <div class="boxes four">
        <div><div class="v">${r.dueNow}</div><div class="k">skills due</div></div>
        <div><div class="v">${r.dueToday}</div><div class="k">due today</div></div>
        <div><div class="v">${r.dueWeek}</div><div class="k">next 7 days</div></div>
        <div><div class="v">${r.mastered}</div><div class="k">mastered</div></div>
      </div></div>`;
    if (r.weakest.length) html += `<div class="panel"><h2>Weakest skills</h2><ul class="mistakes">${r.weakest.map(skillRow).join('')}</ul></div>`;
  }

  if (s.mistakes.length) {
    html += `<div class="panel"><h2>Recent mistakes</h2><ul class="mistakes">${s.mistakes.map(a => {
      const item = store.decodeItem(a);
      if (!itemExists(item)) return '';
      return `<li><div class="q">${describe(item)}</div>
        <div class="a">${a.a ? `<s>${esc(a.a)}</s> → ` : ''}<b>${esc(checkItem(item, '').expected)}</b> <span class="tag">${ERROR_TYPES[a.e] || ''}</span></div></li>`;
    }).join('')}</ul></div>`;
  }

  body.innerHTML = html;
}

function verbPanels(s) {
  let html = '';
  const langs = ['sr', 'mk'].filter(l => s.byLang.has(l));
  html += `<div class="panel"><h2>Accuracy by tense</h2>`;
  for (const l of langs) {
    html += `<p class="sub" style="margin-top:${l === langs[0] ? -6 : 10}px">${LANGS[l].name}</p>`;
    html += bars(Object.keys(TENSES).map(t => ({
      ...accRow(`<span class="dot" data-tense="${t}"></span>${TENSES[t].en} <small>${TENSES[t][l]}</small>`, s.byTense.get(`${l}|${t}`)),
      color: `var(--${t})`,
    })), { fmt: accFmt });
  }
  html += `</div>`;

  html += `<div class="panel"><h2>Affirmative vs negative</h2>` +
    bars([accRow('affirmative <small>čitam · читам</small>', s.byPolarity.get('pos')),
          accRow('negative <small>ne čitam · не читам</small>', s.byPolarity.get('neg'))], { fmt: accFmt }) + `</div>`;

  if (s.byAspect.has('pf')) {
    html += `<div class="panel"><h2>Imperfective vs perfective</h2><p class="sub">past &amp; future</p>` +
      bars([accRow('imperfective <small>čitao sam · читав</small>', s.byAspect.get('impf')),
            accRow('perfective <small>pročitao sam · прочитав</small>', s.byAspect.get('pf'))], { fmt: accFmt }) + `</div>`;
  }

  const personLabels = { '1sg': 'ja / јас', '2sg': 'ti / ти', '3sg': 'on / тој', '1pl': 'mi / ние', '2pl': 'vi / вие', '3pl': 'oni / тие' };
  html += `<div class="panel"><h2>Accuracy by person</h2>` +
    bars(Object.entries(personLabels).map(([k, label], i) => ({
      ...accRow(`<span class="dot" data-person="${i}"></span>${label}`, s.byPerson.get(k)),
      color: `var(--p${i})`,
    })), { fmt: accFmt }) + `</div>`;

  if (s.weakVerbs.length) {
    html += `<div class="panel"><h2>Weakest verbs</h2><p class="sub">at least 3 attempts</p>` +
      bars(s.weakVerbs.map(w => {
        const v = VERB_BY_ID[w.v];
        return { label: `${esc(hintFor(v, 'sr'))} / ${v.mk ? esc(hintFor(v, 'mk')) : '—'} <small>${esc(v.en.replace(/^to /, ''))}</small>`, value: w.acc, n: w.n };
      }), { fmt: accFmt }) + `</div>`;
  }

  return html;
}

// Nouns / connectors: accuracy per construction (or group) and the weakest words.
function wordPanels(s, m) {
  const groupOf = a => m === 'connectors' ? CONNECTOR_BY_ID[a.cn]?.group
    : m === 'pronouns' ? (a.k === 'drill' ? DRILL_BY_ID[a.pi]?.skill : a.k)
    : m === 'adjectives' ? a.k
    : a.k === 'case' ? `case:${FRAMES[a.d]?.c}` : a.k;
  const label = k => k.startsWith('case:') ? `${CASE_NAMES[+k.slice(5)]} <small>cases in context</small>` : breakdownLabel(k);
  let html = '';
  for (const l of ['sr', 'mk']) {
    const list = s.list.filter(a => a.l === l);
    if (!list.length) continue;
    const t = new Map();
    for (const a of list) {
      const k = groupOf(a);
      if (!k) continue;
      const x = t.get(k) || { n: 0, ok: 0 };
      x.n++;
      if (a.ok) x.ok++;
      t.set(k, x);
    }
    html += `<div class="panel"><h2>${LANGS[l].name} · by ${m === 'connectors' ? 'group' : m === 'pronouns' ? 'skill' : 'construction'}</h2>` +
      bars([...t].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => accRow(label(k), v)), { fmt: accFmt }) + `</div>`;
  }
  const words = new Map();
  for (const a of s.list) {
    const id = m === 'nouns' ? a.nn : m === 'pronouns' ? `${a.k}:${a.pi}` : m === 'adjectives' ? a.ai : a.cn;
    const k = `${a.l}|${id}`;
    const x = words.get(k) || { n: 0, ok: 0, l: a.l, id };
    x.n++;
    if (a.ok) x.ok++;
    words.set(k, x);
  }
  const weak = [...words.values()].filter(w => w.n >= 3).sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 8);
  if (weak.length) {
    html += `<div class="panel"><h2>Weakest ${m}</h2><p class="sub">at least 3 attempts</p>` +
      bars(weak.map(w => {
        let name, en;
        if (m === 'adjectives') {
          name = ADJ_BY_ID[w.id] ? adjBase(ADJ_BY_ID[w.id], w.l) : w.id;
          en = ADJ_BY_ID[w.id]?.en;
        } else if (m === 'pronouns') {
          const [k, pid] = w.id.split(':');
          const src = k === 'drill' ? DRILL_BY_ID[pid] : k === 'form' ? PERSONAL_BY_ID[pid] : POSSESSIVE_BY_ID[pid];
          name = k === 'drill' ? src?.[w.l]?.ans.split('/')[0] : k === 'form' ? pronBase({ lang: w.l, pid }) : src?.en;
          en = k === 'drill' ? src?.prompt : src?.en;
        } else {
          name = m === 'nouns' ? (w.l === 'sr' ? srBase(NOUN_BY_ID[w.id]) : mkBase(NOUN_BY_ID[w.id])) : CONNECTOR_BY_ID[w.id]?.[w.l].ans.split('/')[0];
          en = m === 'nouns' ? NOUN_BY_ID[w.id]?.en : CONNECTOR_BY_ID[w.id]?.en;
        }
        return { label: `${LANGS[w.l].short} · ${esc(name)} <small>${esc(en)}</small>`, value: w.ok / w.n, n: w.n };
      }), { fmt: accFmt }) + `</div>`;
  }
  return html;
}

// One-line description of a prompt for the stats lists.
function describe(item) {
  if (item.mod) {
    const label = item.mod === 'noun' ? nounLabel(item) : item.mod === 'pron' ? pronLabel(item) : item.mod === 'adj' ? adjLabel(item) : connLabel(item);
    return `<span class="l ${item.lang}">${LANGS[item.lang].short}</span> · ${esc(label)}`;
  }
  const L = LANGS[item.lang];
  const pron = L.pronouns[item.person][item.gender === 'f' && (item.person === 2 || item.person === 5) ? 1 : item.gender === 'n' ? 2 : 0];
  const gtag = item.gender ? ` <span class="gbadge sm" data-g="${item.gender}">${GENDER_TAG[item.gender]}</span>` : '';
  return `<span class="l ${item.lang}">${L.short}</span> · ${esc(promptFor(VERB_BY_ID[item.verbId], item.aspect))} · ` +
    `<span class="tchip" data-tense="${item.tense}">${TENSES[item.tense].en}</span>` +
    `${item.aspect === 'pf' ? ' · <b>pf</b>' : ''}${item.neg ? ` · <b>${L.neg}</b>` : ''} · ` +
    `<span class="pron" data-person="${item.person}">${esc(pron)}</span>${gtag}`;
}

const itemExists = item => item.mod === 'noun' ? !!NOUN_BY_ID[item.nounId]?.[item.lang]
  : item.mod === 'conn' ? !!CONNECTOR_BY_ID[item.connId]?.[item.lang]
  : item.mod === 'adj' ? !!(ADJ_BY_ID[item.adjId]?.[item.lang] && NOUN_BY_ID[item.nounId]?.[item.lang])
  : item.mod === 'pron' ? !!(item.kind === 'drill' ? DRILL_BY_ID[item.pid]?.[item.lang] : item.kind === 'form' ? PERSONAL_BY_ID[item.pid] : POSSESSIVE_BY_ID[item.pid])
  : !!VERB_BY_ID[item.verbId];

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function delta(cur, avg, isPct) {
  if (cur == null || avg == null) return '';
  const d = isPct ? Math.round((cur - avg) * 100) : Math.round(cur - avg);
  if (!d) return `<span class="delta">±0</span>`;
  return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${isPct ? ' pts' : ''}</span>`;
}

function weeklyPanel(m) {
  const w = store.weekly(state, m);
  let html = `<div class="panel"><h2>This week vs your average</h2>`;
  if (!w.weeks) {
    return html + `<p class="note" style="margin:0">Your average builds from past weeks — check back next Monday to compare.
      This week so far: <b>${w.cur.n}</b> answers, <b>${pct(w.cur.acc)}</b>.</p></div>`;
  }
  html += `<p class="sub">vs ${w.weeks} earlier week${w.weeks > 1 ? 's' : ''} you practised · weeks start Monday</p>
    <div class="compare">
      <div></div><div class="h">this week</div><div class="h">avg week</div><div></div>
      <div class="k">answers</div><div class="v">${w.cur.n}</div><div class="v muted">${Math.round(w.avg.n)}</div><div>${delta(w.cur.n, w.avg.n)}</div>
      <div class="k">accuracy</div><div class="v">${pct(w.cur.acc)}</div><div class="v muted">${pct(w.avg.acc)}</div><div>${delta(w.cur.acc, w.avg.acc, true)}</div>
      ${m !== 'verbs' ? '' : w.byTense.map(r => `<div class="k"><span class="dot" data-tense="${r.t}"></span>${TENSES[r.t].en}</div>
        <div class="v">${pct(r.cur)}</div><div class="v muted">${pct(r.avg)}</div><div>${delta(r.cur, r.avg, true)}</div>`).join('')}
    </div>`;
  return html + `</div>`;
}

function exportCheckpoints() {
  const text = m => {
    const item = store.decodeItem(m);
    return describe(item).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  };
  const csv = toCSV(state.checkpoints, c => {
    const l = checkpointLang(c);
    return l === 'mix' ? 'mixed' : LANGS[l].name;
  }, text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `esm-checkpoints-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('stats-body').addEventListener('click', e => {
  if (e.target.id === 'new-session-btn') startSession();
  if (e.target.id === 'cp-export') exportCheckpoints();
});

$('stats-window').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  statsWindow = b.dataset.w === 'session' ? 'session' : +b.dataset.w;
  $('stats-window').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderStats();
});

// ---------- settings ----------

function renderSettings() {
  document.querySelectorAll('[data-set]').forEach(el => {
    const val = state.settings[el.dataset.set];
    el.checked = Array.isArray(val) ? val.includes(el.value) : !!val;
  });
}

document.querySelectorAll('[data-set]').forEach(el => el.addEventListener('change', () => {
  const key = el.dataset.set;
  if (Array.isArray(state.settings[key])) {
    const set = new Set(state.settings[key]);
    el.checked ? set.add(el.value) : set.delete(el.value);
    state.settings[key] = [...set];
  } else {
    state.settings[key] = el.checked;
  }
  store.save(state);
  applyPrefs();
  current = null;
}));

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([store.exportData(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `esm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = store.importData(await file.text());
    if (!confirm(`Replace current progress with this backup (${data.attempts.length} answers)?`)) return;
    state = data;
    applyPrefs();
    store.save(state);
    renderSettings();
    current = null;
    alert('Restored.');
  } catch (err) {
    alert('Could not read that file: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

$('reset-btn').addEventListener('click', () => {
  if (!confirm('Delete all progress and stats on this device? (Back up first if unsure.)')) return;
  const settings = state.settings;
  state = store.reset();
  state.settings = settings;
  store.save(state);
  renderSession();
  current = null;
});

// install
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  $('install-btn').hidden = false;
});
$('install-btn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $('install-btn').hidden = true;
});
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('ios-note').hidden = false;

// ---------- navigation ----------

function show(view) {
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `view-${view}`);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
  if (view === 'practice') renderLangPick();
  if (view === 'practice' && (!current || !answered && !$('answer').value)) next();
  window.scrollTo(0, 0);
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) show(b.dataset.view);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When a new version takes over, reload once so the page isn't left running old code.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}

renderLangPick();
renderSession();
next();
