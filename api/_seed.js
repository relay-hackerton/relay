/* Seed copied into every new room: the English group ordering proposal v0.4, two earlier changes (Minsu, Jieun) and their sessions.
   A generic product spec (a food delivery app's group order), so anyone can follow it without context. */
export const DOC_TITLE = 'Group ordering proposal';

export const PAYMENT_ORIGINAL = 'Payment: the organizer pays the full amount at checkout and collects each person\'s share afterward.';

export const SECTIONS = [
  { id: 's1', num: 1, title: 'Background', paras: [
    'On weekdays, 27% of lunch orders feed three or more people, but one person places the order and pays for everyone. These orders average 4.3 people and $68, and the organizer then chases each share by bank transfer.',
    'Group ordering today has four steps: collect choices in a group chat → re-type them into one cart → pay for everyone → collect the money. The payment step loses 38% of carts, the most of any step.',
  ] },
  { id: 's2', num: 2, title: 'Goals', paras: [
    'Raise group orders (3+ people) from 27% to 35% of weekday lunch orders.',
    'Cut the median time from the first item added to the order placed from 14 minutes to under 6 minutes.',
  ], footnote: 'Baselines from the order dashboard, last 30 days.' },
  { id: 's3', num: 3, title: 'Core features', paras: [
    'Shared cart: the organizer shares one link, and everyone adds their own items. Guests can join without installing the app.',
    PAYMENT_ORIGINAL,
    'Order deadline: the organizer sets a cut-off time. Items added after it wait for the next order.',
  ] },
  { id: 's4', num: 4, title: 'User flow', steps: true, paras: [
    'Start a group order → share the link → members add items → cart locks at the deadline → order is placed',
    'Joining from the link must take under 30 seconds, with no sign-up for guests.',
  ] },
  { id: 's5', num: 5, title: 'Success metrics', page: 2, paras: [
    'Group order share of weekday lunch orders 35% (baseline 27%)',
    'Median time from first item to order under 6 minutes (baseline 14 minutes)',
    'Group cart completion 80% (baseline 62%) · share of group carts that become an order',
  ] },
  { id: 's6', num: 6, title: 'Timeline', page: 2, paras: [
    'Design locked week 1 of Jan · build weeks 2–4 of Jan · 10% rollout in two cities week 1 of Feb · metrics review week 2 of Feb',
  ] },
  { id: 's7', num: 7, title: 'Roles', page: 2, paras: [
    'Chaewon: problem definition and group order flow design',
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
    prev: ['Make ordering for a group easier.', 'Take the hassle out of collecting money afterward.'],
    messages: [
      { role: 'user', text: 'Section 2 goals are too abstract. Rewrite them with targets based on the order dashboard.' },
      { role: 'agent', text: "Last 30 days: group orders are 27% of weekday lunch orders, and the median time from first item to order is 14 minutes. I'll use those as baselines and target 35% / under 6 minutes, with the source in a footnote." },
      { role: 'user', text: 'Good, do that.' },
      { role: 'agent', text: 'Updated 2. Goals.', applied: true },
    ],
  },
  {
    by: { id: 'bot_jieun', name: 'Jieun', avatar: 'p:jieun' }, sectionId: 's5', minutesAgo: 12,
    summary: 'Added group cart completion (target 80%, baseline 62%)',
    why: 'Carts are abandoned at payment, so completion needs its own metric, not just order count',
    prev: ['Group order share of weekday lunch orders 35% (baseline 27%)', 'Median time from first item to order under 6 minutes (baseline 14 minutes)'],
    messages: [
      { role: 'user', text: 'Add group cart completion to section 5: the share of group carts that become an order.' },
      { role: 'agent', text: "Added. Last month's baseline was 62%, so the target is 80%.", applied: true },
    ],
  },
];

/* The teammate bot: Jieun asks the real agent to change section 3. Minsu only votes. */
export const BOTS = {
  jieun: { id: 'bot_jieun', name: 'Jieun', avatar: 'p:jieun' },
  minsu: { id: 'bot_minsu', name: 'Minsu', avatar: 'p:minsu' },
};
export const BOT_REQUEST = 'In section 3, stop making the organizer pay for everyone: each person pays their own share when they add items, and the delivery fee is split evenly. We lose 38% of carts at the payment step.';
