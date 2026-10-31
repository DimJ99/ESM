import { LANGS, TENSES, ERROR_TYPES, GENDER_TAG, VERB_BY_ID, check, hintFor, pronounFor } from './engine.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = x => x == null ? '–' : Math.round(x * 100) + '%';

let state = store.load();
let current = null;   // { item, pronoun }
let answered = false;
let hinted = false;

// ---------- practice ----------

function next() {
  const item = store.pickNext(state, current?.item);
  $('card').hidden = !item;
  $('empty').hidden = !!item;
  if (!item) return;

  current = { item, pronoun: pronounFor(item) };
  answered = false;
  hinted = false;

  const lang = LANGS[item.lang];
  const verb = VERB_BY_ID[item.verbId];
  const card = $('card');
  card.dataset.lang = item.lang;
  document.body.style.setProperty('--accent', `var(--${item.lang})`);

  const pr = current.pronoun;
  const gTag = item.gender ? `<span class="gbadge" data-g="${item.gender}">${pr.tag}</span>` : '';
  $('chips').innerHTML = [
    state.settings.langs.length > 1 && `<span class="chip lang">${lang.short}</span>`,
    `<span class="chip tense" data-tense="${item.tense}"><b>${TENSES[item.tense].en}</b><small>${TENSES[item.tense][item.lang]}</small></span>`,
    `<span class="chip person"${item.gender ? ` data-g="${item.gender}"` : ''}>${gTag}<b>${esc(pr.text)}</b><small>${esc(pr.en)}</small></span>`,
    item.neg
      ? `<span class="chip pol neg"><b>negative</b><small>${lang.neg}</small></span>`
      : `<span class="chip pol pos">affirmative</span>`,
  ].filter(Boolean).join('');
  $('word').textContent = verb.en;
  $('hint-btn').className = 'hint-pill';
  $('hint-btn').textContent = item.lang === 'sr' ? 'Hint: show infinitive' : 'Hint: show dictionary form';
  $('feedback').hidden = true;
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
}

function showHint() {
  if (answered || !current) return;
  hinted = true;
  const { item } = current;
  $('hint-btn').innerHTML = `${LANGS[item.lang].hintLabel} · <b>${esc(hintFor(VERB_BY_ID[item.verbId], item.lang))}</b>`;
  $('hint-btn').classList.add('shown');
  $('hint-btn').disabled = true;
  $('answer').focus({ preventScroll: true });
}

function submit(reveal = false) {
  if (!current) return;
  if (answered) return next();

  const raw = reveal ? '' : $('answer').value;
  if (!reveal && !raw.trim()) return shake();

  const outcome = check(current.item, raw, state.settings);
  store.record(state, current.item, outcome, raw, hinted);
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
  const tags = [outcome.error && ERROR_TYPES[outcome.error], hinted && outcome.result === 'correct' && 'Used hint']
    .filter(Boolean).map(t => `<span class="tag">${t}</span>`).join(' ');

  const fb = $('feedback');
  fb.className = 'feedback ' + cls;
  $('fb-head').textContent = head;
  $('fb-answer').textContent = `${current.pronoun.text} ${outcome.expected}`;
  $('fb-detail').innerHTML = lines.join('<br>') + (tags ? `<div>${tags}</div>` : '');
  fb.hidden = false;

  $('keys').hidden = true;
  $('actions').hidden = true;
  $('submit').textContent = 'Next →';
  if (outcome.result === 'wrong') shake();
  input.focus({ preventScroll: true });
}

function shake() {
  const card = $('card');
  card.classList.remove('shake');
  requestAnimationFrame(() => card.classList.add('shake'));
}

function renderSession() {
  const list = store.sessionAttempts(state);
  const ok = list.filter(a => a.ok).length;
  let run = 0;
  for (let i = list.length - 1; i >= 0 && list[i].ok; i--) run++;
  $('session').innerHTML = list.length
    ? `<b>${ok}</b>/${list.length}${run >= 3 ? ` · 🔥${run}` : ''}`
    : '';
}

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
  const mode = l.length > 1 ? 'mix' : l[0];
  $('langpick').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === mode));
}

$('langpick').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.langs = b.dataset.l === 'mix' ? ['sr', 'mk'] : [b.dataset.l];
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
  const s = store.stats(state, statsWindow);
  const body = $('stats-body');

  let html = `<div class="tiles">
    <div class="tile"><div class="v">${s.total}</div><div class="k">answers</div></div>
    <div class="tile"><div class="v">${pct(s.acc)}</div><div class="k">accuracy</div></div>
    <div class="tile"><div class="v">${s.today}</div><div class="k">today</div></div>
    <div class="tile"><div class="v">${s.streak}</div><div class="k">day streak</div></div>
  </div>`;

  if (statsWindow === 'session') {
    html = `<div class="session-bar"><span>Session started ${ago(state.sessionStart)}</span>
      <button class="btn" id="new-session-btn">Start new session</button></div>` + html;
  }

  html += weeklyPanel();

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

  const personLabels = { '1sg': 'ja / јас', '2sg': 'ti / ти', '3sg': 'on / тој', '1pl': 'mi / ние', '2pl': 'vi / вие', '3pl': 'oni / тие' };
  html += `<div class="panel"><h2>Accuracy by person</h2>` +
    bars(Object.entries(personLabels).map(([k, label]) => accRow(label, s.byPerson.get(k))), { fmt: accFmt }) + `</div>`;

  if (s.weakVerbs.length) {
    html += `<div class="panel"><h2>Weakest verbs</h2><p class="sub">at least 3 attempts</p>` +
      bars(s.weakVerbs.map(w => {
        const v = VERB_BY_ID[w.v];
        return { label: `${esc(v.sr.inf)} / ${esc(hintFor(v, 'mk'))} <small>${esc(v.en.replace(/^to /, ''))}</small>`, value: w.acc, n: w.n };
      }), { fmt: accFmt }) + `</div>`;
  }

  const boxLabels = ['missed', 'new', 'learning', 'learning', 'good', 'solid'];
  html += `<div class="panel"><h2>Mastery</h2><p class="sub">${s.seen} of ${s.poolSize} prompts seen with current settings</p>
    <div class="boxes">${s.boxes.map((n, i) => `<div><div class="v">${n}</div><div class="k">${boxLabels[i]}</div></div>`).join('')}</div></div>`;

  if (s.mistakes.length) {
    html += `<div class="panel"><h2>Recent mistakes</h2><ul class="mistakes">${s.mistakes.map(m => {
      const v = VERB_BY_ID[m.v];
      if (!v) return '';
      const item = { lang: m.l, verbId: m.v, tense: m.te, person: m.p, gender: m.g, neg: !!m.n };
      const pron = LANGS[m.l].pronouns[m.p][m.g === 'f' && (m.p === 2 || m.p === 5) ? 1 : m.g === 'n' ? 2 : 0];
      const gtag = m.g ? ` <span class="gbadge sm" data-g="${m.g}">${GENDER_TAG[m.g]}</span>` : '';
      const exp = check(item, '', state.settings).expected;
      return `<li><div class="q"><span class="l ${m.l}">${LANGS[m.l].short}</span> · ${esc(v.en)} · <span class="tchip" data-tense="${m.te}">${TENSES[m.te].en}</span>${m.n ? ` · <b>${LANGS[m.l].neg}</b>` : ''} · ${esc(pron)}${gtag}</div>
        <div class="a">${m.a ? `<s>${esc(m.a)}</s> → ` : ''}<b>${esc(exp)}</b> <span class="tag">${ERROR_TYPES[m.e] || ''}</span></div></li>`;
    }).join('')}</ul></div>`;
  }

  body.innerHTML = html;
}

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

function weeklyPanel() {
  const w = store.weekly(state);
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
      ${w.byTense.map(r => `<div class="k"><span class="dot" data-tense="${r.t}"></span>${TENSES[r.t].en}</div>
        <div class="v">${pct(r.cur)}</div><div class="v muted">${pct(r.avg)}</div><div>${delta(r.cur, r.avg, true)}</div>`).join('')}
    </div>`;
  return html + `</div>`;
}

$('stats-body').addEventListener('click', e => {
  if (e.target.id === 'new-session-btn') startSession();
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderLangPick();
renderSession();
next();
