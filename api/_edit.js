/* Direct edits and restores share the revision check and history write. */
import { db as realDb, newId, L, writeSectionChange } from './_lib.js';

const MAX_PARA = 1200;
const error = (status, code) => ({ status, body: { error: code } });

export async function runEdit(input, deps = {}) {
  const d = deps.db || realDb;
  const { roomId, userId, sectionId, restore } = input;
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const userName = String(input.userName || 'Guest').slice(0, 40);
  if (!roomId || !userId || !sectionId) return error(400, 'roomId, userId and sectionId are required');
  if (String(userId).startsWith('bot_')) return error(403, 'bots edit through the agent');
  const [sec] = await d.select('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sectionId)}`);
  if (!sec) return error(404, 'section not found');
  if ((restore !== undefined || input.rev !== undefined) && (input.rev == null || Number(input.rev) !== sec.rev)) return error(409, 'stale');

  let paras, summary, why;
  if (restore !== undefined) {
    if (typeof restore?.changeId !== 'string' || !['before', 'after'].includes(restore.version)) return error(400, 'invalid_version');
    const [change] = await d.select('changes', `id=${d.eq(restore.changeId)}&room_id=${d.eq(roomId)}&section_id=${d.eq(sectionId)}`);
    if (!change) return error(404, 'version_not_found');
    paras = restore.version === 'before' ? change.prev : change.next;
    summary = L(lang, 'Restored a previous version', '이전 버전으로 복원');
    why = L(lang, 'Restored from section history', '섹션 변경 이력에서 복원');
  } else {
    if (!Array.isArray(input.paras)) return error(400, 'paras are required');
    paras = input.paras.map((p) => String(p || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!paras.length) return error(400, 'empty');
    if (paras.length > sec.paras.length + 5 || paras.some((p) => p.length > MAX_PARA || p.includes('\0'))) return error(400, 'too_long');
    const n = Math.max(1, paras.filter((p) => !sec.paras.includes(p)).length);
    summary = L(lang, `Edited directly · ${n} paragraph${n > 1 ? 's' : ''} changed`, `직접 수정 · 문단 ${n}개 변경`);
    why = L(lang, 'Direct edit, no agent', '에이전트 없이 직접 수정');
  }
  if (JSON.stringify(paras) === JSON.stringify(sec.paras)) return { ok: true, unchanged: true };
  const changeId = newId('c');
  const result = await writeSectionChange(d, sec, paras, { id: changeId, kind: 'human', by_id: userId, by_name: userName, summary, why });
  if (result !== 'ok') return error(result === 'section not found' ? 404 : 409, result);
  return { ok: true, changeId, rev: sec.rev + 1 };
}
