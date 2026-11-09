/* Discussion conclusion: apply the winning option to the section and the decision log. No Claude call. */
import { db as realDb, acquire, release, setAgentSection, newId, uuid, hhmm, L } from './_lib.js';
import { NO_DECISION_PREFIX } from './_seed.js';
import { RESPOND_TOOL, systemPrompt, callClaude as realClaude } from './_prompt.js';
import { validate } from './_agent.js';

const secLabel = (s) => `${s.num}. ${s.title}`;

async function writeSection(d, roomId, sectionId, make) {
  for (let i = 0; i < 2; i++) {
    const [sec] = await d.select('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sectionId)}`);
    const next = make(sec);
    const changeId = newId('c');
    const rows = await d.update('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sectionId)}&rev=eq.${sec.rev}`, { paras: next, rev: sec.rev + 1, last_change_id: changeId });
    if (rows.length) return { sec, prev: sec.paras, next, changeId };
  }
  throw new Error(`section ${sectionId} kept changing`);
}

export async function runResolve(input, deps = {}) {
  const d = deps.db || realDb;
  const { roomId, discussionId } = input;
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const userId = input.userId || 'anon', userName = String(input.userName || 'Someone').slice(0, 40);
  if (!roomId || !discussionId) return { status: 400, body: { error: 'roomId and discussionId are required' } };

  const lock = await acquire(roomId, 'agent', 'Agent', d);
  if (!lock) return { queued: true };
  try {
    const [disc] = await d.select('discussions', `id=${d.eq(discussionId)}&room_id=${d.eq(roomId)}`);
    if (!disc) return { status: 404, body: { error: 'discussion not found' } };
    if (disc.status !== 'open') return { ok: true, already: true };
    const votes = await d.select('votes', `discussion_id=${d.eq(discussionId)}`);
    const count = (id) => votes.filter((v) => v.option_id === id).length;
    const ranked = [...disc.options].sort((a, b) => count(b.id) - count(a.id));
    const top = count(ranked[0].id);
    let pick = disc.options.find((o) => o.id === input.optionId);
    if (!pick) {
      if (!top) return { status: 409, body: { error: 'no votes yet' } };
      if (ranked.filter((o) => count(o.id) === top).length > 1) return { status: 409, body: { error: 'tie' } };
      pick = ranked[0];
    }
    const at = new Date();
    const voters = votes.filter((v) => v.option_id === pick.id).map((v) => v.user_name);
    let before = null, after = null, main = null;
    if (disc.section_id) {
      await setAgentSection(roomId, lock, 'agent', 'Agent', disc.section_id, d);
      /* an option without ready text (a person opened the discussion): the model writes the section to match the conclusion */
      let drafted = null;
      if (!pick.text) {
        try {
          const sections = await d.select('sections', `room_id=${d.eq(roomId)}&order=num.asc`);
          const ask = `The team concluded discussion #${disc.n} "${disc.title_en || disc.title}" (${disc.question || ''}) with option ${pick.id}: ${pick.label_en || pick.label}${pick.desc ? ` (${pick.desc})` : ''}. Apply this decision to section ${disc.section_id} only (action "edit"). Keep everything else as it is.`;
          const out = await (deps.callClaude || realClaude)({ system: systemPrompt({ sections, recent: [], openDiscs: [], userName: 'the team', lang }), messages: [{ role: 'user', content: ask }], tool: RESPOND_TOOL, timeoutMs: 35000 });
          if (!validate(out, sections) && out.action === 'edit' && out.sectionId === disc.section_id) drafted = out.paras;
        } catch (e) { console.error('resolve draft failed', e); }
      }
      if (pick.text || drafted) {
        main = await writeSection(d, roomId, disc.section_id, (sec) => {
          if (drafted) { const ch = sec.paras.filter((p) => !drafted.includes(p)); before = ch.join('\n') || null; after = drafted.filter((p) => !sec.paras.includes(p)).join('\n') || drafted.join('\n'); return drafted; }
          const idx = Math.min(Math.max(0, disc.para_index ?? 0), sec.paras.length - 1);
          before = sec.paras[idx]; after = pick.text;
          return sec.paras.map((p, i) => (i === idx ? pick.text : p));
        });
      }
    }
    if (main) {
      await d.insert('changes', [{ id: main.changeId, room_id: roomId, section_id: disc.section_id, kind: 'discussion', by_id: 'agent', by_name: 'Agent', discussion_id: disc.id,
        summary: L(lang, `Applied discussion #${disc.n} result (option ${pick.id} ${pick.label}) as is`, `토론 #${disc.n} 결론(${pick.id}안 ${pick.label})을 그대로 반영`),
        why: L(lang, `${voters.join(' · ') || userName} chose option ${pick.id}`, `${voters.join(' · ') || userName}님이 ${pick.id}안 선택`),
        prev: main.prev, next: main.next }]);
    }
    await setAgentSection(roomId, lock, 'agent', 'Agent', 's8', d);
    const target = main ? ` Applied to ${secLabel(main.sec)}.` : '';
    const record = `Discussion #${disc.n} · ${disc.title_en || disc.title}: concluded as option ${pick.id} ${pick.label_en || pick.label} (${count(pick.id)} votes, ${hhmm(at)}).${target}`;
    const log = await writeSection(d, roomId, 's8', (sec) => [...sec.paras.filter((p) => !p.startsWith(NO_DECISION_PREFIX)), record]);
    await d.insert('changes', [{ id: log.changeId, room_id: roomId, section_id: 's8', kind: 'discussion', by_id: 'agent', by_name: 'Agent', discussion_id: disc.id,
      summary: L(lang, `Added discussion #${disc.n} result to the decision log`, `토론 #${disc.n} 결론을 결정 기록에 추가`),
      why: L(lang, 'Decisions are recorded apart from the body', '결정은 본문과 별도로 기록한다'), prev: log.prev, next: log.next }]);
    const changeId = main ? main.changeId : log.changeId;
    await d.update('discussions', `id=${d.eq(disc.id)}`, { status: 'resolved', result: pick.id, resolved_at: at.toISOString(), resolved_by_id: userId, resolved_by_name: userName,
      applied: { before: main ? before : null, after: main ? after : record, change_id: changeId, log_change_id: log.changeId, at: at.toISOString() } });
    const secName = main ? secLabel(main.sec) : null;
    const logName = secLabel(log.sec);
    const logNameKo = `${log.sec.num}. 결정 기록`;
    await d.insert('messages', [{ id: uuid(), room_id: roomId, user_id: userId, user_name: userName, role: 'agent',
      text: main
        ? L(lang, `Discussion #${disc.n} concluded as option ${pick.id} (${pick.label}), so I changed ${secName} and recorded it in ${logName}.`, `토론 #${disc.n}이 ${pick.id}안(${pick.label})으로 결론 나서 ${secName}을 바꾸고 ${logNameKo}에 남겼어요.`)
        : L(lang, `Discussion #${disc.n} concluded as option ${pick.id} (${pick.label}). I recorded it in ${logName}.`, `토론 #${disc.n}이 ${pick.id}안(${pick.label})으로 결론 나서 ${logNameKo}에 남겼어요.`),
      meta: { action: 'resolve', applied: main ? disc.section_id : 's8', change_id: changeId, log_change_id: log.changeId, discussion_id: disc.id } }]);
    return { ok: true, result: pick.id };
  } finally {
    await release(roomId, lock.token, d);
  }
}
