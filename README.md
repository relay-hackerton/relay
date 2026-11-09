# Relay — one agent, used by the whole team

**Problem.** Teams now write specs with AI, but every person talks to their own private chat. The results get pasted into one document by hand, nobody knows who changed what or why, and when two people push the AI in opposite directions the last paste silently wins.

**Relay** gives a team one shared agent. Each person talks to it in their own session; every edit lands live in one shared document with who asked, why, and the conversation behind it. When two people's edits disagree, the agent applies the newer one, says *opinions differ*, and opens a vote. The team's conclusion goes back into the body and the decision log.

> c0mpiled-17 Seoul · YC RFS Fall 2026 · **Multiplayer AI**

## Use the workspace

1. Choose a nickname and add an issue from the workspace. Start with a blank document, a spec template, or an imported Markdown, text, Word (`.docx`), or PDF file.
2. Open the same workspace in a second browser to see the new issue appear. Each issue has its own document, discussions, and activity URLs.
3. Edit a section directly or ask the agent to update it. Open the section's History to compare or restore an earlier version. A restore adds a revision and keeps the version it replaced.
4. Open a discussion and ask teammates to vote or comment. The opener can conclude it. For an automatically opened conflict discussion, the person who requested the conflicting edit is the opener.

The issue list is shared across the deployment. File import extracts text and supported headings in the browser. PDF import requires selectable text and supports up to 100 pages. Imports have a 10 MB file limit, a 30,000-character text limit, and a 200-section limit.

## Collaboration

| | |
| --- | --- |
| Shared document | Supabase Postgres, synced live to everyone in the room (Realtime) |
| The agent | Pick the model per request: Claude (Sonnet, Haiku) or OpenAI (GPT-6 Luna/Astra, Codex). One forced function call gives a fixed JSON shape; one request at a time per room, others queue |
| Who changed what and why | Every change stores author, reason, before/after and the session it came from; Activity shows GitHub-style diffs |
| Conflicts | Detected when an edit rewrites a paragraph someone else changed in the last 30 minutes; the agent drafts a 3-option discussion |
| Presence | Who is online and which section they are reading or editing |
| Direct edits | Section-level, guarded by a revision check so nobody overwrites anyone |
| Shared issues | New issues appear in the workspace as soon as their room and starter document are saved |

## How it works

```
Browser (HTML/CSS/JS, no build)  ──reads, realtime, presence, own messages & votes──▶  Supabase
        │                                                                              ▲
        └── POST /api/agent · /api/resolve · /api/edit · /api/bot · /api/room ──▶ Vercel functions ──▶ LLM (OpenAI or Claude)
                                                                       (service key: the only writer of the document)
```

- `api/_agent.js` — lock → read document, recent changes, your last 8 messages → model → validate (section exists, ≤3 new paragraphs) → write section (rev check), change, discussion, reply → unlock
- `api/_resolve.js` — applies the winning option to the section and the decision log, no model call
- `supabase/schema.sql` — tables, row-level security (the browser can only read, post its own messages and vote), the agent lock
- `docs/PLAN.md` — the full build plan

## Run locally

```bash
MOCK=1 node dev-server.mjs   # no keys: in-memory DB, scripted agent, simulated realtime → http://localhost:3000
node scripts/check.mjs       # server flow test (room → bot → conflict → discussion → resolve → direct edit)
```

With real services, apply `supabase/schema.sql` in Supabase, copy `.env.example` to `.env.local`, fill the keys, then run `node dev-server.mjs` (or `vercel dev`).

## Upgrade an existing deployment

Apply `supabase/schema.sql` to the target database **before** deploying this version. The schema can be reapplied and adds the issue directory and transactional section history functions. Existing rooms stay accessible through their current links. The directory lists newly created issues.

Nickname sessions now use a signed, HTTP-only cookie. Set a stable `RELAY_SESSION_SECRET` to keep sessions independent of service-role key rotation. Browsers with only a legacy local nickname need to register a new nickname. Historical authorship is preserved. To recover an open legacy discussion, a database operator can remap its `opened_by_id` to the original opener's new profile ID after verifying their identity.

Built in 5 hours at c0mpiled-17 Seoul, 2026-11-09.
