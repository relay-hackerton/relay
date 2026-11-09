/* A person opens a discussion (the prototype's compose form). Bots vote on opposite ends when they are in the room. */
import { db as realDb, newId, L } from './_lib.js';
import { BOTS } from './_seed.js';

export async function runDiscuss(input, deps = {}) {
  const d = deps.db || realDb;
  const { roomId, userId } = input; const lang = input.lang === 'ko' ? 'ko' : 'en';
  const userName = String(input.userName || 'Guest').slice(0, 40);
  const title = String(input.title || '').trim().slice(0, 80);
  const question = String(input.question || '').trim().slice(0, 400);
  const sectionId = input.sectionId || null;
  const raw = Array.isArray(input.options) ? input.options : [];
  const options = raw.map((o, i) => ({ id: 'ABC'[i], label: String(o.label || '').trim().slice(0, 48), label_en: String(o.labelEn || o.label || '').trim().slice(0, 48), desc: String(o.desc || '').slice(0, 120), text: String(o.text || '').trim().slice(0, 1200) }))
    .filter((o) => o.label).slice(0, 3).map((o, i) => ({ ...o, id: 'ABC'[i] }));
  if (!roomId || !userId || !title) return { status: 400, body: { error: 'roomId, userId and title are required' } };
  if (String(userId).startsWith('bot_')) return { status: 403, body: { error: 'bots do not open discussions' } };
  if (options.length < 2) return { status: 400, body: { error: 'at least two options' } };
  const [room] = await d.select('rooms', `id=${d.eq(roomId)}`);
  if (!room) return { status: 404, body: { error: 'room not found' } };
  const discs = await d.select('discussions', `room_id=${d.eq(roomId)}&select=id,n,section_id,status`);
  if (sectionId && discs.some((x) => x.section_id === sectionId && x.status === 'open')) return { status: 409, body: { error: 'exists' } };
  const n = discs.reduce((a, x) => Math.max(a, x.n), 0) + 1;
  const disc = { id: newId('d'), room_id: roomId, n, section_id: sectionId, para_index: null, change_ids: [], title, title_en: input.titleEn || title, question, options, status: 'open', opened_by_id: userId, opened_by_name: userName };
  await d.insert('discussions', [disc]);
  if (room.bots_on) {
    const last = options[options.length - 1];
    await d.insert('votes', [
      { discussion_id: disc.id, room_id: roomId, user_id: BOTS.minsu.id, user_name: BOTS.minsu.name, option_id: last.id, comment: L(lang, `${last.label} seems right to me.`, `${last.label} 쪽이 맞는 것 같아요.`) },
      { discussion_id: disc.id, room_id: roomId, user_id: BOTS.jieun.id, user_name: BOTS.jieun.name, option_id: options[0].id, comment: L(lang, `${options[0].label} seems right to me.`, `${options[0].label} 쪽이 맞는 것 같아요.`) },
    ]);
  }
  return { ok: true, id: disc.id, n };
}
