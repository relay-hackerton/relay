/* Seed copied into every new room: the English onboarding spec v0.4, two earlier changes (Minsu, Jieun) and their sessions. */
export const DOC_TITLE = 'New workspace onboarding proposal';

export const INVITE_ORIGINAL = 'Team invite: enter emails to invite teammates. Copying an invite link is also supported.';

export const SECTIONS = [
  { id: 's1', num: 1, title: 'Background', paras: [
    'Of 1,240 new workspaces last quarter, only 31% had a second member join within 7 days. Solo workspaces keep 12% at day 30, a quarter of workspaces with two or more members (54%).',
    'Onboarding today has four steps: sign up → name the workspace → invite teammates → create the first project. The invite step loses 41%, the most of any step.',
  ] },
  { id: 's2', num: 2, title: 'Goals', paras: [
    'Raise 7-day activation (second member joins + first task created) from 32% to 45%.',
    'Cut the median time from sign-up to first task from 2 days 14 hours to under 24 hours.',
  ], footnote: 'Baselines from the product dashboard, last 30 days.' },
  { id: 's3', num: 3, title: 'Core features', paras: [
    'Template pick: default boards and sample tasks per team type (product · marketing · ops).',
    INVITE_ORIGINAL,
    'First-task guide: complete a sample task to learn the core actions (assign · change status · comment).',
  ] },
  { id: 's4', num: 4, title: 'User flow', steps: true, paras: [
    'Sign up → pick a template → invite teammates → complete the sample task → create my first task',
    'Each step must finish within 30 seconds and can be skipped at any point.',
  ] },
  { id: 's5', num: 5, title: 'Success metrics', page: 2, paras: [
    '7-day activation 45% (baseline 32%)',
    'Median time to first task under 24 hours (baseline 2 days 14 hours)',
    'Invite acceptance rate 65% (baseline 58%) · share of invites that sign up within 7 days',
  ] },
  { id: 's6', num: 6, title: 'Timeline', page: 2, paras: [
    'Design locked week 2 of Nov · build weeks 3–4 of Nov · 10% rollout week 1 of Dec · metrics review week 2 of Dec',
  ] },
  { id: 's7', num: 7, title: 'Roles', page: 2, paras: [
    'Chaewon: problem definition and onboarding flow design',
    'Minsu: implementation and rollout',
    'Jieun: screen design and usability testing',
    'Hyunwoo: metric design and analysis',
    'Agent: applies teammate sessions and discussion results to this document',
  ] },
  { id: 's8', num: 8, title: 'Decision log', page: 2, paras: [
    'No decisions confirmed yet. Topics under discussion are not applied to the body until concluded.',
  ] },
];
export const NO_DECISION_PREFIX = 'No decisions confirmed yet';

/* Earlier work in the room. minutesAgo is relative to room creation. */
export const HISTORY = [
  {
    by: { id: 'bot_minsu', name: 'Minsu', avatar: 'p:minsu' }, sectionId: 's2', minutesAgo: 25,
    summary: 'Rewrote both goals as dashboard baselines with numeric targets',
    why: 'Asked to replace "too abstract" goals with current numbers as baselines',
    prev: ['Make it easy for new users to form a team and reach a first result quickly.', 'Increase onboarding completion.'],
    messages: [
      { role: 'user', text: 'Section 2 goals are too abstract. Rewrite them with targets based on the dashboard numbers.' },
      { role: 'agent', text: "Last 30 days: 7-day activation is 32% and the median time to first task is 2 days 14 hours. I'll use those as baselines and target 45% / under 24 hours, with the source in a footnote." },
      { role: 'user', text: 'Good, do that.' },
      { role: 'agent', text: 'Updated 2. Goals.', applied: true },
    ],
  },
  {
    by: { id: 'bot_jieun', name: 'Jieun', avatar: 'p:jieun' }, sectionId: 's5', minutesAgo: 12,
    summary: 'Added invite acceptance rate (target 65%, baseline 58%)',
    why: 'The invite problem is acceptance, not just invite count, so it needs its own metric',
    prev: ['7-day activation 45% (baseline 32%)', 'Median time to first task under 24 hours (baseline 2 days 14 hours)'],
    messages: [
      { role: 'user', text: 'Add invite acceptance rate to section 5: the share of invites that sign up within 7 days.' },
      { role: 'agent', text: "Added. Last month's baseline was 58%, so the target is 65%.", applied: true },
    ],
  },
];

/* The teammate bot: Jieun asks the real agent to change section 3. Minsu only votes. */
export const BOTS = {
  jieun: { id: 'bot_jieun', name: 'Jieun', avatar: 'p:jieun' },
  minsu: { id: 'bot_minsu', name: 'Minsu', avatar: 'p:minsu' },
};
export const BOT_REQUEST = 'Remove typing from the invite step. We lose 41% there, so auto-invite same-domain teammates from contacts instead.';
