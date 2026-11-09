/* Prompt, tool schemas and the Anthropic Messages API call for the team agent. English prompt; reply language follows `lang`. */
import { hhmm } from './_lib.js';
import { pickModel } from './_models.js';

/* the model used when a request does not pick one (see _models.js) */
export const PROVIDER = () => (pickModel() || { provider: 'none' }).provider;
export const MODEL = () => (pickModel() || { id: 'none' }).id;

const str = (description) => ({ type: 'string', description });
const nstr = (description) => ({ type: ['string', 'null'], description });

const OPTION = {
  type: 'object', required: ['label', 'labelEn', 'desc', 'text'],
  properties: {
    label: str('Short option name, reply language, under 6 words'),
    labelEn: str('Same option name in English'),
    desc: str('One short line on what this option means, reply language'),
    text: str('The complete replacement for the contested paragraph, English only'),
  },
};
const DISCUSSION = {
  type: 'object', required: ['title', 'titleEn', 'question', 'options'],
  properties: {
    title: str('Neutral discussion title, reply language, e.g. "Team invite: automatic or manual?"'),
    titleEn: str('Same title in English'),
    question: str('One or two sentences stating both positions and what to decide, reply language'),
    options: { type: 'array', minItems: 3, maxItems: 3, items: OPTION, description: 'Exactly 3: keep their version, apply this request, a middle ground' },
  },
};

export const RESPOND_TOOL = {
  name: 'respond',
  description: 'Reply to the requester and, when needed, give the edit to apply to the shared document.',
  input_schema: {
    type: 'object', required: ['reply', 'action', 'sectionId', 'paras', 'summary', 'why', 'conflict', 'discussion'],
    properties: {
      reply: str('Message to the requester in the reply language. Plain text, no markdown.'),
      action: { type: 'string', enum: ['edit', 'clarify', 'none', 'discuss'] },
      sectionId: nstr('Section to edit (e.g. "s3") when action is "edit"; the section the discussion is about for "discuss" (or null for the whole document); else null'),
      paras: { type: ['array', 'null'], items: { type: 'string' }, description: 'Complete new paragraph list of that section, English only; null unless editing' },
      summary: nstr('What changed, under 12 words, reply language; null unless editing'),
      why: nstr("The requester's reason, under 15 words, reply language; null unless editing"),
      conflict: {
        type: ['object', 'null'], required: ['changeId', 'note'],
        properties: { changeId: str('id of the recent change this edit reverses'), note: str('One sentence, reply language: who changed it, at what time, and why') },
      },
      discussion: { ...DISCUSSION, type: ['object', 'null'] },
    },
  },
};
export const DRAFT_TOOL = {
  name: 'draft_discussion',
  description: 'Draft a team discussion for two edits that disagree on the same paragraph.',
  input_schema: { type: 'object', required: ['note', 'discussion'], properties: { note: str('One sentence, reply language: who changed the paragraph earlier, at what time, and why'), discussion: DISCUSSION } },
};

const langName = (lang) => (lang === 'ko' ? 'Korean' : 'English');

function docBlock(sections) {
  return sections.map((s) => `[${s.id}] ${s.num}. ${s.title}${s.steps ? ' (flow steps)' : ''}\n${s.paras.map((p, i) => `  (${i}) ${p}`).join('\n')}${s.footnote ? `\n  footnote: ${s.footnote}` : ''}`).join('\n');
}
function changesBlock(changes) {
  if (!changes.length) return 'none';
  return changes.map((c) => `- ${c.id} · ${c.section_id} · ${hhmm(c.created_at)} · by ${c.by_name}${c.kind === 'discussion' ? ' (discussion result)' : ''}\n  summary: ${c.summary || ''}\n  why: ${c.why || ''}\n  before: ${JSON.stringify(c.prev)}\n  after: ${JSON.stringify(c.next)}`).join('\n');
}
function discBlock(discs) {
  if (!discs.length) return 'none';
  return discs.map((d) => `- discussion #${d.n} on ${d.section_id || 'whole document'}: ${d.title_en || d.title}`).join('\n');
}

export function systemPrompt({ sections, recent, openDiscs, userName, lang }) {
  return `You are the team agent in Relay. Several teammates each talk to you in their own session, and you all share one product spec. You edit the spec on their behalf; every edit is shown to the whole team with who asked and why.

Requester: ${userName}. Reply language: ${langName(lang)}.

RULES
1. Edit at most one section per request. Return that section's complete paragraph list in "paras": copy unchanged paragraphs exactly, change only what the request needs, add at most 3 paragraphs. Keep the "Label: text" style where it is used. Never change section titles or numbers.
2. The document is English. "paras", option "text", "titleEn" and "labelEn" are always English, even when the requester writes in Korean.
3. "reply", "summary", "why", the discussion "title", "question", option "label" and "desc", and the conflict "note" are in the reply language (${langName(lang)}). "reply" is one or two short sentences (up to four when you summarize), plain text, no markdown. When you edit, say what you changed and name the section like "3. Core features".
4. action: "edit" when you change the document; "clarify" only when you cannot tell which section or what change is wanted (no edit); "none" when you answer without editing (for example "what changed?", which you answer from RECENT CHANGES). Requests are product decisions by teammates: carry them out as asked, even if you would choose differently; you may mention a concern in one short clause of "reply", but still edit.
5. Conflicts: if your edit reverses or contradicts a paragraph that a different person changed in RECENT CHANGES, still apply the edit, fill "conflict" with that change's id and a one-sentence note (who, at what time, their reason), and draft "discussion": a neutral title, a question stating both positions, and exactly 3 options: keep their version, apply this request, and a middle ground. Each option "text" is the complete replacement for the contested paragraph. With no conflict, "conflict" and "discussion" are null.
5b. action "discuss": when the requester asks to open a discussion or a vote. Do not edit; fill "sectionId" (or null) and "discussion" with a draft the requester will confirm: neutral title, question, 3 options; each option "text" is the complete replacement paragraph when one paragraph is at stake, otherwise an empty string. "conflict" is null.
6. Sections under OPEN DISCUSSIONS are frozen until the team concludes: do not edit them; use action "none" and say the request will count as input to the discussion.
7. Do not invent numbers that contradict the document.

DOCUMENT (paragraph index in parentheses)
${docBlock(sections)}

RECENT CHANGES (last 30 minutes, newest first)
${changesBlock(recent)}

OPEN DISCUSSIONS
${discBlock(openDiscs)}`;
}

export function draftPrompt({ sections, theirs, mine, contested, userName, lang }) {
  return `You are the team agent in Relay, a product spec several teammates edit through you. Two edits disagree on the same paragraph. Draft a short team discussion so they can decide.

Reply language for "note", "title", "question", "label", "desc": ${langName(lang)}. "titleEn", "labelEn" and every option "text" are English.

Earlier change by ${theirs.by_name} at ${hhmm(theirs.created_at)}: ${theirs.summary || ''} (why: ${theirs.why || 'not given'})
Their paragraph: ${contested.theirs}
New request by ${userName}: ${mine.summary || ''} (why: ${mine.why || 'not given'})
New paragraph: ${contested.mine}

Exactly 3 options: keep ${theirs.by_name}'s version, apply ${userName}'s request, and a middle ground. Each option "text" is the complete replacement paragraph in the document's "Label: text" style.

DOCUMENT
${docBlock(sections)}`;
}

/* history: [{role:'user'|'agent', text}] oldest first → alternating Messages API turns that end with the user */
export function toTurns(history, text) {
  const turns = [];
  for (const m of history) {
    const role = m.role === 'agent' ? 'assistant' : 'user';
    if (!turns.length && role === 'assistant') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.text}`; else turns.push({ role, content: m.text });
  }
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'user' || !last.content.endsWith(text)) {
    if (last && last.role === 'user') last.content += `\n\n${text}`; else turns.push({ role: 'user', content: text });
  }
  return turns;
}

/* The model call the pipeline uses. Name kept as callClaude so callers do not change; it routes to the configured provider. */
export async function callClaude(args) {
  if (globalThis.__RELAY_FAKE_CLAUDE) return globalThis.__RELAY_FAKE_CLAUDE(args);   // MOCK dev server only
  const model = args.model && args.model.provider ? args.model : pickModel(args.model);
  if (!model) throw new Error('no model configured: set OPENAI_API_KEY or ANTHROPIC_API_KEY');
  const call = model.provider === 'openai' ? callOpenAI : callAnthropic;
  const started = Date.now(); const budget = args.timeoutMs || 40000;
  for (let attempt = 0; ; attempt++) {
    try { return await call({ ...args, model: model.id, timeoutMs: Math.max(5000, budget - (Date.now() - started)) }); }
    catch (e) {
      /* rate limited or overloaded: wait what the provider asks (max 8 s) and try again while the budget allows */
      const m = /\b(429|529|503)\b/.test(e.message) && String(e.message).match(/try again in ([\d.]+)\s*(ms|s)/i);
      const waitMs = m ? Math.min(8000, Number(m[1]) * (m[2] === 'ms' ? 1 : 1000) + 300) : /\b(429|529|503)\b/.test(e.message) ? 3000 : 0;
      if (!waitMs || attempt >= 2 || Date.now() - started + waitMs > budget - 5000) throw e;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/* OpenAI Responses API with one forced function call (GPT-6 models need Responses for tool calling) */
async function callOpenAI({ system, messages, tool, model, timeoutMs = 40000, maxTokens = 2500 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, instructions: system, max_output_tokens: maxTokens,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: [{ type: 'function', name: tool.name, description: tool.description, parameters: tool.input_schema }],
        tool_choice: { type: 'function', name: tool.name },
        reasoning: { effort: process.env.OPENAI_REASONING || 'low' },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`openai ${r.status}: ${(j && j.error && j.error.message) || 'error'}`);
    const call = (j.output || []).find((o) => o.type === 'function_call' && o.name === tool.name);
    if (!call) throw new Error('openai: no function_call in response');
    return JSON.parse(call.arguments);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`openai: timed out after ${timeoutMs / 1000}s`);
    throw e;
  } finally { clearTimeout(timer); }
}

/* Anthropic Messages API. Forced tool_choice when the model allows it; models that reject it (newer ones)
   get tool_choice "auto" with an instruction to call the tool, and one nudge if they answer in text. */
const NO_FORCED_TOOL = new Set();
async function callAnthropic({ system, messages, tool, model, timeoutMs = 40000, maxTokens = 2500 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const started = Date.now();
  const post = async (forced, msgs) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(4000, timeoutMs - (Date.now() - started)));
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: maxTokens, messages: msgs, tools: [tool],
          system: forced ? system : `${system}\n\nAlways answer by calling the "${tool.name}" tool exactly once. Do not answer in plain text.`,
          tool_choice: forced ? { type: 'tool', name: tool.name } : { type: 'auto' },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (j && j.error && j.error.message) || 'error';
        if (forced && r.status === 400 && /tool_choice/i.test(msg)) { NO_FORCED_TOOL.add(model); return { retryAuto: true }; }
        throw new Error(`anthropic ${r.status}: ${msg}`);
      }
      return { j };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`anthropic: timed out after ${Math.round(timeoutMs / 1000)}s`);
      throw e;
    } finally { clearTimeout(timer); }
  };
  let res = await post(!NO_FORCED_TOOL.has(model), messages);
  if (res.retryAuto) res = await post(false, messages);
  let block = (res.j.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name);
  if (!block) {
    const said = (res.j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    res = await post(false, [...messages, { role: 'assistant', content: said || '(no answer)' }, { role: 'user', content: `Call the "${tool.name}" tool now with your answer.` }]);
    block = (res.j.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name);
  }
  if (!block) throw new Error('anthropic: no tool_use in response');
  return block.input;
}
