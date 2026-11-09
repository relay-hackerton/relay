/* End-to-end check of the server pipeline on the in-memory DB with a scripted Claude:
   room → teammate bot → queue → my request (conflict, discussion, bot votes) → frozen section → tie → resolve → call limit. */
import assert from 'node:assert/strict';
import { mockDb } from './mockdb.mjs';

process.env.SUPABASE_URL = 'http://mock'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
const { db, T } = mockDb();
const { createRoom } = await import('../api/room.js');
const { runAgent, validate, findContested } = await import('../api/_agent.js');
const { runBot } = await import('../api/bot.js');
const { runResolve } = await import('../api/_resolve.js');
const { runEdit } = await import('../api/_edit.js');

const AUTO = 'Team invite: with contacts permission (Google · Slack), auto-invite members on the same domain. The permission screen can be skipped.';
const MANUAL = 'Team invite: invite teammates directly by email or invite link.';
let calls = 0; const scripted = [];
const fakeClaude = async (req) => { calls++; const next = scripted.shift(); assert.ok(next, 'unexpected Claude call'); return typeof next === 'function' ? next(req) : next; };
const deps = { db, callClaude: fakeClaude, retryMs: 1 };
const s3 = () => T.sections.find((s) => s.id === 's3');

// 1. room + seed
const roomId = await createRoom(db);
assert.equal(T.sections.length, 8); assert.equal(T.changes.length, 2); assert.equal(T.messages.length, 6);

// 2. teammate bot: Jieun → auto-invite
scripted.push((req) => {
  assert.match(req.system, /Requester: Jieun/); assert.equal(req.messages.at(-1).role, 'user');
  const p = s3().paras; return { reply: 'Switched team invite in 3. Core features to auto-invite.', action: 'edit', sectionId: 's3', paras: [p[0], AUTO, p[2]], summary: 'Team invite → contacts auto-invite', why: '41% drop at the invite step', conflict: null, discussion: null };
});
let r = await runBot({ roomId, lang: 'en' }, deps);
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(s3().paras[1], AUTO); assert.equal(s3().rev, 1); assert.equal(T.rooms[0].bots_on, true); assert.equal(T.rooms[0].agent.state, 'idle');
const jieunChange = T.changes.at(-1); assert.equal(jieunChange.by_id, 'bot_jieun');
assert.deepEqual(await runBot({ roomId, lang: 'en' }, deps), { ok: true, already: true });

// 3. queue while someone holds the agent
T.rooms[0].agent = { state: 'working', since: new Date().toISOString(), token: 'zz' };
assert.deepEqual(await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'x', lang: 'en' }, deps), { queued: true });
T.rooms[0].agent = { state: 'idle' };

// 4. my request: Korean paras rejected and retried; conflict found by the rule; discussion drafted in a 2nd call; bots vote A and B
T.messages.push({ id: 'm1', room_id: roomId, user_id: 'u_me', user_name: 'Judge', role: 'user', text: 'Switch the team invite in section 3 to manual invites.', meta: {}, created_at: new Date().toISOString() });
scripted.push(() => { const p = s3().paras; return { reply: 'ok', action: 'edit', sectionId: 's3', paras: [p[0], '팀원 초대: 직접', p[2]], summary: 'x', why: 'y', conflict: null, discussion: null }; });
scripted.push((req) => { assert.match(req.system, /REJECTED/); const p = s3().paras; return { reply: 'Switched team invite in 3. Core features to manual invites.', action: 'edit', sectionId: 's3', paras: [p[0], MANUAL, p[2]], summary: 'Team invite → manual', why: 'Permission screen feels heavy', conflict: null, discussion: null }; });
scripted.push({ note: 'Jieun changed this to auto-invite a few minutes ago because 41% drop at the invite step.', discussion: { title: 'Team invite: automatic or manual?', titleEn: 'Team invite: automatic or manual?', question: 'Q', options: [
  { label: 'Keep auto-invite', labelEn: 'Keep auto-invite', desc: 'd', text: AUTO },
  { label: 'Switch to manual', labelEn: 'Switch to manual', desc: 'd', text: MANUAL },
  { label: 'Manual + suggestions', labelEn: 'Manual + suggestions', desc: 'd', text: 'Team invite: direct invite by email or link by default; same-domain members appear as suggestions when contacts permission is granted.' }] } });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Switch the team invite in section 3 to manual invites.', lang: 'en' }, deps);
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.conflict, true); assert.equal(s3().paras[1], MANUAL);
const disc = T.discussions[0]; assert.equal(disc.para_index, 1); assert.equal(disc.n, 1);
assert.deepEqual(T.votes.map((v) => [v.user_id, v.option_id]).sort(), [['bot_jieun', 'A'], ['bot_minsu', 'B']]);
const reply = T.messages.at(-1); assert.equal(reply.meta.conflict.discussion_id, disc.id); assert.equal(reply.meta.conflict.change_id, jieunChange.id);

// 5. frozen section while the discussion is open
scripted.push((req) => { assert.match(req.system, /discussion #1 on s3/); const p = s3().paras; return { reply: 'ok', action: 'edit', sectionId: 's3', paras: [p[0], 'Team invite: something else.', p[2]], summary: 's', why: 'w', conflict: null, discussion: null }; });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Change invite again', lang: 'ko' }, deps);
assert.equal(r.action, 'none'); assert.equal(s3().paras[1], MANUAL); assert.match(T.messages.at(-1).text, /토론 #1/);

// 6. tie until I vote, then resolve
assert.equal((await runResolve({ roomId, discussionId: disc.id, userId: 'u_me', userName: 'Judge' }, deps)).status, 409);
T.votes.push({ discussion_id: disc.id, room_id: roomId, user_id: 'u_me', user_name: 'Judge', option_id: 'B' });
r = await runResolve({ roomId, discussionId: disc.id, userId: 'u_me', userName: 'Judge', lang: 'en' }, deps);
assert.equal(r.result, 'B'); assert.equal(s3().paras[1], MANUAL);
const s8 = T.sections.find((s) => s.id === 's8');
assert.equal(s8.paras.length, 1);
assert.match(s8.paras[0], /^Discussion #1 · Team invite: automatic or manual\?: concluded as option B Switch to manual \(2 votes, \d\d:\d\d\)\. Applied to 3\. Core features\.$/);
assert.equal(T.discussions[0].status, 'resolved'); assert.equal(T.rooms[0].agent.state, 'idle');

// 7. direct edits: frozen while a discussion is open elsewhere is fine, stale rev refused, change logged as human
const s1 = () => T.sections.find((s) => s.id === 's1');
assert.equal((await runEdit({ roomId, userId: 'u_me', userName: 'Judge', sectionId: 's1', paras: ['x'], rev: 99 }, deps)).body.error, 'stale');
r = await runEdit({ roomId, userId: 'u_me', userName: 'Judge', sectionId: 's1', paras: [...s1().paras, 'A new background line.'], rev: s1().rev, lang: 'en' }, deps);
assert.equal(r.ok, true); assert.equal(s1().paras.length, 3); assert.equal(T.changes.at(-1).kind, 'human');
assert.equal((await runEdit({ roomId, userId: 'bot_jieun', sectionId: 's1', paras: ['x'] }, deps)).status, 403);

// 8. call limit
T.rooms[0].calls = 30;
assert.equal((await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'hi', lang: 'en' }, deps)).limited, true);

// 9. helpers
assert.ok(validate({ action: 'edit', reply: 'x', sectionId: 's9', paras: ['a'] }, T.sections).startsWith('sectionId'));
assert.equal(findContested({ sec: { id: 's1', paras: ['a', 'b'] }, paras: ['a', 'c'], recent: [], userId: 'u' }), null);
assert.equal(scripted.length, 0);
console.log(`check ok · ${calls} Claude calls · ${T.changes.length} changes · ${T.messages.length} messages`);
