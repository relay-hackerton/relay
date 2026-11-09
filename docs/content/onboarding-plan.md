## Background

New workspaces that do not gather a team in their first week rarely survive. Last quarter 1,240 workspaces were created; only 31% added a second member within 7 days. Solo workspaces keep **12%** of users at day 30, while workspaces with two or more members keep **54%**.

Onboarding today has four steps: sign up → name the workspace → invite teammates → create the first project. The invite step loses 41% of people, more than all other steps combined.

| Step | Reached | Drop-off |
|---|---|---|
| Sign up | 100% | — |
| Name workspace | 92% | 8% |
| Invite teammates | 86% | 41% |
| First project | 51% | 6% |

## Goals

- Raise 7-day activation (second member joins + first task created) from **32% to 45%**.
- Cut the median time from sign-up to first task from 2 days 14 hours to **under 24 hours**.
- Keep the invite step optional: nobody should be blocked from trying the product alone.

Baselines come from the product dashboard, last 30 days, all plans.

## Invite step redesign

The invite step asks people to type email addresses for teammates they may not have decided to bring yet. Most people skip it and never come back to it.

- **Suggested teammates:** with contacts permission (Google Workspace, Slack), show people on the same email domain and let the user pick them with one click.
- **Invite link first:** a copyable link is shown before the email field; links can be pasted into the team chat where the conversation already happens.
- **Invite later, on purpose:** when someone skips, the first project gets a "Bring your team" card at the moment their work becomes shareable.
- Typed email invites remain available for people outside the domain.

> Principle: invite at the moment of value, not at the moment of sign-up.

## User flow

1. Sign up with Google, Slack or email.
2. Name the workspace; the domain is detected from the sign-up email.
3. See suggested teammates and the invite link; pick, copy or skip.
4. Create the first project from a template that matches the team size.
5. When the first task is assigned, prompt to invite the assignee if they are not in the workspace yet.

Each step can be finished in under 30 seconds; no step requires a teammate to be present.

## Success metrics

| Metric | Baseline | Target | Guardrail |
|---|---|---|---|
| 7-day activation | 32% | 45% | — |
| Second member in 7 days | 31% | 42% | — |
| Invite step completion | 59% | 75% | Skip rate stays visible |
| Time to first task (median) | 62 h | < 24 h | — |
| Spam reports per 1k invites | 0.8 | ≤ 1.0 | Hard stop above 1.5 |

```chart
title: Day-30 retention by team size at day 7
Solo | 12%
2 members | 41%
3–5 members | 54%
6+ members | 63%
```

## Rollout timeline

| Week | Milestone | Owner |
|---|---|---|
| W1 | Contacts permission + domain detection | Platform |
| W2 | Suggested teammates and invite link UI | Growth |
| W3 | "Bring your team" card in first project | Growth |
| W4 | 20% rollout, read metrics daily | Data |
| W6 | 100% rollout if guardrails hold | PM |

The experiment runs as a 50/50 A/B test during W4–W5. The decision to ship is made on 7-day activation with at least 2,000 new workspaces per arm.

## Risks and open questions

- **Privacy:** contacts permission must explain exactly what is read; we never store contacts that are not invited.
- **Wrong suggestions:** large shared domains (gmail.com, school domains) must be excluded from suggestions.
- **Invite spam:** bulk selection is capped at 20 people per day per workspace.
- Open: should the invite link expire after 7 days by default, or stay valid until revoked?
- Open: do we show suggested teammates on mobile sign-up, where contacts permission converts worse?
