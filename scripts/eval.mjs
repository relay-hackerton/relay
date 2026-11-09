/* Prompt check against the REAL model (OpenAI or Claude, from .env.local), with the in-memory DB.
   node scripts/eval.mjs   → 10 requests (EN 7 · KO 3), a table of time, action, section, English body, conflict. */
import fs from 'node:fs';
import { mockDb } from './mockdb.mjs';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
process.env.SUPABASE_URL = 'http://mock'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
const { createRoom } = await import('../api/room.js');
const { runAgent } = await import('../api/_agent.js');
const { runBot } = await import('../api/bot.js');
const { PROVIDER, MODEL, callClaude } = await import('../api/_prompt.js');
const { hasHangul } = await import('../api/_lib.js');

const CASES = [
  { lang: 'en', text: 'What changed in the last 30 minutes?', expect: { action: 'none' } },
  { lang: 'en', text: 'Section 2 goals: add a goal about invite acceptance.', expect: { action: 'edit', section: 's2' } },
  { lang: 'en', text: 'Make the timeline in section 6 a two-stage rollout: 5% first, then 25% a week later.', expect: { action: 'edit', section: 's6' } },
  { lang: 'en', text: 'Shorten the background in section 1 to one paragraph.', expect: { action: 'edit', section: 's1' } },
  { lang: 'en', text: 'Add a usability test step to the user flow.', expect: { action: 'edit', section: 's4' } },
  { lang: 'en', text: 'bot', bot: true, expect: { action: 'edit', section: 's3', contains: /auto|contact/i } },
  { lang: 'en', text: 'Switch the team invite in section 3 to manual invites.', afterBot: true, expect: { action: 'edit', section: 's3', conflict: true } },
  { lang: 'ko', text: '3번 팀원 초대를 수동 초대로 바꿔줘', afterBot: true, expect: { action: 'edit', section: 's3', conflict: true } },
  { lang: 'ko', text: '5번 지표에 첫 작업 완료율을 추가해줘', expect: { action: 'edit', section: 's5' } },
  { lang: 'ko', text: '지금까지 뭐가 바뀌었는지 요약해줘', expect: { action: 'none' } },
];

let calls = 0, ms = 0;
const timed = async (args) => { const t = Date.now(); calls++; try { return await callClaude({ ...args, model: ONLY }); } finally { ms += Date.now() - t; } };
const ONLY = process.env.EVAL_MODEL || MODEL();
console.log(`provider ${PROVIDER()} · model ${ONLY}\n`);
const rows = [];
for (const c of CASES) {
  if (rows.length) await new Promise((r) => setTimeout(r, Number(process.env.EVAL_GAP_MS || 7000)));   // stay under low RPM limits
  const { db, T } = mockDb(); const deps = { db, callClaude: timed, retryMs: 1 };
  const roomId = await createRoom(db);
  if (c.afterBot) await runBot({ roomId, lang: c.lang }, deps);
  calls = 0; ms = 0; const t0 = Date.now();
  let r;
  if (c.bot) r = await runBot({ roomId, lang: c.lang }, deps);
  else { T.messages.push({ id: `m${Date.now()}`, room_id: roomId, user_id: 'u_eval', user_name: 'Judge', role: 'user', text: c.text, meta: {}, created_at: new Date().toISOString() }); r = await runAgent({ roomId, userId: 'u_eval', userName: 'Judge', text: c.text, lang: c.lang }, deps); }
  const took = Date.now() - t0;
  const reply = T.messages.filter((m) => m.role === 'agent').at(-1);
  const ch = T.changes.at(-1); const edited = r.action === 'edit';
  const sec = edited ? ch.section_id : '-';
  const english = edited ? !ch.next.some(hasHangul) : true;
  const disc = T.discussions.at(-1);
  const ok = (r.action === c.expect.action || (c.expect.action === 'none' && r.action === 'clarify'))
    && (!c.expect.section || sec === c.expect.section) && english && (!c.expect.conflict || !!r.conflict)
    && (!c.expect.contains || (edited && c.expect.contains.test(ch.next.join(' '))));
  rows.push({ ok: ok ? '✅' : '❌', lang: c.lang, request: c.text.slice(0, 48), s: (took / 1000).toFixed(1), calls, action: r.action || r.error || (r.body && r.body.error), section: sec, english: english ? 'yes' : 'NO', conflict: r.conflict ? `yes · ${disc ? disc.options.map((o) => o.label).join(' / ') : 'no discussion'}` : '-', reply: (reply ? reply.text : '').slice(0, 90) });
  console.log(`${rows.at(-1).ok} ${c.lang} ${(took / 1000).toFixed(1)}s ${rows.at(-1).action} ${sec} | ${rows.at(-1).reply}`);
}
console.table(rows.map(({ reply, ...x }) => x));
console.log(`${rows.filter((x) => x.ok === '✅').length}/${rows.length} passed`);
