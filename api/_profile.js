/* Nicknames: unique across the app (case-insensitive). The server makes the user id and a random avatar the first time;
   the browser keeps { userId, name, avatar } and re-checks it on every visit. */
import { db as realDb, shortId } from './_lib.js';

export const AVATARS = ['p:me', 'p:hyunwoo', 'c:#D9503B', 'c:#8B5CF6', 'c:#0EA5A4', 'c:#2E6BE0', 'c:#1E9A66', 'c:#D28B0A'];
const RESERVED = ['agent', 'minsu', 'jieun', '에이전트', '민수', '지은'];

export async function runProfile(input, deps = {}) {
  const d = deps.db || realDb;
  const name = String(input.name || '').replace(/\s+/g, ' ').trim();
  const userId = input.userId && /^u_[a-z0-9]{6,20}$/.test(input.userId) ? input.userId : null;
  if (!name && userId) {   // look up only
    const [p] = await d.select('profiles', `user_id=${d.eq(userId)}`);
    return p ? { ok: true, userId: p.user_id, name: p.name, avatar: p.avatar } : { status: 404, body: { error: 'not_found' } };
  }
  if (name.length < 2 || name.length > 20) return { status: 400, body: { error: 'length' } };
  if (RESERVED.includes(name.toLowerCase())) return { status: 409, body: { error: 'taken' } };
  const same = await d.select('profiles', `name=ilike.${encodeURIComponent(name.replace(/[%_]/g, '\\$&'))}&select=user_id`);
  if (same.some((p) => p.user_id !== userId)) return { status: 409, body: { error: 'taken' } };
  if (userId) {
    const [mine] = await d.select('profiles', `user_id=${d.eq(userId)}`);
    if (mine) {
      if (mine.name !== name) await d.update('profiles', `user_id=${d.eq(userId)}`, { name, updated_at: new Date().toISOString() });
      return { ok: true, userId, name, avatar: mine.avatar };
    }
  }
  const id = userId || `u_${shortId(10)}`;
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  try { await d.insert('profiles', [{ user_id: id, name, avatar }]); }
  catch (e) { if (/duplicate|23505|unique/i.test(String(e.message))) return { status: 409, body: { error: 'taken' } }; throw e; }
  return { ok: true, userId: id, name, avatar };
}
