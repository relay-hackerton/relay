/* End-to-end check of the server pipeline on the in-memory DB with a scripted Claude:
   room → teammate bot → queue → my request (conflict, discussion, bot votes) → frozen section → tie → resolve → call limit. */
import assert from 'node:assert/strict';
import { mockDb } from './mockdb.mjs';

process.env.SUPABASE_URL = 'http://mock'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
const { db, T } = mockDb();
const { createRoom, runCreateRoom } = await import('../api/room.js');
const { runAgent, validate, findContested } = await import('../api/_agent.js');
const { runBot } = await import('../api/bot.js');
const { runResolve } = await import('../api/_resolve.js');
const { runEdit } = await import('../api/_edit.js');
const { runDiscuss } = await import('../api/_discuss.js');
const { runProfile } = await import('../api/_profile.js');
const { setSession, sessionUser } = await import('../api/_session.js');

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
assert.equal(disc.opened_by_id, 'u_me');
const callsBeforeDeniedConclusion = T.rooms[0].calls;
assert.equal((await runResolve({ roomId, discussionId: disc.id, userId: 'u_other', optionId: 'A' }, deps)).status, 403);
assert.equal(T.rooms[0].calls, callsBeforeDeniedConclusion);
assert.deepEqual(T.votes.map((v) => [v.user_id, v.option_id]).sort(), [['bot_jieun', 'A'], ['bot_minsu', 'B']]);
const reply = T.messages.at(-1); assert.equal(reply.meta.conflict.discussion_id, disc.id); assert.equal(reply.meta.conflict.change_id, jieunChange.id);

// 5. frozen section while the discussion is open
scripted.push((req) => { assert.match(req.system, /discussion #1 on s3/); const p = s3().paras; return { reply: 'ok', action: 'edit', sectionId: 's3', paras: [p[0], 'Team invite: something else.', p[2]], summary: 's', why: 'w', conflict: null, discussion: null }; });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Change invite again', lang: 'ko' }, deps);
assert.equal(r.action, 'none'); assert.equal(s3().paras[1], MANUAL); assert.match(T.messages.at(-1).text, /토론 #1/);
assert.equal(T.comments.at(-1).text, 'Change invite again');   // the frozen request became a comment

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

// 7b. a person opens a discussion; the agent drafts one on request; resolving an option without text asks the model
scripted.push({ reply: 'I prepared a discussion on 6. Timeline.', action: 'discuss', sectionId: 's6', paras: null, summary: null, why: null, conflict: null, discussion: { title: 'Rollout size?', titleEn: 'Rollout size?', question: 'q', options: [{ label: '5%', labelEn: '5%', desc: '', text: '' }, { label: '10%', labelEn: '10%', desc: '', text: '' }, { label: '25%', labelEn: '25%', desc: '', text: '' }] } });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Open a discussion on the rollout size', lang: 'en' }, deps);
assert.equal(r.action, 'discuss'); assert.equal(T.messages.at(-1).meta.compose.sectionId, 's6'); assert.equal(T.discussions.length, 1);
r = await runDiscuss({ roomId, userId: 'u_me', userName: 'Judge', sectionId: 's6', title: 'Rollout size?', question: 'q', options: [{ label: '5% first' }, { label: '10% at once' }] }, deps);
assert.equal(r.ok, true); assert.equal(r.n, 2);
assert.equal(T.votes.filter((v) => v.discussion_id === r.id).length, 2);   // bots vote when they are in the room
assert.equal((await runDiscuss({ roomId, userId: 'u_me', sectionId: 's6', title: 'x', options: [{ label: 'a' }, { label: 'b' }] }, deps)).body.error, 'exists');
const s6 = () => T.sections.find((x) => x.id === 's6');
scripted.push((req) => { assert.match(req.messages[0].content, /option A: 5% first/); return { reply: 'ok', action: 'edit', sectionId: 's6', paras: ['Design locked week 2 of Nov · build weeks 3–4 of Nov · 5% rollout week 1 of Dec · metrics review week 2 of Dec'], summary: 's', why: 'w', conflict: null, discussion: null }; });
r = await runResolve({ roomId, discussionId: T.discussions[1].id, optionId: 'A', userId: 'u_me', userName: 'Judge', lang: 'en' }, deps);
assert.equal(r.result, 'A'); assert.match(s6().paras[0], /5% rollout/); assert.match(T.sections.find((x) => x.id === 's8').paras.at(-1), /Discussion #2 · Rollout size\?: concluded as option A 5% first/);

// 8. call limit
T.rooms[0].calls = 30;
assert.equal((await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'hi', lang: 'en' }, deps)).limited, true);

// 8b. nicknames: unique (case-insensitive), kept per user id, avatar assigned once
const p1 = await runProfile({ name: 'Yoorae' }, deps); assert.equal(p1.ok, true); assert.match(p1.userId, /^u_/); assert.ok(p1.avatar);
assert.equal((await runProfile({ name: 'yoorae' }, deps)).body.error, 'taken');
assert.equal((await runProfile({ name: 'Jieun' }, deps)).body.error, 'taken');
const again = await runProfile({ name: 'Yoorae', userId: p1.userId }, deps); assert.equal(again.userId, p1.userId); assert.equal(again.avatar, p1.avatar);
const renamed = await runProfile({ name: 'Yoorae K', userId: p1.userId }, deps); assert.equal(renamed.name, 'Yoorae K');
assert.equal((await runProfile({ userId: p1.userId }, deps)).name, 'Yoorae K');
assert.equal((await runProfile({ name: 'x' }, deps)).body.error, 'length');

// A signed session cannot be transferred to a different profile by changing the user ID.
const headers = {};
setSession({ headers: { 'x-forwarded-proto': 'https' } }, { setHeader: (k, v) => { headers[k] = v; } }, p1.userId);
assert.match(headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Secure/);
const cookie = headers['Set-Cookie'].split(';')[0];
assert.equal(sessionUser({ headers: { cookie } }), p1.userId);
assert.equal(sessionUser({ headers: { cookie: cookie.replace(p1.userId, 'u_forged001') } }), null);

const owner = { userId: p1.userId, userName: renamed.name };
const { roomId: shared } = await runCreateRoom({ ...owner, document: { title: 'Shared', goal: 'Team goal', start: 'template' } }, db);
const { roomId: imported } = await runCreateRoom({ ...owner, document: { title: 'Imported', start: 'import', text: '# Heading\nOriginal text.\fSecond page.', markdown: true } }, db);
assert.equal(T.rooms.find((row) => row.id === shared).issue.goal, 'Team goal');
assert.equal(T.rooms.find((row) => row.id === roomId).issue, undefined);
const imports = T.sections.filter((s) => s.room_id === imported);
assert.deepEqual(imports.map((s) => [s.title, s.page]), [['Heading', 1], ['Document', 2], ['Decision log', 2]]);
assert.equal(validate({ action: 'edit', reply: '수정했어요', sectionId: imports[0].id, paras: ['원본 문장'] }, imports), null);
const target = T.sections.find((s) => s.room_id === shared && s.id === 'issue-1');
const write = { ...owner, roomId: shared, sectionId: target.id };
const edited = await runEdit({ ...write, rev: 0, paras: ['First draft'] }, deps);
assert.equal(edited.ok, true);
const restore = { changeId: edited.changeId, version: 'before' };
assert.equal((await runEdit({ ...write, roomId: imported, sectionId: imports[0].id, rev: 0, restore }, deps)).body.error, 'version_not_found');
assert.equal((await runEdit({ ...write, rev: 0, restore }, deps)).body.error, 'stale');
const restored = await Promise.all([runEdit({ ...write, rev: 1, restore }, deps), runEdit({ ...write, rev: 1, restore }, deps)]);
assert.equal(restored.filter((result) => result.ok).length, 1);
assert.equal(restored.find((result) => !result.ok).body.error, 'stale');
assert.deepEqual(target.paras, []);
assert.deepEqual(T.changes.at(-1).prev, ['First draft']);
assert.equal((await runDiscuss({ ...write, title: 'Choose a draft', options: [{ label: 'A' }, { label: 'B' }] }, deps)).ok, true);
assert.equal((await runEdit({ ...write, rev: 2, restore: { ...restore, version: 'after' } }, deps)).body.error, 'frozen');

// 9. helpers
assert.ok(validate({ action: 'edit', reply: 'x', sectionId: 's9', paras: ['a'] }, T.sections).startsWith('sectionId'));
assert.equal(findContested({ sec: { id: 's1', paras: ['a', 'b'] }, paras: ['a', 'c'], recent: [], userId: 'u' }), null);
assert.equal(scripted.length, 0);
console.log(`check ok · ${calls} Claude calls · ${T.changes.length} changes · ${T.messages.length} messages`);
