/* POST /api/room { document? | shared? } → { roomId }.
   { shared: true } → the one onboarding room everybody opens from the library: created once with a random id
   like any other room (rooms.kind = 'shared', unique), then everyone gets that same link.
   An empty request starts a fresh copy of the demo; { document } imports a file. */
import { db, handler, newId, shortId, uuid } from './_lib.js';
import { DOC_TITLE, SECTIONS, HISTORY } from './_seed.js';

const MAX_DOCUMENT = 30000;

function importSections({ text, markdown }) {
  const sections = [];
  let title = 'Document';
  let lines = [];
  const finish = () => {
    const paras = (markdown ? lines.join('\n').split(/\n[ \t]*\n/) : lines).flatMap((block) => {
      const paragraph = block.replace(/\s+/g, ' ').trim();
      return paragraph.match(/.{1,600}(?:\s|$)|.{1,600}/gu)?.map((part) => part.trim()).filter(Boolean) || [];
    });
    if (paras.length) {
      const num = sections.length + 1;
      sections.push({ id: `import-${num}`, num, title, paras });
    }
    lines = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = markdown && /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) { finish(); title = heading[1].trim().slice(0, 120); }
    else lines.push(line);
  }
  finish();
  if (sections.length) {
    const decisionLog = SECTIONS.find((s) => s.id === 's8');
    sections.push({ ...decisionLog, num: sections.length + 1 });
  }
  return sections;
}

function insertSections(d, roomId, sections, last = {}) {
  return d.insert('sections', sections.map((s) => ({
    room_id: roomId, id: s.id, num: s.num, title: s.title, paras: s.paras, footnote: s.footnote || null,
    steps: !!s.steps, page: s.page || 1, rev: 0, last_change_id: last[s.id] || null,
  })));
}

/* the library's onboarding document: one room for everyone, seeded on first use */
export async function sharedRoom(d = db) {
  const find = async () => { const r = await d.select('rooms', 'kind=eq.shared&select=id&limit=1'); return r && r[0] ? r[0].id : null; };
  const found = await find(); if (found) return found;
  try { return await createRoom(d, undefined, 'shared'); }
  catch (error) {
    if (!/23505|duplicate|409/.test(String(error.message))) throw error;
    return find();   // someone else created it a moment ago: the unique index let only one through
  }
}

export async function createRoom(d = db, document = undefined, kind = 'copy') {
  const roomId = shortId(6);
  if (document) {
    await d.insert('rooms', [{ id: roomId, title: document.title, kind: 'import' }]);
    try {
      await insertSections(d, roomId, document.sections);
    } catch (error) {
      try { await d.delete('rooms', `id=${d.eq(roomId)}`); }
      catch (cleanupError) { console.error('import cleanup failed', cleanupError); }
      throw error;
    }
    return roomId;
  }
  const now = Date.now();
  await d.insert('rooms', [{ id: roomId, title: DOC_TITLE, ...(kind ? { kind } : {}) }]);
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
  await insertSections(d, roomId, SECTIONS, last);
  await d.insert('changes', changes);
  await d.insert('messages', messages);
  return roomId;
}

export default handler(async ({ document, shared }) => {
  if (shared === true) return { roomId: await sharedRoom() };
  if (document === undefined) return { roomId: await createRoom() };
  const invalid = { status: 400, body: { error: 'invalid_document' } };
  const title = typeof document?.title === 'string' ? document.title.trim() : '';
  const text = typeof document?.text === 'string' ? document.text.trim() : '';
  if (!title || title.length > 80 || title.includes('\0') || !text || text.includes('\0')) return invalid;
  if (text.length > MAX_DOCUMENT) return { status: 413, body: { error: 'document_too_large' } };
  const sections = importSections({ text, markdown: document.markdown === true });
  if (!sections.length) return invalid;
  return { roomId: await createRoom(db, { title, sections }) };
});
