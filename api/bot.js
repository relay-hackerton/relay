/* POST /api/bot { roomId, lang } → { ok }  "Bring in a teammate": Jieun sends a fixed request through the real agent pipeline. */
import { db as realDb, handler, uuid } from './_lib.js';
import { runAgent } from './_agent.js';
import { BOTS, BOT_REQUEST } from './_seed.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBot(input, deps = {}) {
  const d = deps.db || realDb;
  const { roomId } = input; const lang = input.lang === 'ko' ? 'ko' : 'en';
  if (!roomId) return { status: 400, body: { error: 'roomId is required' } };
  const [room] = await d.select('rooms', `id=${d.eq(roomId)}`);
  if (!room) return { status: 404, body: { error: 'room not found' } };
  const bot = BOTS.jieun;
  if (room.bots_on) {
    const done = await d.select('changes', `room_id=${d.eq(roomId)}&by_id=${d.eq(bot.id)}&section_id=eq.s3&select=id`);
    if (done.length) return { ok: true, already: true };
  }
  await d.update('rooms', `id=${d.eq(roomId)}`, { bots_on: true });
  await d.insert('messages', [{ id: uuid(), room_id: roomId, user_id: bot.id, user_name: bot.name, role: 'user', text: BOT_REQUEST, meta: { avatar: bot.avatar, bot: true } }]);
  for (let i = 0; i < 12; i++) {
    const r = await runAgent({ roomId, userId: bot.id, userName: bot.name, text: BOT_REQUEST, lang }, deps);
    if (!r.queued) return r;
    await sleep(deps.retryMs ?? 2000);
  }
  return { queued: true };
}

export default handler((body) => runBot(body));
