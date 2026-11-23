/* End-to-end check of the server pipeline on the in-memory DB with a scripted Claude:
   room → teammate bot → queue → my request (conflict, discussion, bot votes) → frozen section → tie → resolve → call limit. */
import assert from 'node:assert/strict';
import { mockDb } from './mockdb.mjs';

process.env.SUPABASE_URL = 'http://mock'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
const { db, T } = mockDb();
const { createRoom, sharedRoom } = await import('../api/room.js');
const { runAgent, validate, findContested } = await import('../api/_agent.js');
const { runBot } = await import('../api/bot.js');
const { runResolve } = await import('../api/_resolve.js');
const { runEdit } = await import('../api/_edit.js');
const { runDiscuss } = await import('../api/_discuss.js');
const { runProfile } = await import('../api/_profile.js');

const { SECTIONS, HISTORY } = await import('../api/_seed.js');
const AUTO = 'Timeout: 15 seconds, with one retry if there is no response';   // the teammate bot's change to section 4
const MANUAL = 'Timeout: 5 seconds';                                          // my request: back to 5 seconds
let calls = 0; const scripted = [];
const fakeClaude = async (req) => { calls++; const next = scripted.shift(); assert.ok(next, 'unexpected Claude call'); return typeof next === 'function' ? next(req) : next; };
const deps = { db, callClaude: fakeClaude, retryMs: 1 };
const s3 = () => T.sections.find((s) => s.id === 's4');   // the contested section of the default document (timeout)

// 1. room + seed
const roomId = await createRoom(db);
assert.equal(T.sections.length, SECTIONS.length); assert.equal(T.changes.length, HISTORY.length); assert.equal(T.messages.length, HISTORY.reduce((n, h) => n + h.messages.length, 0));

// 2. teammate bot: Jieun → auto-invite
scripted.push((req) => {
  assert.match(req.system, /Requester: Jieun/); assert.equal(req.messages.at(-1).role, 'user');
  return { reply: 'Raised the timeout in 4.', action: 'edit', sectionId: 's4', paras: [AUTO, 'Retry: once', 'Duplicate payment prevention: a request with the same order number is approved only once.'], summary: 'Timeout → 15 s + one retry', why: 'Overseas cards take 7 s to approve', conflict: null, discussion: null };
});
let r = await runBot({ roomId, lang: 'en' }, deps);
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(s3().paras[0], AUTO); assert.equal(s3().rev, 1); assert.equal(T.rooms[0].bots_on, true); assert.equal(T.rooms[0].agent.state, 'idle');
const jieunChange = T.changes.at(-1); assert.equal(jieunChange.by_id, 'bot_jieun');
assert.deepEqual(await runBot({ roomId, lang: 'en' }, deps), { ok: true, already: true });

// 3. queue while someone holds the agent
T.rooms[0].agent = { state: 'working', since: new Date().toISOString(), token: 'zz' };
assert.deepEqual(await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'x', lang: 'en' }, deps), { queued: true });
T.rooms[0].agent = { state: 'idle' };

// 4. my request: Korean paras rejected and retried; conflict found by the rule; discussion drafted in a 2nd call; bots vote A and B
T.messages.push({ id: 'm1', room_id: roomId, user_id: 'u_me', user_name: 'Judge', role: 'user', text: 'Set the timeout in section 4 back to 5 seconds.', meta: {}, created_at: new Date().toISOString() });
scripted.push(() => { const p = s3().paras; return { reply: 'ok', action: 'edit', sectionId: 's4', paras: ['타임아웃: 5초', p[1], p[2]], summary: 'x', why: 'y', conflict: null, discussion: null }; });
scripted.push((req) => { assert.match(req.system, /REJECTED/); const p = s3().paras; return { reply: 'Set the timeout in 4 back to 5 seconds.', action: 'edit', sectionId: 's4', paras: [MANUAL, p[1], p[2]], summary: 'Team invite → manual', why: 'Permission screen feels heavy', conflict: null, discussion: null }; });
scripted.push({ note: 'Jieun changed this to auto-invite a few minutes ago because 41% drop at the invite step.', discussion: { title: 'Team invite: automatic or manual?', titleEn: 'Team invite: automatic or manual?', question: 'Q', options: [
  { label: 'Keep auto-invite', labelEn: 'Keep auto-invite', desc: 'd', text: AUTO },
  { label: 'Switch to manual', labelEn: 'Switch to manual', desc: 'd', text: MANUAL },
  { label: 'Manual + suggestions', labelEn: 'Manual + suggestions', desc: 'd', text: 'Team invite: direct invite by email or link by default; same-domain members appear as suggestions when contacts permission is granted.' }] } });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Set the timeout in section 4 back to 5 seconds.', lang: 'en' }, deps);
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.conflict, true); assert.equal(s3().paras[0], MANUAL);
const disc = T.discussions[0]; assert.equal(disc.para_index, 0); assert.equal(disc.n, 1);
assert.deepEqual(T.votes.map((v) => [v.user_id, v.option_id]).sort(), [['bot_jieun', 'A'], ['bot_minsu', 'B']]);
const reply = T.messages.at(-1); assert.equal(reply.meta.conflict.discussion_id, disc.id); assert.equal(reply.meta.conflict.change_id, jieunChange.id);

// 5. frozen section while the discussion is open
scripted.push((req) => { assert.match(req.system, /discussion #1 on s4/); const p = s3().paras; return { reply: 'ok', action: 'edit', sectionId: 's4', paras: ['Timeout: 10 seconds', p[1], p[2]], summary: 's', why: 'w', conflict: null, discussion: null }; });
r = await runAgent({ roomId, userId: 'u_me', userName: 'Judge', text: 'Change invite again', lang: 'ko' }, deps);
assert.equal(r.action, 'none'); assert.equal(s3().paras[0], MANUAL); assert.match(T.messages.at(-1).text, /토론 #1/);
assert.equal(T.comments.at(-1).text, 'Change invite again');   // the frozen request became a comment

// 6. tie until I vote, then resolve
assert.equal((await runResolve({ roomId, discussionId: disc.id, userId: 'u_me', userName: 'Judge' }, deps)).status, 409);
T.votes.push({ discussion_id: disc.id, room_id: roomId, user_id: 'u_me', user_name: 'Judge', option_id: 'B' });
r = await runResolve({ roomId, discussionId: disc.id, userId: 'u_me', userName: 'Judge', lang: 'en' }, deps);
assert.equal(r.result, 'B'); assert.equal(s3().paras[0], MANUAL);
const s8 = T.sections.find((s) => s.id === 's8');
assert.equal(s8.paras.length, 1);
assert.match(s8.paras[0], /^Discussion #1 · Team invite: automatic or manual\?: concluded as option B Switch to manual \(2 votes, \d\d:\d\d\)\. Applied to 4\. 타임아웃과 재시도\.$/);
assert.equal(T.discussions[0].status, 'resolved'); assert.equal(T.rooms[0].agent.state, 'idle');

// 7. direct edits: frozen while a discussion is open elsewhere is fine, stale rev refused, change logged as human
const s1 = () => T.sections.find((s) => s.id === 's1');
assert.equal((await runEdit({ roomId, userId: 'u_me', userName: 'Judge', sectionId: 's1', paras: ['x'], rev: 99 }, deps)).body.error, 'stale');
const s1Before = s1().paras.length;
r = await runEdit({ roomId, userId: 'u_me', userName: 'Judge', sectionId: 's1', paras: [...s1().paras, 'A new background line.'], rev: s1().rev, lang: 'en' }, deps);
assert.equal(r.ok, true); assert.equal(s1().paras.length, s1Before + 1); assert.equal(T.changes.at(-1).kind, 'human');
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

// A recap uses the previous check as a strict cutoff, even for changes older than 30 minutes.
const { db: recapDb, T: recapTables } = mockDb();
const recapRoom = await createRoom(recapDb);
const checkedAt = Date.now() - 90 * 60 * 1000;
recapTables.changes.length = 0;
for (const [summary, timestamp] of [
  ['Before check', checkedAt - 1],
  ['At check', checkedAt],
  ['After check', checkedAt + 5 * 60 * 1000],
]) {
  await recapDb.insert('changes', [{ room_id: recapRoom, section_id: 's1', summary, created_at: new Date(timestamp).toISOString() }]);
}
const recap = await runAgent({ roomId: recapRoom, userId: 'u_reader', text: 'What changed?', checkedAt }, {
  db: recapDb,
  callClaude: async ({ system }) => {
    assert.match(system, /After check/);
    assert.doesNotMatch(system, /Before check|At check/);
    return { action: 'none', reply: 'The background changed.' };
  },
});
assert.equal(recap.action, 'none');
assert.equal(recapTables.messages.at(-1).text, 'The background changed.');
assert.equal(recapTables.changes.length, 3);

// The production library opens a single shared document without demo messages or changes.
const { db: sharedDb, T: sharedTables } = mockDb();
const sharedId = await sharedRoom(sharedDb);
assert.equal(await sharedRoom(sharedDb), sharedId);
assert.equal(sharedTables.rooms.length, 1);
assert.equal(sharedTables.sections.length, SECTIONS.length);
assert.equal(sharedTables.messages.length, 0);
assert.equal(sharedTables.changes.length, 0);

const john = await runProfile({ name: 'John' }, deps);
const emma = await runProfile({ name: 'Emma' }, deps);
assert.match(john.avatar, /^p:(hyunwoo|m1|m2|m3)$/);
assert.match(emma.avatar, /^p:(me|w1|w2|w3)$/);
assert.equal((await runProfile({ userId: john.userId }, deps)).avatar, john.avatar);

// 9. helpers
assert.ok(validate({ action: 'edit', reply: 'x', sectionId: 's9', paras: ['a'] }, T.sections).startsWith('sectionId'));
assert.equal(findContested({ sec: { id: 's1', paras: ['a', 'b'] }, paras: ['a', 'c'], recent: [], userId: 'u' }), null);
assert.equal(scripted.length, 0);
console.log(`check ok · ${calls} Claude calls · ${T.changes.length} changes · ${T.messages.length} messages`);
