/* In-memory stand-in for the Supabase REST helper (api/_lib.js `db`), for local tests without a project. */
import { randomUUID } from 'node:crypto';
export function mockDb() {
  const T = { rooms: [], sections: [], changes: [], messages: [], discussions: [], votes: [], reactions: [], comments: [] };
  const parse = (q) => {
    const f = [], o = {};
    for (const part of String(q || '').split('&').filter(Boolean)) {
      const [k, ...rest] = part.split('='); const v = decodeURIComponent(rest.join('='));
      if (['order', 'limit', 'select', 'on_conflict'].includes(k)) { o[k] = v; continue; }
      const [op, ...val] = v.split('.'); f.push({ k, op, val: val.join('.') });
    }
    return { f, o };
  };
  const match = (row, f) => f.every(({ k, op, val }) => (op === 'eq' ? String(row[k]) === val : op === 'gte' ? new Date(row[k]) >= new Date(val) : true));
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
    async rpc(fn, a) {
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
  return { db, T };
}
