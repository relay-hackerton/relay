/* The agent pipeline shared by /api/agent and /api/bot: lock → read → Claude → validate → write → unlock. */
import { db as realDb, acquire, release, setAgentSection, newId, uuid, hhmm, hasHangul, L, LIMIT, MAX_TEXT } from './_lib.js';
import { RESPOND_TOOL, DRAFT_TOOL, systemPrompt, draftPrompt, toTurns, callClaude as realClaude } from './_prompt.js';
import { BOTS } from './_seed.js';
import { pickModel } from './_models.js';

const RECENT_MS = 30 * 60000;
const DEADLINE_MS = 52000;

const secLabel = (s) => `${s.num}. ${s.title}`;
/* indices of paragraphs in `next` that are not in `prev` (new or rewritten) */
const newIdx = (prev, next) => next.map((p, i) => (prev.includes(p) ? -1 : i)).filter((i) => i >= 0);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validate(out, sections) {
  if (!out || typeof out !== 'object') return 'no output';
  if (!['edit', 'clarify', 'none'].includes(out.action)) return 'action must be "edit", "clarify" or "none"';
  if (typeof out.reply !== 'string' || !out.reply.trim()) return '"reply" is empty';
  if (out.action !== 'edit') return null;
  const sec = sections.find((s) => s.id === out.sectionId);
  if (!sec) return `sectionId "${out.sectionId}" does not exist; use one of ${sections.map((s) => s.id).join(', ')}`;
  if (!Array.isArray(out.paras) || !out.paras.length || out.paras.some((p) => typeof p !== 'string' || !p.trim())) return '"paras" must be a non-empty list of non-empty strings';
  if (out.paras.length > sec.paras.length + 3) return `"paras" grew from ${sec.paras.length} to ${out.paras.length}; add at most 3 paragraphs`;
  if (out.paras.some(hasHangul)) return '"paras" must be English only; translate the paragraphs to English';
  if (out.discussion) {
    const o = out.discussion.options;
    if (!Array.isArray(o) || o.length !== 3) return 'discussion needs exactly 3 options';
    if (o.some((x) => !x || !x.text || hasHangul(x.text) || hasHangul(x.labelEn))) return 'discussion option "text" and "labelEn" must be English';
    if (hasHangul(out.discussion.titleEn)) return '"titleEn" must be English';
  }
  return null;
}

/* the recent change by someone else whose paragraph this edit removes or rewrites */
export function findContested({ sec, paras, recent, userId, preferId }) {
  const removed = sec.paras.map((p, k) => (paras.includes(p) ? -1 : k)).filter((k) => k >= 0);
  if (!removed.length) return null;
  const candidates = recent.filter((c) => c.section_id === sec.id && c.by_id !== userId);
  const ordered = preferId ? [...candidates.filter((c) => c.id === preferId), ...candidates.filter((c) => c.id !== preferId)] : candidates;
  for (const c of ordered) {
    const theirs = newIdx(c.prev || [], c.next || []).map((j) => c.next[j]);
    const k = removed.find((x) => theirs.includes(sec.paras[x]));
    if (k !== undefined) {
      const added = newIdx(sec.paras, paras);
      const paraIndex = paras.length === sec.paras.length ? k : (added[0] ?? Math.min(k, paras.length - 1));
      return { change: c, paraIndex, theirs: sec.paras[k], mine: paras[paraIndex] };
    }
  }
  return null;
}

async function loadContext(d, roomId, userId) {
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const [rooms, sections, recent, discs, msgs] = await Promise.all([
    d.select('rooms', `id=${d.eq(roomId)}&select=id,bots_on`),
    d.select('sections', `room_id=${d.eq(roomId)}&order=num.asc`),
    d.select('changes', `room_id=${d.eq(roomId)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=20`),
    d.select('discussions', `room_id=${d.eq(roomId)}&select=id,n,section_id,title,title_en,status&order=n.asc`),
    d.select('messages', `room_id=${d.eq(roomId)}&user_id=${d.eq(userId)}&order=created_at.desc&limit=8`),
  ]);
  if (!rooms.length) throw new Error('room_not_found');
  return { room: rooms[0], sections, recent, discs, openDiscs: discs.filter((x) => x.status === 'open'), history: msgs.reverse() };
}

async function sayAgent(d, { roomId, userId, userName }, text, meta, id = uuid()) {
  await d.insert('messages', [{ id, room_id: roomId, user_id: userId, user_name: userName, role: 'agent', text, meta }]);
}

async function askClaude(deps, ctx, input, started) {
  const system = systemPrompt({ ...ctx, userName: input.userName, lang: input.lang });
  const messages = toTurns(ctx.history, input.text);
  let out = await deps.callClaude({ system, messages, tool: RESPOND_TOOL, model: input.model });
  let err = validate(out, ctx.sections);
  if (err && Date.now() - started < 30000) {
    out = await deps.callClaude({ system: `${system}\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${err}. Answer again following the rules.`, messages, tool: RESPOND_TOOL, model: input.model, timeoutMs: Math.max(8000, DEADLINE_MS - (Date.now() - started) - 6000) });
    err = validate(out, ctx.sections);
  }
  if (err) return { action: 'clarify', reply: L(input.lang, "Sorry, I couldn't work out a clean edit for that. Could you say which section and what should change?", '죄송해요, 깔끔하게 고칠 방법을 못 찾았어요. 어느 섹션을 어떻게 바꿀지 조금 더 알려 주실래요?'), invalid: err };
  return out;
}

/* bots vote on opposite sides so a judge who is alone casts the deciding vote */
function botVotes(room, disc, contested, requesterId, lang) {
  if (!room.bots_on) return [];
  const owner = Object.values(BOTS).find((b) => b.id === contested.change.by_id) || BOTS.jieun;
  const other = Object.values(BOTS).find((b) => b.id !== owner.id);
  const rows = [];
  const add = (bot, idx, comment) => { if (bot && bot.id !== requesterId && !rows.some((r) => r.user_id === bot.id)) rows.push({ discussion_id: disc.id, room_id: room.id, user_id: bot.id, user_name: bot.name, option_id: disc.options[idx].id, comment }); };
  add(owner, 0, L(lang, 'I still think my version is the better bet. The drop-off numbers back it.', '저는 여전히 제 버전이 낫다고 봐요. 이탈 숫자가 근거예요.'));
  add(other, 1, L(lang, 'The new request makes sense to me. Fewer screens to get through.', '새 요청이 더 맞는 것 같아요. 거쳐야 할 화면이 줄어요.'));
  return rows;
}

export async function runAgent(input, deps = {}) {
  const d = deps.db || realDb; const dz = { db: d, callClaude: deps.callClaude || realClaude };
  const { roomId, userId, text } = input;
  const userName = String(input.userName || 'Guest').slice(0, 40);
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const who = { roomId, userId, userName };
  const model = pickModel(input.model) || (deps.callClaude ? { id: 'test', label: 'test', provider: 'test' } : null);
  const modelTag = model ? { id: model.id, label: model.label } : null;
  if (!roomId || !userId || !text) return { status: 400, body: { error: 'roomId, userId and text are required' } };
  if (String(text).length > MAX_TEXT) return { status: 400, body: { error: `text over ${MAX_TEXT} characters` } };

  const lock = await acquire(roomId, userId, userName, d);
  if (!lock) return { queued: true };
  const started = Date.now();
  try {
    if (lock.calls > LIMIT()) {
      await sayAgent(d, who, L(lang, `This demo room has used its ${LIMIT()} agent requests. Start a new room from the home page to keep going.`, `이 데모 방은 에이전트 요청 ${LIMIT()}회를 다 썼어요. 처음 화면에서 새 방을 만들면 이어서 써 볼 수 있어요.`), { action: 'limit' });
      return { ok: true, limited: true };
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = await loadContext(d, roomId, userId);
      const out = await askClaude(dz, ctx, { ...input, userName, lang, model }, started);
      const sec = out.action === 'edit' && ctx.sections.find((s) => s.id === out.sectionId);
      if (!sec || sameList(sec.paras, out.paras)) {
        await sayAgent(d, who, out.reply.trim(), { action: out.action === 'edit' ? 'none' : out.action, model: modelTag, ...(out.invalid ? { invalid: out.invalid } : {}) });
        return { ok: true, action: out.action };
      }
      const frozen = ctx.openDiscs.find((x) => x.section_id === sec.id);
      if (frozen) {
        await sayAgent(d, who, L(lang, `${secLabel(sec)} has discussion #${frozen.n} open, so I left it as is. Your request counts as input; I'll apply whatever the team concludes.`, `${secLabel(sec)}은 토론 #${frozen.n}이 진행 중이라 그대로 뒀어요. 요청은 의견으로 두고, 결론이 나면 그대로 반영할게요.`), { action: 'none', frozen: frozen.id });
        return { ok: true, action: 'none' };
      }

      await setAgentSection(roomId, lock, userId, userName, sec.id, d);
      const changeId = newId('c'); const messageId = uuid();
      const updated = await d.update('sections', `room_id=${d.eq(roomId)}&id=${d.eq(sec.id)}&rev=eq.${sec.rev}`, { paras: out.paras, rev: sec.rev + 1, last_change_id: changeId });
      if (!updated.length) { if (attempt === 0) continue; throw new Error('section changed while editing'); }
      const summary = (out.summary || '').trim() || L(lang, `Edited ${secLabel(sec)}`, `${secLabel(sec)} 수정`);
      const why = (out.why || '').trim() || null;
      await d.insert('changes', [{ id: changeId, room_id: roomId, section_id: sec.id, kind: 'agent', by_id: userId, by_name: userName, summary, why, prev: sec.paras, next: out.paras, message_id: messageId }]);

      /* conflict: Claude's call first, then the rule "someone else changed this paragraph in the last 30 minutes" */
      let conflict = null;
      const claudeSaid = out.conflict && ctx.recent.find((c) => c.id === out.conflict.changeId && c.by_id !== userId && c.section_id === sec.id);
      const contested = findContested({ sec, paras: out.paras, recent: ctx.recent, userId, preferId: claudeSaid ? claudeSaid.id : null })
        || (claudeSaid ? { change: claudeSaid, paraIndex: Math.max(0, newIdx(sec.paras, out.paras)[0] ?? 0), theirs: null, mine: null } : null);
      if (contested) {
        let note = claudeSaid && out.conflict.note;
        let discussion = out.discussion && Array.isArray(out.discussion.options) && out.discussion.options.length === 3 ? out.discussion : null;
        if (!discussion && Date.now() - started < 38000) {
          try {
            const draft = await dz.callClaude({
              system: draftPrompt({ sections: ctx.sections, theirs: contested.change, mine: { summary, why }, contested: { theirs: contested.theirs || (contested.change.next || []).join(' / '), mine: contested.mine || out.paras[contested.paraIndex] }, userName, lang }),
              messages: [{ role: 'user', content: 'Draft the discussion.' }], tool: DRAFT_TOOL, model, timeoutMs: Math.max(6000, DEADLINE_MS - (Date.now() - started) - 4000),
            });
            if (draft && draft.discussion && Array.isArray(draft.discussion.options) && draft.discussion.options.length === 3 && !draft.discussion.options.some((o) => hasHangul(o.text))) { discussion = draft.discussion; note = note || draft.note; }
          } catch (e) { console.error('draft failed', e); }
        }
        const ch = contested.change;
        note = note || L(lang, `${ch.by_name} changed this at ${hhmm(ch.created_at)}${ch.why ? `: ${ch.why}` : ''}.`, `${ch.by_name}님이 ${hhmm(ch.created_at)}에 같은 곳을 바꿨어요${ch.why ? `. 이유: ${ch.why}` : ''}.`);
        conflict = { change_id: ch.id, by_id: ch.by_id, by_name: ch.by_name, note };
        if (discussion) {
          const n = ctx.discs.reduce((a, x) => Math.max(a, x.n), 0) + 1;
          const options = discussion.options.map((o, i) => ({ id: 'ABC'[i], label: o.label, label_en: o.labelEn || o.label, desc: o.desc || '', text: o.text }));
          const disc = { id: newId('d'), room_id: roomId, n, section_id: sec.id, para_index: contested.paraIndex, change_ids: [ch.id, changeId], title: discussion.title, title_en: discussion.titleEn || discussion.title, question: discussion.question, options, status: 'open', opened_by_id: 'agent', opened_by_name: 'Agent' };
          await d.insert('discussions', [disc]);
          const votes = botVotes(ctx.room, disc, contested, userId, lang);
          if (votes.length) await d.insert('votes', votes);
          conflict.discussion_id = disc.id; conflict.discussion_n = n;
        }
      }
      await sayAgent(d, who, out.reply.trim(), { action: 'edit', applied: sec.id, change_id: changeId, model: modelTag, ...(conflict ? { conflict } : {}) }, messageId);
      return { ok: true, action: 'edit', changeId, conflict: !!conflict };
    }
    return { ok: false, error: 'gave up' };
  } catch (e) {
    console.error(e);
    const busy = /\b429\b|rate limit|overloaded|\b529\b/i.test(String(e.message));
    let said = false;
    try {
      await sayAgent(d, who, busy
        ? L(lang, 'The model is at its rate limit right now. Please try again in a moment.', '지금 모델 사용 한도에 걸렸어요. 잠시 뒤에 다시 보내 주세요.')
        : L(lang, "Sorry, I couldn't finish that one. Please try again.", '죄송해요, 이번 요청은 끝내지 못했어요. 다시 한 번 보내 주세요.'), { action: 'error', error: String(e.message || e).slice(0, 200) });
      said = true;
    } catch (e2) { /* ignore */ }
    return { status: 502, body: { error: busy ? 'rate_limited' : String(e.message || e).slice(0, 200), said } };
  } finally {
    await release(roomId, lock.token, d);
  }
}
