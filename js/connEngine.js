// Connectors: fill-in-the-blank. The English sentence is the prompt, the frame is the
// Serbian / Macedonian sentence with ___ where the connector goes.
// A connector item: { mod: 'conn', lang, connId }.
import { CONNECTORS, CONNECTOR_BY_ID, FILLERS } from './connectors.js';
import { normalize, loose, skeleton, editDistance } from './engine.js';

export { CONNECTORS, CONNECTOR_BY_ID, FILLERS };

export const CONN_GROUPS = {
  join: 'joining', sequence: 'sequence', reason: 'reason', time: 'time',
  condition: 'condition', contrast: 'contrast', discourse: 'discourse',
};

export function buildConnPool({ langs }) {
  const pool = [];
  for (const lang of langs) for (const c of CONNECTORS)
    if (c[lang]) pool.push({ mod: 'conn', lang, connId: c.id });
  return pool;
}

export const connTwin = item => {
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  return CONNECTOR_BY_ID[item.connId][other] ? { mod: 'conn', lang: other, connId: item.connId } : null;
};

export const connForms = item => CONNECTOR_BY_ID[item.connId][item.lang].ans.split('/');

// If the whole sentence was typed, keep just what fills the blank.
function prepare(item, raw) {
  const ans = normalize(raw);
  const frame = normalize(CONNECTOR_BY_ID[item.connId][item.lang].frame.replace('___', 'BLANKSLOT'));
  const [before, after] = frame.split('blankslot').map(s => s.trim());
  if ((before || after) && ans.startsWith(before) && ans.endsWith(after) && ans.length > before.length + after.length) {
    const mid = ans.slice(before.length, ans.length - after.length).trim();
    if (mid) return mid;
  }
  return ans;
}

export function checkConn(item, rawAnswer, { lenient }) {
  const accepted = connForms(item);
  const expected = accepted[0];
  const ans = prepare(item, rawAnswer);
  if (!ans) return { result: 'wrong', error: 'blank', expected, accepted };
  if (accepted.includes(ans)) return { result: 'correct', error: null, expected, accepted };
  if (accepted.some(f => loose(f) === loose(ans)))
    return { result: lenient ? 'close' : 'wrong', error: 'diacritics', expected, accepted };
  const sk = skeleton(ans);
  const otherScript = item.lang === 'sr' ? /[а-яѓђѕјљњќћџ]/.test(ans) : /[a-zčćšžđ]/.test(ans);
  if (otherScript && accepted.some(f => skeleton(f) === sk)) return { result: 'wrong', error: 'script', expected, accepted };
  const c = CONNECTOR_BY_ID[item.connId];
  const other = item.lang === 'sr' ? 'mk' : 'sr';
  // bleed: the other language's connector (ama for ali, jer on a Macedonian prompt)
  const otherAns = CONNECTORS.flatMap(x => x[other] ? x[other].ans.split('/') : []);
  const ownAns = CONNECTORS.flatMap(x => x[item.lang].ans.split('/'));
  let error = null;
  if (!ownAns.some(f => skeleton(f) === sk) && (c[other]?.ans.split('/').concat(otherAns) || []).some(f => f === ans || skeleton(f) === sk)) error = 'bleed';
  else if (ownAns.includes(ans) || ownAns.some(f => loose(f) === loose(ans))) error = 'connector';
  else error = Math.min(...accepted.map(f => editDistance(f, ans))) <= 2 ? 'spelling' : 'other';
  return { result: 'wrong', error, expected, accepted };
}

export const connSkills = item => [`conn|${item.lang}|${item.connId}`, `cgrp|${item.lang}|${CONNECTOR_BY_ID[item.connId].group}`];

export function connSkillName(key) {
  const [k, lang, a] = key.split('|');
  if (k === 'cgrp') return `${CONN_GROUPS[a]} connectors`;
  const c = CONNECTOR_BY_ID[a];
  return c ? `connector · ${c.en} (${c[lang].ans.split('/')[0]})` : key;
}
export const CONN_SKILL_KINDS = { conn: 'Connectors', cgrp: 'Connector groups' };

export const connLabel = item => CONNECTOR_BY_ID[item.connId][item.lang].frame;
