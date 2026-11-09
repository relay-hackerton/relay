# Submission copy (c0mpiled-17 Seoul)

Paste-ready text for the submission form. Fill the two links at the end.

**Project name:** Relay

**Track (YC RFS Fall 2026):** Multiplayer AI

**One-liner:** One AI agent for the whole team: everyone talks to it in their own session, every edit lands live in one shared document with who asked and why, and when edits disagree the agent opens a vote.

**Problem (2–3 sentences):** Teams already write specs with AI, but each person uses a private chat and pastes the result into a shared doc by hand. Nobody can see who changed what or why, and when two people push the AI in opposite directions, the last paste silently wins.

**Solution:** Relay gives the team one shared agent. Each person keeps their own session; the agent edits one shared document live, and every change records the author, the reason, the before/after and the conversation behind it. When an edit reverses something a teammate changed minutes ago, the agent still applies it, says "opinions differ", and opens a three-option discussion. The team votes and the agent writes the conclusion into the body and the decision log. People can also edit sections directly, seen live by everyone.

**What is real in the demo:** live shared document (Supabase Realtime), presence and live drafts, the agent (Claude Sonnet 5.5 by default, model picker with Claude Haiku, GPT-6 and Codex), conflict detection and discussion drafting, votes and conclusions, activity log with GitHub-style diffs, export to Markdown/HTML/PDF/JSON. The "teammate" button sends a real request through the same agent, so a judge alone can still feel the multiplayer part.

**How we built it (5 hours):** plain HTML/CSS/JS front end (no build), Vercel serverless functions, Supabase Postgres + Realtime + row-level security (the browser can only read, post its own messages and vote; only the server writes the document), one forced tool call per request for a fixed JSON shape, a per-room lock so requests queue instead of overwriting each other.

**Demo video (≤ 2 min):** <YouTube or Loom link>

**GitHub:** https://github.com/relay-hackerton/relay

**Live link:** <https://….vercel.app>
