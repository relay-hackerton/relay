/* Browser stand-in for supabase-js in MOCK mode: queries and inserts go to the dev server's in-memory DB, realtime and presence over SSE. */
(() => {
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  class Query {
    constructor(table) { this.q = { table, filters: [], order: null, limit: null, single: false }; }
    select() { return this; }
    eq(k, v) { this.q.filters.push([k, v]); return this; }
    order(col, opt) { this.q.order = [col, opt && opt.ascending === false ? 'desc' : 'asc']; return this; }
    limit(n) { this.q.limit = n; return this; }
    maybeSingle() { this.q.single = true; return this; }
    then(res, rej) { return post('/mock/query', this.q).then(res, rej); }
    insert(row) { return post('/mock/insert', { table: this.q.table, rows: [].concat(row) }); }
    upsert(row, opt) { return post('/mock/upsert', { table: this.q.table, rows: [].concat(row), onConflict: opt && opt.onConflict }); }
  }
  class Channel {
    constructor(name, opts) { this.room = name.replace(/^room:/, ''); this.key = opts.config.presence.key; this.subs = []; this.presence = {}; this.syncs = []; }
    on(kind, filter, cb) { if (kind === 'presence') this.syncs.push(cb); else this.subs.push({ table: filter.table, cb }); return this; }
    subscribe(cb) {
      this.es = new EventSource(`/mock/events?room=${encodeURIComponent(this.room)}`);
      this.es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.presence) { this.presence = ev.presence; this.syncs.forEach((f) => f()); return; }
        this.subs.filter((s) => s.table === ev.table).forEach((s) => s.cb({ eventType: ev.eventType, new: ev.row, old: ev.row }));
      };
      this.es.onopen = () => cb('SUBSCRIBED');
      return this;
    }
    track(state) { return post('/mock/presence', { room: this.room, key: this.key, state }); }
    presenceState() { return this.presence; }
  }
  window.supabase = { createClient: () => ({ from: (t) => new Query(t), channel: (n, o) => new Channel(n, o), removeChannel: async (c) => { if (c.es) c.es.close(); } }) };
})();
