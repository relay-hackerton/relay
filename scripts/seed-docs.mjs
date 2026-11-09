/* Replace every room with the two demo documents (docs/content/*.md). Uses the service key from the environment:
   node --env-file=.env.local scripts/seed-docs.mjs */
import fs from 'fs';
import { db, shortId } from '../api/_lib.js';
import { importSections } from '../api/_import.js';
import { SECTIONS } from '../api/_seed.js';

const s8 = SECTIONS.find((s) => s.id === 's8');
const docs = [
  { file: 'docs/content/onboarding-plan.md', title: 'Onboarding Improvement Plan', kind: 'shared', id: (i) => `s${i + 1}`, pages: [1, 1, 1, 2, 2, 3, 3] },
  { file: 'docs/content/checkout-funnel-analysis.md', title: 'Checkout Funnel Analysis', kind: 'import', id: (i) => `import-${i + 1}`, pages: [1, 1, 1, 2, 2, 3, 3] },
];
await db.delete('rooms', 'id=neq.__none__');   // sections, changes, messages, discussions … cascade
for (const d of docs) {
  const roomId = shortId(6);
  const secs = importSections({ text: fs.readFileSync(d.file, 'utf8'), markdown: true, title: d.title });
  await db.insert('rooms', [{ id: roomId, title: d.title, kind: d.kind }]);
  await db.insert('sections', [
    ...secs.map((s, i) => ({ room_id: roomId, id: d.id(i), num: i + 1, title: s.title, paras: s.paras, footnote: null, page: d.pages[i] || 3, rev: 0 })),
    { room_id: roomId, id: 's8', num: secs.length + 1, title: s8.title, paras: s8.paras, footnote: s8.footnote || null, page: 3, rev: 0 },
  ]);
  console.log(`${d.title}: /r/${roomId} · ${secs.length} sections`);
}
console.log('rooms now:', (await db.select('rooms', 'select=id,title,kind')).map((r) => `${r.id} ${r.kind} ${r.title}`).join(' | '));
