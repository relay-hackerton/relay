/* POST /api/room {} → { roomId }  Creates a room and copies the seed document, history and sessions into it. */
import { db, handler, newId, shortId, uuid } from './_lib.js';
import { DOC_TITLE, SECTIONS, HISTORY } from './_seed.js';

export async function createRoom(d = db) {
  const roomId = shortId(6);
  const now = Date.now();
  await d.insert('rooms', [{ id: roomId, title: DOC_TITLE }]);
  const changes = [], messages = [], last = {};
  for (const h of HISTORY) {
    const at = (offsetSec) => new Date(now - h.minutesAgo * 60000 + offsetSec * 1000).toISOString();
    const cid = newId('c'); const sec = SECTIONS.find((s) => s.id === h.sectionId);
    let mid = null;
    h.messages.forEach((m, i) => {
      const id = uuid(); if (m.applied) mid = id;
      messages.push({ id, room_id: roomId, user_id: h.by.id, user_name: h.by.name, role: m.role, text: m.text, created_at: at(i * 20 - 60),
        meta: m.role === 'user' ? { avatar: h.by.avatar } : (m.applied ? { action: 'edit', applied: h.sectionId, change_id: cid } : { action: 'clarify' }) });
    });
    changes.push({ id: cid, room_id: roomId, section_id: h.sectionId, kind: 'agent', by_id: h.by.id, by_name: h.by.name, summary: h.summary, why: h.why, prev: h.prev, next: sec.paras, message_id: mid, created_at: at(0) });
    last[h.sectionId] = cid;
  }
  await d.insert('sections', SECTIONS.map((s) => ({
    room_id: roomId, id: s.id, num: s.num, title: s.title, paras: s.paras, footnote: s.footnote || null, steps: !!s.steps, page: s.page || 1, rev: 0, last_change_id: last[s.id] || null,
  })));
  await d.insert('changes', changes);
  await d.insert('messages', messages);
  return roomId;
}

export default handler(async () => ({ roomId: await createRoom() }));
