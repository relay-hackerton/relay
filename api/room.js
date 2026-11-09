/* POST /api/room { document? } → { roomId }. An empty request starts the demo. */
import { db, L, newId, shortId, uuid } from './_lib.js';
import { withProfile } from './_session.js';
import { DOC_TITLE, SECTIONS, HISTORY } from './_seed.js';

const MAX_DOCUMENT = 30000;

const PAGE_CHARS = 2400;
const MAX_SECTIONS = 200;
const DECISION_LOG = SECTIONS.find((s) => s.id === 's8');

function importSections(text, { markdown, lang }) {
  const sections = [];
  let page = 1;
  for (const sourcePage of text.split('\f')) {
    let title = L(lang, 'Document', '문서');
    let lines = [];
    let used = 0;
    let headingSection;
    const finish = () => {
      const blocks = markdown ? lines.join('\n').split(/\n[ \t]*\n/) : lines;
      const paras = blocks.flatMap((block) => block.replace(/\s+/g, ' ').trim().match(/.{1,600}(?:\s|$)|.{1,600}/gu) || []);
      let part = headingSection;
      for (const text of paras) {
        const para = text.trim();
        if (!para) continue;
        if (used && used + para.length + 35 > PAGE_CHARS) {
          page++;
          used = 0;
          part = null;
        }
        if (!part) {
          const num = sections.length + 1;
          part = { id: `import-${num}`, num, title, paras: [], page };
          sections.push(part);
        }
        part.paras.push(para);
        used += para.length + 35;
      }
      lines = [];
      headingSection = null;
    };
    for (const line of sourcePage.replace(/\r\n?/g, '\n').split('\n')) {
      const heading = markdown && /^#{1,6}\s+(.+)$/.exec(line);
      if (heading) {
        finish();
        title = heading[1].trim().slice(0, 120);
        // Keep headings even when the next line is another heading.
        if (used && used + title.length + 50 > PAGE_CHARS) { page++; used = 0; }
        headingSection = { id: `import-${sections.length + 1}`, num: sections.length + 1, title, paras: [], page };
        sections.push(headingSection);
        used += title.length + 50;
      } else {
        lines.push(line);
      }
    }
    finish();
    if (used) page++;
  }
  return sections;
}

function starterSections(start, goal, lang) {
  const titles = start === 'blank' ? [L(lang, 'Document', '문서')] :
    L(lang, ['Background', 'Goals', 'Core features', 'User flow'], ['배경', '목표', '핵심 기능', '사용자 흐름']);
  return titles.map((title, i) => ({
    id: `issue-${i + 1}`, num: i + 1, title, paras: goal && i === (start === 'blank' ? 0 : 1) ? [goal] : [], page: 1,
  }));
}

function insertSections(d, roomId, sections, last = {}) {
  return d.insert('sections', sections.map((s) => ({
    room_id: roomId, id: s.id, num: s.num, title: s.title, paras: s.paras, footnote: s.footnote || null,
    steps: !!s.steps, page: s.page || 1, rev: 0, last_change_id: last[s.id] || null,
  })));
}

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
  await insertSections(d, roomId, SECTIONS, last);
  await d.insert('changes', changes);
  await d.insert('messages', messages);
  return roomId;
}

export async function runCreateRoom({ document, userId, userName }, d = db) {
  if (document === undefined) return { roomId: await createRoom(d) };
  const invalid = { status: 400, body: { error: 'invalid_document' } };
  const large = { status: 413, body: { error: 'document_too_large' } };
  const title = typeof document?.title === 'string' ? document.title.trim() : '';
  const goal = typeof document?.goal === 'string' ? document.goal.trim() : '';
  const start = document?.start ?? 'import';
  const lang = document?.lang === 'ko' ? 'ko' : 'en';
  if (!title || title.length > 80 || goal.length > 140 || /\0/.test(title + goal)) return invalid;
  if (!['blank', 'template', 'import'].includes(start)) return invalid;
  let sections;
  if (start === 'import') {
    const text = typeof document.text === 'string' ? document.text.trim() : '';
    if (!text || text.includes('\0')) return invalid;
    if (text.length > MAX_DOCUMENT) return large;
    sections = importSections(text, { markdown: document.markdown === true, lang });
    if (!sections.length) return invalid;
    if (sections.length > MAX_SECTIONS) return { status: 413, body: { error: 'document_too_many_sections' } };
  } else {
    sections = starterSections(start, goal, lang);
  }
  sections.push({ ...DECISION_LOG, num: sections.length + 1, page: sections.at(-1).page });
  const roomId = shortId(6);
  await d.rpc('create_issue', {
    p_id: roomId, p_title: title, p_issue: { goal, byId: userId, byName: userName }, p_sections: sections,
  });
  return { roomId };
}

export default withProfile((body) => runCreateRoom(body));
