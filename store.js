/* Store: the only way the screen talks to the backend. Supabase (anon key) for reads, realtime, presence,
   my messages and votes; /api/* for everything the agent writes. */
window.Store = (() => {
  const cfg = window.RELAY_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const handlers = {};
  let channel = null, roomId = null, me = null, presence = {}, buffering = true, buffer = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function emit(kind, payload) { (handlers[kind] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error(e); } }); }
  function on(kind, cb) { (handlers[kind] ||= []).push(cb); return () => { handlers[kind] = handlers[kind].filter((x) => x !== cb); }; }
  function need() { if (!sb) throw new Error('not_configured'); }

  async function api(path, body) {
    let r, j = {};
    try { r = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
    catch (e) { return { error: 'network' }; }
    try { j = await r.json(); } catch (e) { /* empty body */ }
    if (!r.ok && !j.error) j.error = `HTTP ${r.status}`;
    return j;
  }

  function presenceList() {
    return Object.values(channel ? channel.presenceState() : {}).map((arr) => arr[arr.length - 1]).filter(Boolean);
  }

  /* subscribe first, then read; events that arrive during the read are replayed after the caller has the snapshot */
  async function join(id, user) {
    need();
    roomId = id; me = { ...user }; presence = { userId: user.userId, name: user.name, avatar: user.avatar, sectionId: null, typing: false };
    buffering = true; buffer = [];
    if (channel) { await sb.removeChannel(channel); channel = null; }
    channel = sb.channel(`room:${id}`, { config: { presence: { key: user.userId } } });
    const tables = { sections: 'sections', changes: 'changes', messages: 'messages', discussions: 'discussions', votes: 'votes', rooms: 'room' };
    Object.entries(tables).forEach(([table, kind]) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: table === 'rooms' ? `id=eq.${id}` : `room_id=eq.${id}` }, (p) => {
        const ev = { type: p.eventType, row: p.eventType === 'DELETE' ? p.old : p.new };
        if (buffering) buffer.push([kind, ev]); else emit(kind, ev);
      });
    });
    channel.on('presence', { event: 'sync' }, () => emit('presence', presenceList()));
    let joined = false, lost = false;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 6000);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer); try { await channel.track(presence); } catch (e) { console.error(e); }
          if (joined && lost) { lost = false; emit('status', 'live'); emit('resync', 'reconnected'); }   // events may have been missed while away
          joined = true; resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(timer); console.warn('realtime', status); if (joined) { lost = true; emit('status', 'offline'); } resolve(); }
      });
    });
    const snap = await snapshot();
    setTimeout(() => { buffering = false; const b = buffer; buffer = []; b.forEach(([k, ev]) => emit(k, ev)); }, 0);
    return snap;
  }

  /* the whole room as it is now; used on join and to catch up after a dropped connection */
  async function snapshot() {
    const id = roomId;
    const q = (table) => sb.from(table).select('*').eq('room_id', id);
    const [room, sections, changes, messages, discussions, votes] = await Promise.all([
      sb.from('rooms').select('*').eq('id', id).maybeSingle(),
      q('sections').order('num'),
      q('changes').order('created_at'),
      q('messages').order('created_at').limit(1000),
      q('discussions').order('n'),
      q('votes'),
    ]);
    const err = [room, sections, changes, messages, discussions, votes].find((x) => x.error);
    if (err) throw new Error(err.error.message);
    if (!room.data) throw new Error('room_not_found');
    return { room: room.data, sections: sections.data, changes: changes.data, messages: messages.data, discussions: discussions.data, votes: votes.data, presence: presenceList() };
  }

  /* coming back to a tab that was hidden for a while: catch up in case the socket slept */
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (roomId && hiddenAt && Date.now() - hiddenAt > 20000) emit('resync', 'visible');
    hiddenAt = 0;
  });
  window.addEventListener('online', () => { if (roomId) emit('resync', 'online'); });

  /* my message → messages, then /api/agent; while another request holds the agent, retry every 2 s */
  async function say(text, { lang = 'en', onQueued } = {}) {
    need();
    const body = String(text).trim().slice(0, 500);
    if (!body) return { error: 'empty' };
    const ins = await sb.from('messages').insert({ room_id: roomId, user_id: me.userId, user_name: me.name, role: 'user', text: body, meta: { avatar: me.avatar } });
    if (ins.error) return { error: ins.error.message };
    for (let i = 0; i < 45; i++) {
      const res = await api('agent', { roomId, userId: me.userId, userName: me.name, text: body, lang });
      if (!res.queued) { if (onQueued) onQueued(false); return res; }
      if (onQueued) onQueued(true);
      await wait(2000);
    }
    if (onQueued) onQueued(false);
    return { error: 'queue_timeout' };
  }

  async function vote(discussionId, optionId) {
    need();
    const r = await sb.from('votes').upsert({ discussion_id: discussionId, room_id: roomId, user_id: me.userId, user_name: me.name, option_id: optionId }, { onConflict: 'discussion_id,user_id' });
    return r.error ? { error: r.error.message } : { ok: true };
  }

  async function resolve(discussionId, optionId, { lang = 'en' } = {}) {
    for (let i = 0; i < 30; i++) {
      const res = await api('resolve', { roomId, discussionId, optionId: optionId || undefined, userId: me.userId, userName: me.name, lang });
      if (!res.queued) return res;
      await wait(2000);
    }
    return { error: 'queue_timeout' };
  }

  const bot = ({ lang = 'en' } = {}) => api('bot', { roomId, lang });
  /* a direct edit of one section; rev is the version I started from */
  const edit = (sectionId, paras, rev, { lang = 'en' } = {}) => api('edit', { roomId, userId: me.userId, userName: me.name, sectionId, paras, rev, lang });
  const createRoom = async () => { const r = await api('room', {}); if (!r.roomId) throw new Error(r.error || 'room_failed'); return r.roomId; };

  let lastTrack = '';
  function setPresence(patch) {
    presence = { ...presence, ...patch };
    const key = JSON.stringify(presence);
    if (!channel || key === lastTrack) return;
    lastTrack = key; channel.track(presence).catch(() => {});
  }

  return { join, snapshot, on, say, vote, resolve, bot, edit, setPresence, createRoom, configured: () => !!sb, me: () => me, roomId: () => roomId };
})();
