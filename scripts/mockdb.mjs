/* In-memory stand-in for the Supabase REST helper (api/_lib.js `db`), for local tests without a project. */
import { randomUUID } from 'node:crypto';
export function mockDb() {
  const T = { rooms: [], sections: [], changes: [], messages: [], discussions: [], votes: [], reactions: [], comments: [], profiles: [] };
  const parse = (q) => {
    const f = [], o = {};
    for (const part of String(q || '').split('&').filter(Boolean)) {
      const [k, ...rest] = part.split('='); const v = decodeURIComponent(rest.join('='));
      if (['order', 'limit', 'select', 'on_conflict'].includes(k)) { o[k] = v; continue; }
      const [op, ...val] = v.split('.'); f.push({ k, op, val: val.join('.') });
    }
    return { f, o };
  };
  const match = (row, f) => f.every(({ k, op, val }) => (op === 'eq' ? String(row[k]) === val : op === 'ilike' ? String(row[k]).toLowerCase() === val.replace(/\\(.)/g, '$1').toLowerCase() : op === 'gte' ? new Date(row[k]) >= new Date(val) : true));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const db = {
    eq: (v) => `eq.${encodeURIComponent(v)}`,
    async select(table, q) {
      const { f, o } = parse(q); let rows = T[table].filter((r) => match(r, f));
      if (o.order) { const [col, dir] = o.order.split('.'); rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      if (o.limit) rows = rows.slice(0, Number(o.limit));
      return clone(rows);
    },
    async insert(table, rows) {
      const now = Date.now();
      const out = rows.map((r, i) => ({ created_at: new Date(now + i).toISOString(), ...(['messages', 'comments'].includes(table) ? { id: randomUUID() } : {}), ...(table === 'rooms' ? { agent: { state: 'idle' }, calls: 0, bots_on: false } : {}), ...clone(r) }));
      if (table === 'votes') for (const r of out) if (T.votes.some((v) => v.discussion_id === r.discussion_id && v.user_id === r.user_id)) throw new Error('duplicate vote');
      T[table].push(...out); return clone(out);
    },
    async update(table, q, patch) { const { f } = parse(q); const rows = T[table].filter((r) => match(r, f)); rows.forEach((r) => Object.assign(r, clone(patch))); return clone(rows); },
    async delete(table, q) {
      const { f } = parse(q);
      T[table] = T[table].filter((row) => !match(row, f));
    },
    async rpc(fn, a) {
      if (fn === 'create_issue') {
        const { p_id, p_title, p_issue, p_sections } = a;
        await insert('rooms', [{ id: p_id, title: p_title, issue: p_issue }]);
        await insert('sections', p_sections.map((s) => ({ ...s, room_id: p_id, rev: 0 })));
        return null;
      }
      if (fn === 'write_section_change') {
        const { p_room, p_section, p_rev, p_next, p_change, p_guard_open } = a;
        const section = T.sections.find((s) => s.room_id === p_room && s.id === p_section);
        if (!section) return 'section not found';
        if (section.rev !== p_rev) return 'stale';
        if (p_guard_open && T.discussions.some((x) => x.room_id === p_room && x.section_id === p_section && x.status === 'open')) return 'frozen';
        const prev = section.paras;
        Object.assign(section, { paras: clone(p_next), rev: p_rev + 1, last_change_id: p_change.id });
        await insert('changes', [{ ...p_change, room_id: p_room, section_id: p_section, prev, next: p_next }]);
        return 'ok';
      }
      const room = T.rooms.find((r) => r.id === a.p_room);
      if (fn === 'acquire_agent') {
        if (!room) return -1;
        const stale = room.agent.since && Date.now() - new Date(room.agent.since) > 60000;
        if (room.agent.state === 'working' && !stale) return -1;
        room.agent = { state: 'working', by_id: a.p_by_id, by_name: a.p_by_name, since: new Date().toISOString(), token: a.p_token }; room.calls++; return room.calls;
      }
      if (fn === 'release_agent') { if (room && room.agent.token === a.p_token) room.agent = { state: 'idle' }; return null; }
      throw new Error(`unknown rpc ${fn}`);
    },
  };
  const insert = db.insert;
  return { db, T };
}
