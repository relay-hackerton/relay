/* A person editing one section directly: no Claude, no agent lock; the section's rev guards against overwriting. */
import { db as realDb, newId, L } from './_lib.js';

const MAX_PARA = 1200;

export async function runEdit(input, deps = {}) {
  const d = deps.db || realDb;
  const { roomId, userId, sectionId } = input;
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const userName = String(input.userName || 'Guest').slice(0, 40);
  if (!roomId || !userId || !sectionId || !Array.isArray(input.paras)) return { status: 400, body: { error: 'roomId, userId, sectionId and paras are required' } };
  if (String(userId).startsWith('bot_')) return { status: 403, body: { error: 'bots edit through the agent' } };
  const paras = input.paras.map((p) => String(p || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const [sec] = await d.select('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sectionId)}`);
  if (!sec) return { status: 404, body: { error: 'section not found' } };
  if (!paras.length) return { status: 400, body: { error: 'empty' } };
  if (paras.length > sec.paras.length + 5 || paras.some((p) => p.length > MAX_PARA)) return { status: 400, body: { error: 'too_long' } };
  if (JSON.stringify(paras) === JSON.stringify(sec.paras)) return { ok: true, unchanged: true };
  const open = await d.select('discussions', `room_id=${d.eq(roomId)}&section_id=${d.eq(sectionId)}&status=eq.open&select=id,n`);
  if (open.length) return { status: 409, body: { error: 'frozen', discussion: open[0].id } };
  if (input.rev !== undefined && Number(input.rev) !== sec.rev) return { status: 409, body: { error: 'stale', rev: sec.rev, paras: sec.paras } };
  const changeId = newId('c');
  const rows = await d.update('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sectionId)}&rev=eq.${sec.rev}`, { paras, rev: sec.rev + 1, last_change_id: changeId });
  if (!rows.length) return { status: 409, body: { error: 'stale' } };
  const n = Math.max(1, paras.filter((p) => !sec.paras.includes(p)).length);
  await d.insert('changes', [{ id: changeId, room_id: roomId, section_id: sectionId, kind: 'human', by_id: userId, by_name: userName,
    summary: L(lang, `Edited directly · ${n} paragraph${n > 1 ? 's' : ''} changed`, `직접 수정 · 문단 ${n}개 변경`), why: L(lang, 'Direct edit, no agent', '에이전트 없이 직접 수정'), prev: sec.paras, next: paras }]);
  return { ok: true, changeId, rev: sec.rev + 1 };
}
