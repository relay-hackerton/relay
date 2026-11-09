/* Nicknames: unique across the app (case-insensitive). The server makes the user id and a random avatar the first time;
   the browser keeps { userId, name, avatar } and re-checks it on every visit. */
import { db as realDb, shortId } from './_lib.js';

const portraitGroups = [
  { names: new Set(['alice', 'anna', 'emily', 'emma', 'grace', 'jane', 'julia', 'lisa', 'lucy', 'mary', 'olivia', 'sarah', 'sophia', '서연', '수빈', '예린', '유나', '지은', '하은']), portraits: ['p:me', 'p:jieun'] },
  { names: new Set(['andrew', 'daniel', 'david', 'henry', 'james', 'john', 'kevin', 'michael', 'peter', 'robert', 'thomas', 'william', '동현', '민수', '준호', '태호', '현우', '존']), portraits: ['p:minsu', 'p:hyunwoo'] },
];
const AVATARS = portraitGroups.flatMap(({ portraits }) => portraits);

function chooseAvatar(name) {
  // Only these exact nickname matches influence the portrait. Everything else uses the full pool.
  const nickname = name.toLowerCase();
  const options = portraitGroups.find(({ names }) => names.has(nickname))?.portraits || AVATARS;
  return options[Math.floor(Math.random() * options.length)];
}
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
  const avatar = chooseAvatar(name);
  try { await d.insert('profiles', [{ user_id: id, name, avatar }]); }
  catch (e) { if (/duplicate|23505|unique/i.test(String(e.message))) return { status: 409, body: { error: 'taken' } }; throw e; }
  return { ok: true, userId: id, name, avatar };
}
