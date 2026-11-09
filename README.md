# Relay — one agent, used by the whole team

**Problem.** Teams now write specs with AI, but every person talks to their own private chat. The results get pasted into one document by hand, nobody knows who changed what or why, and when two people push the AI in opposite directions the last paste silently wins.

**Relay** gives a team one shared agent. Each person talks to it in their own session; every edit lands live in one shared document with who asked, why, and the conversation behind it. When two people's edits disagree, the agent applies the newer one, says *opinions differ*, and opens a vote. The team's conclusion goes back into the body and the decision log.

> c0mpiled-17 Seoul · YC RFS Fall 2026 · **Multiplayer AI**

## Try it (3 minutes, alone)

1. Open the demo link, type your name, **Start a room**. You get your own copy of a product spec that Minsu and Jieun already worked on.
2. **Bring in a teammate.** Jieun asks the agent to change section 3. Watch the document change in place; click her name tag to see why and her conversation.
3. Send the suggested request: *"Switch the team invite in section 3 to manual invites."* The agent applies it and flags that opinions differ.
4. Open the discussion. Minsu and Jieun voted on different sides, so your vote decides. **Conclude**: the agent updates section 3 and the decision log.
5. **Copy invite link** to bring a real person in. Edit any section directly too; everyone sees it live and it is logged with a diff.

## What is real

| | |
| --- | --- |
| Shared document | Supabase Postgres, synced live to everyone in the room (Realtime) |
| The agent | Pick the model per request: Claude (Sonnet, Haiku) or OpenAI (GPT-6 Luna/Astra, Codex). One forced function call gives a fixed JSON shape; one request at a time per room, others queue |
| Who changed what and why | Every change stores author, reason, before/after and the session it came from; Activity shows GitHub-style diffs |
| Conflicts | Detected when an edit rewrites a paragraph someone else changed in the last 30 minutes; the agent drafts a 3-option discussion |
| Presence | Who is online and which section they are reading or editing |
| Direct edits | Section-level, guarded by a revision check so nobody overwrites anyone |
| Teammate bot | Jieun's request goes through the same real agent pipeline |

## How it works

```
Browser (HTML/CSS/JS, no build)  ──reads, realtime, presence, own messages & votes──▶  Supabase
        │                                                                              ▲
        └── POST /api/agent · /api/resolve · /api/edit · /api/bot · /api/room ──▶ Vercel functions ──▶ LLM (OpenAI or Claude)
                                                                       (service key: the only writer of the document)
```

- `api/_agent.js` — lock → read document, recent changes, your last 8 messages → model → validate (section exists, English body, ≤3 new paragraphs) → write section (rev check), change, discussion, reply → unlock
- `api/_resolve.js` — applies the winning option to the section and the decision log, no model call
- `supabase/schema.sql` — tables, row-level security (the browser can only read, post its own messages and vote), the agent lock
- `docs/PLAN.md` — the full build plan

## Run locally

```bash
MOCK=1 node dev-server.mjs   # no keys: in-memory DB, scripted agent, simulated realtime → http://localhost:3000
node scripts/check.mjs       # server flow test (room → bot → conflict → discussion → resolve → direct edit)
```

With real services: run `supabase/schema.sql` in Supabase, copy `.env.example` to `.env.local`, fill the keys, then `node dev-server.mjs` (or `vercel dev`).

Built in 5 hours at c0mpiled-17 Seoul, 2026-11-09.
