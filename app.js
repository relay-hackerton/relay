/* Relay MVP: the prototype's screens, driven by Store (Supabase + /api). One agent, many people, every change traceable, live. */
(() => {
  const { MEMBERS, EXTRA_MEMBERS, DOC_EN, LIBRARY } = window.SEED;
  const DOC = DOC_EN;                      // the shared document body is English; UI strings follow the language toggle
  const { t, lang } = window.RelayI18N;
  const Diff = window.RelayDiff;
  const Store = window.Store;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => { if (!d) return ''; d = d instanceof Date ? d : new Date(d); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const RECENT_MS = 8000, RECENT_CHANGE_MS = 30 * 60000;
  const ICON = {
    back: 'm15 5-7 7 7 7', next: 'm9 5 7 7-7 7', close: 'm6 6 12 12M6 18 18 6', plus: 'M12 5v14M5 12h14',
    lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z', link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z', userplus: 'M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6',
    panel: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm11 0v14', check: 'm5 12 5 5 9-10',
    minus: 'M5 12h14', unlock: 'M7 11V7a5 5 0 0 1 9.9-1M5 11h14v10H5z',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n]}"/></svg>`;

  /* ---------- people: whoever shows up in presence, messages, changes and votes ---------- */
  const PHOTOS = { me: ['img/me.jpg', '#D9503B'], minsu: ['img/minsu.jpg', '#2E6BE0'], jieun: ['img/jieun.jpg', '#1E9A66'], hyunwoo: ['img/hyunwoo.jpg', '#D28B0A'] };
  const AVATARS = Object.keys(PHOTOS).map((id) => `p:${id}`);
  const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const BOTS = { bot_jieun: { name: 'Jieun', avatar: 'p:jieun' }, bot_minsu: { name: 'Minsu', avatar: 'p:minsu' } };
  const people = new Map();
  const hashColor = (id) => { const c = ['#D9503B', '#2E6BE0', '#1E9A66', '#D28B0A', '#8B5CF6', '#0EA5A4']; let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return c[h % c.length]; };
  function learn(id, name, av) {
    if (!id || id === 'agent') return;
    const cur = people.get(id) || {};
    av = av || cur.avatar || (BOTS[id] && BOTS[id].avatar);
    let photo = null, color = hashColor(id);
    if (av && av.startsWith('p:') && PHOTOS[av.slice(2)]) [photo, color] = PHOTOS[av.slice(2)];
    else if (av && av.startsWith('c:')) color = av.slice(2);
    people.set(id, { id, name: name || cur.name || '?', avatar: av, photo, color, bot: id.startsWith('bot_') });
  }
  Object.entries(BOTS).forEach(([id, b]) => learn(id, b.name, b.avatar));
  const member = (id) => id === 'agent' ? { id, name: t('agent_name'), color: MEMBERS.agent.color } : (people.get(id) || { id, name: '?', color: hashColor(id) });
  const name = (id) => member(id).name;
  const agentPhoto = (status) => MEMBERS.agent.photos[status] || MEMBERS.agent.photo;
  const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
  const avatar = (mid, cls = '', status = null) => {
    if (mid === 'agent') return `<span class="av agent ${cls}"><img src="${agentPhoto(status || 'idle')}" alt="${esc(t('agent'))}"></span>`;
    const m = member(mid);
    return m.photo ? `<span class="av ${cls}" style="--c:${m.color}"><img src="${m.photo}" alt="${esc(m.name)}"></span>` : `<span class="av ${cls}" style="--c:${m.color}" title="${esc(m.name)}">${esc(initial(m.name))}</span>`;
  };

  /* ---------- state ---------- */
  const state = {
    view: 'home', tab: 'doc', me: null, roomId: null, room: null, viewing: null, landing: { busy: false, err: '' },
    importedRooms: loadImportedRooms(),
    zoom: 100, page: 1, units: clone(LIBRARY).map((u) => (u.live ? { ...u, title: DOC_EN.title } : u)), issueDraft: null,
    myPrivate: false,   // per visit: a session starts public
    sections: [], changeList: [], messages: [], discRows: [], votes: [], presence: [],
    editing: {}, recent: {}, showDiff: {}, unread: new Set(), lastSeen: {},
    openPop: null, popMeta: null, openEntry: null, openDiffs: new Set(), logCat: 'all', logMember: 'all',
    ctx: null, pending: false, queued: false, resolving: null, botBusy: false, conclusion: {}, collapsed: false, localMsgs: [],
    animating: 0, docDirty: false, agentStatus: 'idle', myEdit: null, saving: false,
    reactions: [], commentRows: [], draftDisc: null,
    models: [], model: (() => { try { return localStorage.getItem('relay.model') || ''; } catch (e) { return ''; } })(),
  };
  const ME = () => state.me && state.me.userId;

  const normSection = (r) => ({ id: r.id, num: r.num, title: r.title, paras: r.paras || [], footnote: r.footnote, steps: r.steps, page: r.page || 1, rev: r.rev, lastChangeId: r.last_change_id });
  const normChange = (r) => ({ id: r.id, sectionId: r.section_id, kind: r.kind, by: r.by_id, byName: r.by_name, summary: r.summary || '', why: r.why, prev: r.prev || [], next: r.next || [], discussionId: r.discussion_id, messageId: r.message_id, at: new Date(r.created_at) });
  const normMessage = (r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, role: r.role, text: r.text, meta: r.meta || {}, at: new Date(r.created_at) });
  const upsert = (list, item, key = (x) => x.id) => { const i = list.findIndex((x) => key(x) === key(item)); if (i >= 0) list[i] = item; else list.push(item); return i < 0; };

  const secById = (id) => state.sections.find((s) => s.id === id);
  const importedRoom = () => state.sections[0]?.id.startsWith('import-');
  const documentLede = () => importedRoom() ? '' : DOC.lede;
  const secLabel = (id) => { const s = secById(id); return s ? `${s.num}. ${s.title}` : t('no_section'); };
  const secRef = (id) => secById(id) ? `<span class="sec-ref" data-goto="${id}">${esc(secLabel(id))}</span>` : t('no_section');
  const changesOf = (sid) => state.changeList.filter((c) => c.sectionId === sid);
  const changeById = (cid) => state.changeList.find((c) => c.id === cid);
  const latestChange = (sid) => { const s = secById(sid); const byId = s && s.lastChangeId && changeById(s.lastChangeId); if (byId) return byId; const l = changesOf(sid); return l.length ? l[l.length - 1] : null; };
  const likesOf = (cid) => state.reactions.filter((r) => r.change_id === cid).map((r) => r.user_id);
  function likeHtml(c, cls = '') {
    const likes = likesOf(c.id); const mine = likes.includes(ME());
    const names = likes.map(name).join(' · ');
    return `<button class="like ${mine ? 'on' : 'off'} ${cls}" data-like="${c.id}" aria-pressed="${mine}" title="${esc(names ? t('liked_by', { names }) : t('like'))}"><span class="emoji">👍</span>${likes.length ? `<span class="n">${likes.length}</span>` : ''}</button>`;
  }
  async function toggleLike(cid) {
    const c = changeById(cid); if (!c) return;
    const on = !likesOf(cid).includes(ME());
    if (on) state.reactions.push({ change_id: cid, room_id: state.roomId, user_id: ME(), user_name: state.me.name, created_at: new Date().toISOString() });
    else state.reactions = state.reactions.filter((r) => !(r.change_id === cid && r.user_id === ME()));
    renderDoc(); renderLog(); P.renderDisc();
    const r = await Store.like(cid, on);
    if (r.error) return toast(t('err_generic', { err: r.error }));
    if (on && c.by !== ME()) localSay(t('msg.like_ack', { who: c.by === 'agent' ? t('agent_name') : esc(c.byName || name(c.by)), sec: secRef(c.sectionId), summary: esc(c.summary) }));
  }
  const latestChangeTime = () => state.changeList.reduce((a, c) => (!a || c.at > a ? c.at : a), null);
  const draftOf = (sid) => { const p = state.presence.find((x) => x.userId !== ME() && x.editing === sid && Array.isArray(x.draft)); return p ? p.draft : null; };
  const humanEditing = (sid) => { const p = state.presence.find((x) => x.userId !== ME() && x.editing === sid); return p ? p.userId : null; };
  const isPrivate = (id) => (id === ME() ? state.myPrivate : !!(state.presence.find((p) => p.userId === id) || {}).private);
  const openDiscRow = (sid) => state.discRows.find((d) => d.section_id === sid && d.status === 'open');
  function participants() {
    const ids = new Set([ME()]);
    state.presence.forEach((p) => ids.add(p.userId));
    if (state.room && state.room.bots_on) Object.keys(BOTS).forEach((id) => ids.add(id));
    state.votes.forEach((v) => ids.add(v.user_id));
    return [...ids].filter(Boolean);
  }
  function discVM(d) {
    const vs = state.votes.filter((v) => v.discussion_id === d.id);
    return {
      id: d.id, n: d.n, sectionId: d.section_id, title: d.title, question: d.question, openedBy: d.opened_by_id || 'agent', at: new Date(d.created_at), status: d.status, result: d.result,
      applied: d.applied ? { before: d.applied.before, after: d.applied.after, changeId: d.applied.change_id, at: new Date(d.applied.at) } : null,
      comments: [...vs.filter((v) => v.comment).map((v) => ({ by: v.user_id, text: v.comment, at: new Date(v.created_at) })), ...state.commentRows.filter((c) => c.discussion_id === d.id).map((c) => ({ by: c.user_id, text: c.text, at: new Date(c.created_at) }))].sort((a, b) => a.at - b.at),
      conclusion: state.conclusion[d.id] || '',
      options: (d.options || []).map((o) => ({ ...o, votes: vs.filter((v) => v.option_id === o.id).map((v) => v.user_id) })),
    };
  }
  const openDiscOf = (sid) => { const d = openDiscRow(sid); return d ? discVM(d) : null; };
  const discussions = () => state.discRows.map(discVM);

  /* ---------- sessions: a change's conversation is its author's messages up to the agent reply that carried it ---------- */
  function sessionOf(key) {
    const i = key.indexOf(':'); const kind = key.slice(0, i), id = key.slice(i + 1);
    let by, upto, title;
    if (kind === 'ch') { const c = changeById(id); if (!c) return null; by = c.by; title = c.summary; const m = state.messages.find((x) => x.id === c.messageId); upto = m ? m.at : new Date(c.at.getTime() + 5000); }
    else { const m = state.messages.find((x) => x.id === id); if (!m) return null; by = m.userId; upto = m.at; title = m.text.length > 70 ? `${m.text.slice(0, 70)}…` : m.text; }
    const msgs = state.messages.filter((m) => m.userId === by && m.at <= upto);
    let start = msgs.length - 1;   // walk back to just after the previous applied edit, at most 6 messages
    while (start > 0 && !(msgs[start - 1].role === 'agent' && msgs[start - 1].meta.applied)) start--;
    return { by, title, messages: msgs.slice(Math.max(start, msgs.length - 6)).map((m) => ({ role: m.role, text: m.text, applied: m.meta.applied || null })) };
  }

  /* ---------- changes and the "seen" model ---------- */
  function afterChange(sid, by) {
    state.showDiff[sid] = null;
    if (by !== ME()) state.unread.add(sid); else { state.unread.delete(sid); state.lastSeen[sid] = clone(secById(sid).paras); }
    state.recent[sid] = true;
    setTimeout(() => { delete state.recent[sid]; patchSection(sid); }, RECENT_MS);
  }
  async function typeIn(sectionId, prev, color = null) {
    const sec = secById(sectionId);
    const el = $(`.sec[data-id="${sectionId}"]`);
    if (!sec || !el || el.closest('[hidden]') || state.myEdit === sectionId) return;
    const ps = $$('.sec-body > p:not(.fn)', el);
    const idx = Diff.changedIndices(prev, sec.paras);
    const jobs = sec.paras.map((text, i) => ({ p: ps[i], text, i })).filter((j) => idx.has(j.i) && j.p);
    if (!jobs.length) return;
    state.animating++;
    try {
      await Promise.all(jobs.map(async (j) => {
        const full = j.p.innerHTML;
        j.p.classList.add('typing-in'); if (color) j.p.style.setProperty('--tc', color);
        const step = Math.max(1, Math.ceil(j.text.length / 45));
        for (let n = 0; n <= j.text.length; n += step) { j.p.textContent = j.text.slice(0, n); await wait(22); }
        j.p.innerHTML = full; j.p.classList.remove('typing-in');
      }));
    } finally {
      state.animating--;
      if (!state.animating && state.docDirty) { state.docDirty = false; renderDoc(); } else renderReadingAvatars();
    }
  }

  const SEEN_MS = 1200, SEEN_TICK = 300;
  const seenSince = {}; const seen = new Set(); const closing = new Set();
  function visibleRatio(el) {
    const sc = $('#leftScroll'); const r = el.getBoundingClientRect(), rr = sc.getBoundingClientRect();
    const top = Math.max(r.top, rr.top), bottom = Math.min(r.bottom, rr.bottom);
    return Math.max(0, bottom - top) / Math.max(1, r.height);
  }
  const keyOf = (el) => (el.classList.contains('diffing') ? `${el.dataset.id}:diff` : el.dataset.id);
  const elOfKey = (key) => { const [id, d] = key.split(':'); const el = $(`.sec[data-id="${id}"]`); return el && el.classList.contains(d ? 'diffing' : 'unread') ? el : null; };
  function seenTick() {
    if (state.view !== 'doc' || state.tab !== 'doc' || document.hidden) return;
    const now = Date.now(); const present = new Set();
    $$('.sec.unread, .sec.diffing').forEach((el) => {
      const id = el.dataset.id; if (state.editing[id] || humanEditing(id) || state.myEdit === id) return;
      const key = keyOf(el); present.add(key);
      if (closing.has(key)) { el.classList.add('fading'); return; }
      if (visibleRatio(el) < 0.5) { if (!seen.has(key)) delete seenSince[key]; return; }
      if (!seenSince[key]) seenSince[key] = now;
      if (now - seenSince[key] >= SEEN_MS) seen.add(key);
    });
    Object.keys(seenSince).forEach((k) => { if (!present.has(k)) { delete seenSince[k]; seen.delete(k); } });
  }
  setInterval(seenTick, SEEN_TICK);
  function dismissSeen(filter = () => true) {
    if (state.myEdit) return;
    [...seen].filter(filter).forEach((key) => {
      seen.delete(key); delete seenSince[key];
      const el = elOfKey(key); if (!el) return;
      closing.add(key); el.classList.add('fading');
      setTimeout(() => { closing.delete(key); const [id, d] = key.split(':'); if (d) state.showDiff[id] = null; markRead(id); }, 700);
    });
  }
  function markRead(id) { const s = secById(id); if (!s) return; state.unread.delete(id); state.lastSeen[id] = clone(s.paras); patchSection(id); renderTabs(); }
  function flashSection(id) { const el = $(`.sec[data-id="${id}"]`); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function gotoSection(id, { diff = null } = {}) {
    if (diff) state.showDiff[id] = diff;
    setTab('doc'); renderDoc();
    requestAnimationFrame(() => { const el = $(`.sec[data-id="${id}"]`); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); flashSection(id); });
  }
  function gotoSession(key) {
    setTab('log'); state.openEntry = key; state.logCat = 'all'; state.logMember = 'all'; renderLog();
    requestAnimationFrame(() => { const el = $(`.ent[data-session="${key}"]`); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); });
  }
  function gotoDiscussion(id) {
    setTab('disc'); P.renderDisc();
    requestAnimationFrame(() => { const el = $(`.disc[data-id="${id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  /* ---------- agent status, presence, header ---------- */
  function setAgent(status, text) {
    $('#agentChip').dataset.status = status;
    $('#agentChip img').src = agentPhoto(status);
    $('#agentText').innerHTML = `<b>${t('agent')}</b> ${esc(text)}`;
    state.agentStatus = status; renderRail();
  }
  function renderAgent() {
    const a = (state.room && state.room.agent) || {};
    const working = a.state === 'working' && (!a.since || Date.now() - new Date(a.since) < 70000);
    const before = JSON.stringify(state.editing);
    state.editing = working && a.section_id ? { [a.section_id]: { by: a.by_id } } : {};
    if (working && state.queued && a.by_id !== ME()) setAgent('waiting', t('agent_queued', { name: a.by_name || '?' }));
    else if (working) {
      const sec = a.section_id ? secLabel(a.section_id) : null;
      setAgent('working', a.by_id === 'agent' ? t('agent_resolving', { sec: sec || secLabel('s8') }) : sec ? t('agent_req_sec', { name: a.by_name, sec }) : t('agent_req', { name: a.by_name }));
    } else {
      const d = state.discRows.find((x) => x.status === 'open');
      if (d) setAgent('waiting', t('agent_waiting', { n: d.n })); else setAgent('idle', t('agent_idle'));
    }
    if (before !== JSON.stringify(state.editing)) renderDoc();
  }
  function renderPresence() {
    const online = new Set(state.presence.map((p) => p.userId));
    if (state.room && state.room.bots_on) Object.keys(BOTS).forEach((id) => online.add(id));
    online.delete(ME());
    const ids = [ME(), ...online];
    $('#presence').innerHTML = ids.map((id, index) => {
      const m = member(id); const mine = id === ME();
      const p = state.presence.find((x) => x.userId === id);
      const where = p && p.sectionId ? ` · ${secLabel(p.sectionId)}` : '';
      const priv = isPrivate(id);
      const title = `${m.name} · ${mine ? t('presence_me') : m.bot ? t('presence_bot') : t('presence_online')}${where}${priv ? ' · ' + t('presence_private') : ''}${mine || priv ? '' : ' · ' + t('presence_view')}`;
      return `<button class="av live ${state.viewing === id ? 'current' : ''}" data-user="${id}" style="--c:${m.color}; z-index:${ids.length - index}" title="${esc(title)}">${m.photo ? `<img src="${m.photo}" alt="${esc(m.name)}">` : esc(initial(m.name))}</button>`;
    }).join('');
  }
  const botDone = () => state.changeList.some((c) => c.by === 'bot_jieun' && c.sectionId === 's3');
  function renderHeaderActions() { if (state.viewing === ME() && state.view === 'doc') renderChat(); }   // the teammate button lives in the welcome message

  /* ---------- the right pane: my session or someone else's (read-only) ---------- */
  function viewSession(id) { state.viewing = id; renderPresence(); renderChatHead(); renderChat(); renderComposer(); }
  const currentModel = () => state.models.find((m) => m.id === state.model) || state.models.find((m) => m.id === state.defaultModel) || state.models[0] || null;
  function modelPicker() {
    if (state.models.length < 1) return '';
    const cur = currentModel();
    return `<label class="model-pick" title="${esc(t('model_title'))}"><select id="modelPick" aria-label="${esc(t('model_title'))}">${state.models.map((m) => `<option value="${esc(m.id)}" ${cur && cur.id === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`;
  }
  async function loadModels() {
    try { const r = await fetch('/api/models', { cache: 'no-store' }); const j = await r.json(); state.models = j.models || []; state.defaultModel = j.default; }
    catch (e) { state.models = []; }
    if (state.view === 'doc') renderChatHead();
  }
  function renderChatHead() {
    const id = state.viewing; const mine = id === ME();
    $('#chatHead').innerHTML = `${avatar(id)}<div class="ttl"><h2>${esc(name(id))}</h2></div>
      <span class="head-acts">${mine ? modelPicker() : `<button class="btn ghost" data-user="${ME()}">${t('back_to_mine')}</button>`}<button class="iconbtn sm" data-collapse title="${t('collapse')}">${icon('panel')}</button></span>`;
  }
  function renderComposer() {
    const mine = state.viewing === ME(); const priv = state.myPrivate;
    $('#composer').hidden = !mine; $('#readonly').hidden = mine;
    if (!mine) $('#readonly').innerHTML = `${icon('lock')}<span>${t('readonly_badge')}</span>`;
    const lb = $('#lockBtn'); if (lb) { lb.innerHTML = icon(priv ? 'lock' : 'unlock'); lb.title = priv ? t('lock_private') : t('lock_public'); lb.setAttribute('aria-pressed', priv); lb.setAttribute('aria-label', lb.title); lb.classList.toggle('on', priv); lb.dataset.lock = '1'; }
    $('.send').disabled = state.pending;
    $('#composer').classList.toggle('busy', state.pending);
  }
  function setCollapsed(on) { state.collapsed = on; $('.main').classList.toggle('collapsed', on); $('#rail').hidden = !on; renderRail(); }
  function renderRail() {
    if (!state.collapsed || !state.me) return;
    $('#rail').innerHTML = `<button class="iconbtn sm" data-collapse title="${t('expand')}">${icon('panel')}</button><span class="rail-agent" data-status="${state.agentStatus}">${avatar('agent', '', state.agentStatus)}<i class="dot"></i></span>${avatar(ME())}`;
  }
  function diffMini(c) {
    const rows = Diff.lineDiff(c.prev, c.next);
    const d = rows.find((r) => r.t === 'del'), a = rows.find((r) => r.t === 'add');
    if (!d && !a) return '';
    return `<div class="diffmini">${d ? `<span class="d">${esc(d.text)}</span>` : ''}${a ? `<span class="a">${esc(a.text)}</span>` : ''}</div>`;
  }
  /* replies that arrive while I am here are typed out; the extras (diff, buttons) appear when the text is done */
  const reveal = {};
  let revealTimer = null;
  function startReveal(id) {
    reveal[id] = 0;
    if (revealTimer) return;
    revealTimer = setInterval(() => {
      const ids = Object.keys(reveal); if (!ids.length) { clearInterval(revealTimer); revealTimer = null; return; }
      ids.forEach((mid) => {
        const m = state.messages.find((x) => x.id === mid); if (!m) { delete reveal[mid]; return; }
        reveal[mid] += Math.max(2, Math.ceil(m.text.length / 70));
        const el = $(`#msgs .bub[data-mid="${mid}"] p.reply`);
        if (reveal[mid] >= m.text.length) { delete reveal[mid]; if (m.userId === state.viewing) renderChat(); return; }
        if (el) { el.textContent = m.text.slice(0, reveal[mid]); const c = document.createElement('span'); c.className = 'type-caret'; el.appendChild(c); }
      });
    }, 22);
  }
  function agentHtml(m) {
    const meta = m.meta || {};
    if (reveal[m.id] !== undefined) return `<p class="reply">${esc(m.text.slice(0, reveal[m.id]))}<span class="type-caret"></span></p>`;
    let h = `<p class="reply">${esc(m.text)}</p>`;
    const c = meta.change_id && changeById(meta.change_id);
    const via = meta.model && meta.model.label ? ` · <span class="via">${esc(meta.model.label)}</span>` : '';
    if (meta.applied && meta.action === 'edit') h += `<p class="meta"><span class="done"><i></i>${t('msg.applied_meta')}</span> · ${secRef(meta.applied)}${via}</p>${c ? diffMini(c) : ''}`;
    else if (via) h += `<p class="meta">${via.slice(3)}</p>`;
    if (meta.action === 'resolve' && c) h += `<div class="acts"><button class="btn" data-goto-diff="${c.sectionId}:${c.id}:${esc(t('compare_label_disc', { n: (state.discRows.find((d) => d.id === meta.discussion_id) || {}).n }))}">${t('msg.see_changes')}</button><button class="btn ghost" data-goto="s8">${t('msg.see_decision')}</button></div>`;
    if (meta.action === 'none' && meta.discussion_id) h += `<div class="acts"><button class="btn" data-disc="${meta.discussion_id}">${t('see_disc')}</button></div>`;
    if (meta.conflict) {
      const cf = meta.conflict;
      h += `<div class="note">${t('msg.conflict_live', { note: esc(cf.note) })}${cf.discussion_id ? ` ${esc(t('msg.conflict_disc', { n: cf.discussion_n || '' }))}` : ''}</div><div class="acts">${cf.discussion_id ? `<button class="btn primary" data-disc="${cf.discussion_id}">${t('see_disc')}</button>` : ''}${changeById(cf.change_id) ? `<button class="btn" data-session="ch:${cf.change_id}">${esc(t('msg.see_convo_of', { name: cf.by_name }))}</button>` : ''}</div>`;
    }
    return h;
  }
  function renderChat() {
    const box = $('#msgs'); const id = state.viewing; if (!id) return;
    const mine = id === ME();
    if (!mine && isPrivate(id)) { box.innerHTML = `<div class="private-note">${icon('lock')}<h3>${t('private_h')}</h3><p>${esc(t('private_p', { name: name(id) }))}</p></div>`; return; }
    const list = state.messages.filter((m) => m.userId === id);
    const items = [];
    if (mine) {
      const welcome = importedRoom() ? t('import_welcome', { name: esc(name(id)) }) : t('msg.welcome', { name: esc(name(id)) });
      const teammate = importedRoom() || botDone() ? '' : `<div class="acts"><button class="btn primary" data-bot ${state.botBusy ? 'disabled' : ''}>${state.botBusy ? t('bot_busy') : t('bot_btn')}</button></div>`;
      items.push({ role: 'agent', html: welcome + teammate, at: new Date(0) });
    }
    list.forEach((m) => items.push(m.role === 'agent' ? { role: 'agent', html: agentHtml(m), at: m.at, mid: m.id } : { role: 'me', text: m.text, at: m.at }));
    if (mine) state.localMsgs.forEach((m) => items.push(m));
    items.sort((a, b) => a.at - b.at);
    if (mine && state.queued) items.push({ role: 'agent', html: t('msg.queued', { name: esc((state.room.agent || {}).by_name || '?') }) });
    if (mine && state.pending && !state.queued) items.push({ kind: 'typing' });
    box.innerHTML = (!mine && !list.length ? `<div class="private-note"><p>${esc(t('sess_empty'))}</p></div>` : '') + items.map((m) => {
      if (m.kind === 'typing') return `<div class="msg agent">${avatar('agent', '', 'working')}<div class="bub typing"><i></i><i></i><i></i></div></div>`;
      return `<div class="msg ${m.role}">${m.role === 'agent' ? avatar('agent') : ''}<div class="bub" ${m.mid ? `data-mid="${m.mid}"` : ''}>${m.role === 'me' ? `<p>${esc(m.text)}</p>` : m.html}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
  function localSay(html) { state.localMsgs.push({ role: 'agent', html, at: new Date() }); renderChat(); }

  function renderChips() {
    const chips = importedRoom() ? [t('import_suggestion')] : t('chips');
    $('#chips').innerHTML = chips.map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join('');
  }
  function renderCtx() {
    $('#ctx').innerHTML = state.ctx ? `<span class="ctx">${esc(t('ctx_about', { sec: secLabel(state.ctx) }))}<button type="button" data-ctx-clear aria-label="${t('ctx_clear')}">${icon('close')}</button></span>` : '';
    $('#input').placeholder = state.ctx ? t('input_ph_ctx', { sec: secLabel(state.ctx) }) : t('input_ph');
  }

  /* if realtime did not bring anything after one of my calls, read the room again (dropped socket, throttling) */
  function catchUp(since) {
    setTimeout(() => { if (Store.lastEventAt() < since && state.view === 'doc') Store.snapshot().then((d) => applySnapshot(d, false)).catch(() => {}); }, 1500);
  }
  async function send(text) {
    if (state.viewing !== ME() || state.pending) return;
    const body = (state.ctx ? t('ask_prefix', { sec: secLabel(state.ctx) }) : '') + text;
    state.pending = true; state.ctx = null; renderCtx(); renderComposer(); renderChat();
    Store.setPresence({ typing: false });
    let res;
    try { res = await Store.say(body.slice(0, 500), { lang, model: (currentModel() || {}).id, onQueued: (q) => { state.queued = q; renderAgent(); renderChat(); } }); }
    catch (e) { res = { error: e.message }; }
    state.pending = false; state.queued = false;
    catchUp(Date.now() - 500);
    renderComposer(); renderAgent(); renderChat();
    if (res && res.error && !res.said) localSay(`<p class="meta">${esc(t('err_generic', { err: res.error }))}</p>`);   // the agent already apologised in the session when said
    $('#input').focus();
  }
  async function bringTeammate() {
    if (state.botBusy || botDone()) return;
    state.botBusy = true; renderHeaderActions();
    let r; try { r = await Store.bot({ lang }); } catch (e) { r = { error: e.message }; }
    catchUp(Date.now() - 500);
    state.botBusy = false; renderHeaderActions();
    if (r && r.error) toast(t('err_generic', { err: r.error }));
  }
  function copyRoomLink() {
    const url = `${location.origin}/r/${state.roomId}`;
    const done = () => toast(t('toast_copied'));
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('', url)); else prompt('', url);
  }

  /* ---------- tabs ---------- */
  function setTab(tab) {
    state.tab = tab;
    ['doc', 'disc', 'log'].forEach((x) => { $(`#tab${x[0].toUpperCase() + x.slice(1)}`).setAttribute('aria-selected', x === tab); $(`#${x}Pane`).hidden = x !== tab; });
    $('#viewer').hidden = tab !== 'doc';
    if (tab === 'doc') { renderReadingAvatars(); trackMySection(); }
    else Store.setPresence({ sectionId: null });
  }
  function renderExport() { renderViewer(); }
  function renderViewer() {
    const v = $('#viewer'); if (!v) return;
    const title = (state.room && state.room.title) || DOC.title;
    v.innerHTML = `<span class="name">${esc(title)} · ${t('spec')}</span><span class="spacer"></span>
      <span class="grp export"><button data-export-menu aria-expanded="${!!state.exportOpen}">${t('export_btn')}</button>${state.exportOpen ? `<div class="export-menu">${window.RelayExport.FORMATS.map((f) => `<button type="button" data-export="${f}">${esc(t('export_' + f))}</button>`).join('')}</div>` : ''}</span>
      <span class="grp"><button data-page="-1" aria-label="${t('prev_page')}" ${state.page === 1 ? 'disabled' : ''}>${icon('back')}</button><span class="mono">${state.page} / 2</span><button data-page="1" aria-label="${t('next_page')}" ${state.page === 2 ? 'disabled' : ''}>${icon('next')}</button></span>
      <span class="grp"><button data-zoom="-10" aria-label="${t('zoom_out')}" ${state.zoom <= 80 ? 'disabled' : ''}>${icon('minus')}</button><span class="mono">${state.zoom}%</span><button data-zoom="10" aria-label="${t('zoom_in')}" ${state.zoom >= 130 ? 'disabled' : ''}>${icon('plus')}</button></span>`;
  }
  function gotoPage(n) { const el = $$('.paper')[n - 1]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function doExport(format) {
    state.exportOpen = false; renderExport();
    let ok;
    try { ok = window.RelayExport.download(format, { roomId: state.roomId, title: (state.room && state.room.title) || DOC.title, lede: documentLede(), sections: state.sections, changes: state.changeList, discussions: state.discRows }); }
    catch (e) { return toast(t('err_generic', { err: e.message })); }
    if (ok === false) toast(t('export_blocked'));
    if (ok && typeof ok.then === 'function') ok.catch((e) => toast(t('err_generic', { err: e.message })));
  }
  function renderDocMeta() { $('#tabsHint').innerHTML = `<span class="mono">${esc(DOC.version)}</span> · ${t('last_applied')} <span class="mono">${fmt(latestChangeTime())}</span>`; }
  function renderTabs() {
    $('#docCount').textContent = state.unread.size; $('#docCount').hidden = state.unread.size === 0; $('#docCount').classList.toggle('hot', state.unread.size > 0);
    const open = state.discRows.filter((d) => d.status === 'open').length;
    $('#discCount').textContent = open || state.discRows.length;
    $('#discCount').classList.toggle('open', open > 0);
    $('#tabDisc').setAttribute('aria-label', open ? `${t('tab_disc')} · ${t('disc_open_n', { n: open })}` : t('tab_disc'));
    $('#logCount').textContent = P.buildLog().length;
  }

  /* ---------- document ---------- */
  function renderDoc() {
    if (state.view !== 'doc') return;
    if (state.animating) { state.docDirty = true; return; }
    const keep = state.myEdit && $(`.sec[data-id="${state.myEdit}"] .sec-body.editable`);
    const keepHtml = keep ? keep.innerHTML : null; const hadFocus = keep && document.activeElement === keep; const caret = hadFocus ? saveCaret(keep) : null;
    const title = (state.room && state.room.title) || DOC.title;
    const footer = importedRoom() ? title : DOC.footer;
    $('#docTitle').textContent = title;
    const p1 = state.sections.filter((s) => (s.page || 1) === 1), p2 = state.sections.filter((s) => s.page === 2);
    $('#docPane').innerHTML = `
      <div class="paper-wrap" style="--zoom:${state.zoom / 100}">
        <article class="paper"><h1>${esc(title)}</h1>${documentLede() ? `<p class="lede">${esc(documentLede())}</p>` : ''}${p1.map(renderSection).join('')}<div class="paper-foot mono"><span>${esc(footer)}</span><span>01 / 02</span></div></article>
        <article class="paper">${p2.map(renderSection).join('')}<div class="paper-foot mono"><span>${esc(footer)}</span><span>02 / 02</span></div></article>
      </div>`;
    if (keepHtml != null) { const el = $(`.sec[data-id="${state.myEdit}"] .sec-body.editable`); if (el) { el.innerHTML = keepHtml; if (hadFocus) { el.focus(); if (caret != null) restoreCaret(el, caret); } } }
    renderViewer(); renderDocMeta(); renderReadingAvatars();
  }
  /* keep my caret where it was when the document re-renders under me */
  function saveCaret(root) {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0); if (!root.contains(r.startContainer)) return null;
    const pre = r.cloneRange(); pre.selectNodeContents(root); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  function restoreCaret(root, pos) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node, left = pos, last = null;
    while ((node = walker.nextNode())) { last = node; if (left <= node.length) break; left -= node.length; }
    if (!last) return;
    const r = document.createRange(); r.setStart(node || last, node ? left : last.length); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  /* re-render one section in place (keeps scroll, avoids repainting the whole document) */
  function patchSection(id) {
    if (state.view !== 'doc') return;
    const el = $(`.sec[data-id="${id}"]`); const sec = secById(id);
    if (!el || !sec || state.animating || state.myEdit === id) return renderDoc();
    const tmp = document.createElement('div'); tmp.innerHTML = renderSection(sec).trim();
    el.replaceWith(tmp.firstElementChild);
    renderReadingAvatars();
  }
  function renderSection(sec) {
    const ch = latestChange(sec.id);
    const ed = state.editing[sec.id];
    const disc = openDiscOf(sec.id);
    const diff = ch && state.showDiff[sec.id];
    const unread = ch && state.unread.has(sec.id);
    const changedIdx = unread ? Diff.changedIndices(state.lastSeen[sec.id] || ch.prev, sec.paras) : new Set();
    const hed = humanEditing(sec.id), mine = state.myEdit === sec.id;
    let inner, body;
    if (mine) body = `<div class="sec-body editable" contenteditable="true" spellcheck="false" tabindex="0">${sec.paras.map((p) => `<p class="${sec.steps ? 'step' : ''}">${esc(p)}</p>`).join('')}</div>${sec.footnote ? `<div class="sec-body"><p class="fn">${esc(sec.footnote)}</p></div>` : ''}`;
    else {
      if (diff) inner = Diff.lineDiff(diff.base, sec.paras).map((r) => r.t === 'eq' ? para(r.text, sec) : `<p class="${r.t}">${Diff.inlineHtml(r.text, r.pair, r.t, esc)}</p>`).join('');
      else if (hed && draftOf(sec.id)) inner = draftHtml(sec, hed);
      else inner = sec.paras.map((p, i) => para(p, sec, unread && changedIdx.has(i))).join('');
      body = `<div class="sec-body">${inner}${sec.footnote ? `<p class="fn">${esc(sec.footnote)}</p>` : ''}</div>`;
    }
    const who = ch ? (ch.by === 'agent' ? t('agent_name') : (ch.byName || name(ch.by))) : '';
    const tag = ch && (unread || state.recent[sec.id])
      ? `<button class="chg ${state.recent[sec.id] ? 'recent' : ''} ${unread ? 'new' : ''} ${ch.kind === 'human' ? 'direct' : ''}" data-pop="${sec.id}" aria-expanded="${state.openPop === sec.id}">${avatar(ch.by)}<b>${esc(who)}</b>${ch.kind === 'human' ? icon('pencil') : ''}<span class="t mono">${state.recent[sec.id] ? t('just_now') : fmt(ch.at)}</span></button>` : '';
    const live = ed ? `<span class="live-tag">${avatar(ed.by === 'agent' ? 'agent' : ed.by, '', 'working')}<span class="dot"></span>${ed.by === 'agent' ? t('live_disc') : esc(t('live_req', { name: name(ed.by) }))}</span>`
      : hed ? `<span class="live-tag human" style="--c:${member(hed).color}">${avatar(hed)}${icon('pencil')}${esc(t('live_human', { name: name(hed) }))}</span>` : '';
    return `
      <section class="sec ${ch ? 'changed' : ''} ${ed || hed ? 'editing' : ''} ${unread ? 'unread' : ''} ${diff ? 'diffing' : ''} ${mine ? 'my-edit' : ''}" data-id="${sec.id}">
        <div class="section-readers" data-readers="${sec.id}"></div>
        <header class="sec-h">
          <h2><span class="num">${sec.num}</span>${esc(sec.title)}</h2>
          ${mine ? `<span class="edit-tools"><span class="hint">${t('editing_hint')}</span><button class="btn primary sm" data-save-edit ${state.saving ? 'disabled' : ''}>${t('save')}</button><button class="btn ghost sm" data-cancel-edit>${t('cancel')}</button></span>`
          : `<span class="sec-tools">
            ${!disc && !ed && !hed && !state.draftDisc ? `<button class="tool" data-open-disc="${sec.id}">${t('open_disc')}</button>` : ''}
            <button class="tool" data-ask="${sec.id}">${t('ask_agent')}</button>
            ${!ed && !hed && !disc && !state.myEdit ? `<button class="tool" data-edit="${sec.id}">${icon('pencil')}${t('edit_direct')}</button>` : ''}
            ${ch && !unread && !state.recent[sec.id] ? `<button class="tool" data-pop="${sec.id}">${t('history')}</button>` : ''}
          </span>
          <span class="sec-right">
            ${disc ? `<button class="disc-chip" data-disc="${disc.id}"><span class="dot"></span>${t('disc_in_progress', { n: disc.n })}</button>` : ''}
            ${live || tag}
          </span>`}
        </header>
        ${diff ? `<div class="diff-bar">${esc(diff.label)}<span class="spacer"></span><span class="soft">${t('diff_auto')}</span></div>` : ''}
        ${body}
        ${state.openPop === sec.id && ch ? renderPop(sec.id, ch) : ''}
      </section>`;
  }
  /* Someone else's unsaved edit, with changed lines tinted. */
  function draftHtml(sec, by) {
    const d = draftOf(sec.id) || sec.paras;
    return d.map((p) => `<p class="${sec.steps ? 'step' : ''} ${sec.paras.includes(p) ? '' : 'draft-line'}" style="--c:${member(by).color}">${esc(p)}</p>`).join('');
  }
  function patchDraft(sid) {
    const el = $(`.sec[data-id="${sid}"] .sec-body`); const by = humanEditing(sid);
    if (!el || !by || state.myEdit === sid) return;
    const fn = el.querySelector('p.fn'); el.innerHTML = draftHtml(secById(sid), by) + (fn ? fn.outerHTML : '');
  }
  function para(text, sec, hl = false) {
    const m = text.match(/^([^:]{2,24}):\s(.*)$/);
    const inner = m ? `<span class="lbl">${esc(m[1])}:</span> ${esc(m[2])}` : esc(text);
    return `<p class="${sec.steps ? 'step' : ''} ${hl ? 'hl' : ''}">${hl ? `<mark>${inner}</mark>` : inner}</p>`;
  }
  function sinceSeen(sectionId) {
    const list = changesOf(sectionId); const seenKey = JSON.stringify(state.lastSeen[sectionId]);
    const i = list.findIndex((c) => JSON.stringify(c.prev) === seenKey);
    return i < 0 ? 1 : list.length - i;
  }
  function renderPop(sectionId, ch) {
    const isAgent = ch.by === 'agent', isMe = ch.by === ME();
    const who = ch.byName || name(ch.by);
    const since = state.popMeta ? state.popMeta.since : 1;
    const earlier = changesOf(sectionId).filter((c) => c.id !== ch.id).reverse();
    const dn = ch.discussionId && (state.discRows.find((d) => d.id === ch.discussionId) || {}).n;
    const label = since > 1 ? t('compare_label_since') : ch.discussionId ? t('compare_label_disc', { n: dn }) : t('compare_label_user', { name: who });
    return `
      <div class="pop" data-pop-for="${sectionId}">
        <div class="pop-h">${avatar(ch.by)}<b>${isAgent ? t('pop_edited_agent') : esc(t(ch.kind === 'human' ? 'pop_edited_direct' : 'pop_edited', { name: who }))}</b><span class="t mono">${fmt(ch.at)}</span></div>
        ${since > 1 ? `<p class="pop-since">${esc(t('pop_since', { n: since }))}</p>` : ''}
        <p class="pop-sum">${esc(ch.summary)}</p>
        ${ch.why ? `<p class="pop-why"><b>${t('pop_why')}:</b> ${esc(ch.why)}</p>` : ''}
        ${(() => { const m = state.messages.find((x) => x.id === ch.messageId); return m && m.meta.model ? `<p class="pop-why"><b>${t('model_label')}:</b> ${esc(m.meta.model.label)}</p>` : ''; })()}
        <div class="pop-actions">
          <button class="btn" data-diff="${sectionId}" data-base="${since > 1 ? 'seen' : ch.id}" data-label="${esc(label)}">${t('compare')}</button>
          ${ch.kind === 'agent' ? `<button class="btn" data-session="ch:${ch.id}">${isMe ? t('see_my_convo') : t('see_convo')}</button>` : ''}
          ${ch.discussionId ? `<button class="btn" data-disc="${ch.discussionId}">${t('see_disc')}</button>` : ''}
          ${!isMe && !isAgent ? `<button class="btn agent" data-ask="${sectionId}">${t('ask_different')}</button>` : ''}
          ${!isMe ? likeHtml(ch) : ''}
        </div>
        ${earlier.length ? `<div class="pop-earlier"><b>${t('pop_earlier')}</b>${earlier.map((c) => `<span class="row">${avatar(c.by, 'sm')}<span>${esc(c.summary)}</span><span class="t mono">${fmt(c.at)}</span></span>`).join('')}</div>` : ''}
      </div>`;
  }

  /* ---------- reading positions in the document gutter ---------- */
  function renderReadingAvatars() {
    if (state.view !== 'doc' || state.tab !== 'doc') return;
    const reading = new Map();
    for (const p of state.presence) {
      const sectionId = p.editing || p.sectionId;
      if (!sectionId || p.userId === ME()) continue;
      if (!reading.has(sectionId)) reading.set(sectionId, new Set());
      reading.get(sectionId).add(p.userId);
    }
    $$('#docPane [data-readers]').forEach((el) => {
      const readers = [...(reading.get(el.dataset.readers) || [])];
      el.innerHTML = readers.map((id) => avatar(id)).join('');
    });
  }

  let presTimer;
  function trackMySection() {
    clearTimeout(presTimer);
    if (state.view !== 'doc' || state.tab !== 'doc') return;
    presTimer = setTimeout(() => {
      if (state.view !== 'doc' || state.tab !== 'doc') return;
      const sc = $('#leftScroll');
      const mid = sc.getBoundingClientRect().top + sc.clientHeight / 2;
      const sections = $$('#docPane .sec');
      const best = sections.find((el) => el.getBoundingClientRect().bottom >= mid) || sections.at(-1);
      if (best) Store.setPresence({ sectionId: best.dataset.id });
    }, 180);
  }
  $('#leftScroll').addEventListener('scroll', () => {
    if (state.tab !== 'doc') return;
    const sc = $('#leftScroll'); const mid = sc.scrollTop + sc.clientHeight / 2;
    let page = 1; $$('.paper').forEach((pp, i) => { if (pp.offsetTop * (state.zoom / 100) <= mid) page = i + 1; });
    if (page !== state.page) { state.page = page; renderViewer(); }
    trackMySection();
    dismissSeen((key) => { const el = elOfKey(key); return el && visibleRatio(el) < 0.25; });
  });

  /* ---------- my direct edits: one section at a time, saved through /api/edit with the rev I started from ---------- */
  function startMyEdit(id) {
    if (state.editing[id] || humanEditing(id) || openDiscRow(id)) return;
    const s = secById(id); state.myEdit = id; state.editRev = s.rev; state.openPop = null;
    Store.setPresence({ editing: id, sectionId: id }); renderDoc();
    const body = $(`.sec[data-id="${id}"] .sec-body.editable`); if (body) body.focus();
  }
  function cancelMyEdit() { state.myEdit = null; Store.setPresence({ editing: null, draft: null }); renderDoc(); }
  const editableParas = (el) => Array.from(el.childNodes).map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let draftTimer = null;
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('.sec-body.editable'); if (!el || !state.myEdit) return;
    clearTimeout(draftTimer); draftTimer = setTimeout(() => Store.setPresence({ draft: editableParas(el).slice(0, 30).map((p) => p.slice(0, 1200)) }), 250);
  });
  async function saveMyEdit() {
    const id = state.myEdit; if (!id || state.saving) return;
    const body = $(`.sec[data-id="${id}"] .sec-body.editable`);
    const paras = Array.from(body.childNodes).map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!paras.length || JSON.stringify(paras) === JSON.stringify(secById(id).paras)) return cancelMyEdit();
    state.saving = true; renderDoc();
    let r; try { r = await Store.edit(id, paras, state.editRev, { lang }); } catch (e) { r = { error: e.message }; }
    state.saving = false; state.myEdit = null; Store.setPresence({ editing: null, draft: null });
    renderDoc();
    if (r && r.error) toast(r.error === 'stale' ? t('err_stale') : r.error === 'frozen' ? t('err_frozen') : t('err_generic', { err: r.error }));
  }

  /* ---------- home: the workspace library, as in the prototype ---------- */
  const ago = (mins) => mins < 1 ? t('ago_now') : mins < 60 ? t('ago_min', { n: Math.round(mins) }) : mins < 1440 ? t('ago_h', { n: Math.round(mins / 60) }) : t('ago_d', { n: Math.round(mins / 1440) });
  /* the first page of a spec, as the document renders it, used shrunk as a thumbnail */
  function pageHtml(title, lede, sections) {
    return `<article class="paper"><h1>${esc(title)}</h1><p class="lede">${esc(lede)}</p>${sections.map((x, i) => `<section class="sec"><header class="sec-h"><h2><span class="num">${i + 1}</span>${esc(x[0])}</h2></header><div class="sec-body">${x[1].map((pp) => `<p class="${pp ? '' : 'draft'}">${esc(pp || t('draft_line'))}</p>`).join('')}</div></section>`).join('')}<div class="paper-foot mono"><span>${esc(DOC.footer)}</span><span>01</span></div></article>`;
  }
  function unitPage(u) {
    if (u.roomId) {
      const sections = u.roomId === state.roomId ? state.sections.filter((s) => s.page === 1).map((s) => [s.title, s.paras]) : [];
      return pageHtml(u.title, '', sections);
    }
    if (u.live) { const secs = state.sections.length && !importedRoom() ? state.sections : DOC_EN.sections; return pageHtml(DOC_EN.title, DOC_EN.lede, secs.filter((x) => (x.page || 1) === 1).map((x) => [x.title, x.paras])); }
    return pageHtml(u.title, u.preview.lede, u.preview.sections.map((x) => [x[0], [x[1]]]));
  }
  function face(mid) {
    if (mid === 'me') return state.me ? avatar(ME(), 'sm') : `<span class="av sm" style="--c:${MEMBERS.me.color}"><img src="${MEMBERS.me.photo}" alt=""></span>`;
    if (MEMBERS[mid]) return `<span class="av sm" style="--c:${MEMBERS[mid].color}"><img src="${MEMBERS[mid].photo}" alt="${esc(MEMBERS[mid].name)}"></span>`;
    const x = EXTRA_MEMBERS[mid]; return x ? `<span class="av sm" style="--c:${x.color}">${x.initial}</span>` : avatar(mid, 'sm');
  }
  function renderHome() {
    const unread = importedRoom() ? 0 : state.unread.size;
    const openDisc = importedRoom() ? 0 : state.discRows.filter((d) => d.status === 'open').length;
    const MAX_AV = 4;
    const faces = (ids) => ids.slice(0, MAX_AV).map(face).join('') + (ids.length > MAX_AV ? `<span class="av sm more">+${ids.length - MAX_AV}</span>` : '');
    $('#home').innerHTML = `
      <div class="home-main">
        <div class="home-h"><h1>${t('home_title')}</h1><button class="btn primary" data-add-issue>${icon('plus')}${t('add_issue')}</button></div>
        <div class="units">
          ${[...state.importedRooms, ...state.units].map((u) => {
            const mins = u.live && latestChangeTime() ? (Date.now() - latestChangeTime()) / 60000 : u.editedMin;
            return `<button class="unit ${u.live ? 'live' : ''} ${u.fresh ? 'fresh' : ''}" data-open-unit="${u.id}" style="--accent:${u.accent}">
              <span class="thumb">${unitPage(u)}</span>
              <span class="u-title">${u.live && unread ? `<i class="dot" title="${esc(t('unread_n', { n: unread }))}"></i>` : ''}${esc(u.title)}</span>
              <span class="u-meta"><span class="avs">${faces(u.members)}</span><span>${ago(mins)}</span>${u.live && openDisc ? `<b class="warn">${t('disc_open_n', { n: openDisc })}</b>` : ''}</span>
            </button>`; }).join('')}
        </div>
      </div>`;
  }
  /* add an issue: title, goal, members, starting point → a new card with its first page (prototype behaviour) */
  function openIssueModal() {
    const PEOPLE = ['me', 'minsu', 'jieun', 'hyunwoo'];
    state.issueDraft = { members: new Set(['me']), start: 'template' };
    $('#modalRoot').innerHTML = `<div class="overlay" data-overlay><form class="modal issue" id="issueForm" role="dialog" aria-modal="true" aria-labelledby="iTitle">
      <h2 id="iTitle">${t('issue_new')}</h2>
      <label>${t('issue_title')}<input id="iName" maxlength="80" placeholder="${esc(t('issue_title_ph'))}" autocomplete="off"></label>
      <label>${t('issue_goal')}<input id="iGoal" maxlength="140" placeholder="${esc(t('issue_goal_ph'))}" autocomplete="off"></label>
      <div class="lbl-row">${t('issue_members')}</div>
      <div class="member-pick">${PEOPLE.map((id) => `<button type="button" class="pick ${id === 'me' ? 'on' : ''}" data-pick="${id}" aria-pressed="${id === 'me'}">${face(id).replace('av sm', 'av')}<span>${esc(id === 'me' ? (state.me ? state.me.name : MEMBERS.me.name) : MEMBERS[id].name)}</span></button>`).join('')}</div>
      <div class="lbl-row">${t('issue_start')}</div>
      <div class="start-pick"><label class="radio"><input type="radio" name="start" value="template" checked>${t('start_template')}</label><label class="radio"><input type="radio" name="start" value="blank">${t('start_blank')}</label><label class="radio"><input type="radio" name="start" value="import">${t('start_import')}</label></div>
      <label id="importFileLabel" hidden>${t('import_file')}<input id="iFile" type="file" accept=".md,.txt,text/markdown,text/plain"></label>
      <div class="f"><span class="err" id="iErr"></span><span class="spacer"></span><button type="button" class="btn ghost" data-modal-close>${t('cancel')}</button><button type="submit" class="btn primary">${t('create')}</button></div>
    </form></div>`;
    setTimeout(() => $('#iName') && $('#iName').focus(), 30);
  }
  async function createIssue() {
    const title = $('#iName').value.trim();
    if (!title) { $('#iErr').textContent = t('err_issue_title'); $('#iName').focus(); return; }
    const start = $('#issueForm input[name="start"]:checked').value;
    if (start === 'import') return importIssue(title);
    const goal = $('#iGoal').value.trim();
    const accents = ['#2F6BFF', '#7C5CFF', '#16A26A', '#D4860A', '#D9503B', '#0EA5A4'];
    const unit = { id: `u${Date.now()}`, title, members: [...state.issueDraft.members], editedMin: 0, fresh: true, accent: accents[state.units.length % accents.length],
      preview: { lede: goal || t('draft_line'), sections: start === 'template' ? t('tpl_sections').map((x) => [x, '']) : [] } };
    state.units = [unit, ...state.units]; state.issueDraft = null;
    closeModal(); renderHome(); toast(t('toast_created'));
    setTimeout(() => { unit.fresh = false; }, 2000);
  }

  async function importIssue(title) {
    const form = $('#issueForm');
    const file = $('#iFile').files[0];
    if (!file || !/\.(md|txt)$/i.test(file.name)) { $('#iErr').textContent = t('import_invalid'); return; }
    if (file.size > 120000) { $('#iErr').textContent = t('import_large'); return; }
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    state.landing.busy = true;
    try {
      const rid = await Store.createRoom({ title, text: await file.text(), markdown: /\.md$/i.test(file.name) });
      location.assign(`/r/${rid}${location.search}`);
    } catch (e) {
      $('#iErr').textContent = e.message === 'document_too_large' ? t('import_large') : e.message === 'invalid_document' ? t('import_invalid') : t('err_generic', { err: e.message });
      submit.disabled = false;
      state.landing.busy = false;
    }
  }

  function loadImportedRooms() {
    try {
      const rooms = JSON.parse(localStorage.getItem('relay.importedRooms') || '[]');
      return Array.isArray(rooms) ? rooms : [];
    } catch (e) { return []; }
  }
  function rememberImportedRoom() {
    const roomId = state.roomId;
    const unit = { id: roomId, roomId, title: state.room.title, editedMin: 0, accent: '#2F6BFF', members: ['me'] };
    state.importedRooms = [unit, ...state.importedRooms.filter((u) => u.roomId !== roomId)];
    try { localStorage.setItem('relay.importedRooms', JSON.stringify(state.importedRooms)); } catch (e) { /* private mode */ }
  }

  /* ---------- who you are: a nickname, unique across Relay, asked once and kept on this browser ---------- */
  const roomFromPath = () => { const m = location.pathname.match(/^\/r\/([a-z0-9]{4,12})\/?$/i); return m ? m[1].toLowerCase() : null; };
  function loadMe() { try { const v = JSON.parse(localStorage.getItem('relay.me') || 'null'); return v && /^u_[a-z0-9]{6,20}$/.test(v.userId) && v.name ? v : null; } catch (e) { return null; } }
  function saveMe(v) { try { localStorage.setItem('relay.me', JSON.stringify({ userId: v.userId, name: v.name, avatar: v.avatar })); } catch (e) { /* private mode */ } }
  function forgetMe() { try { localStorage.removeItem('relay.me'); } catch (e) { /* fine */ } state.me = null; }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  function openNameModal(err = '') {
    const L = state.landing;
    $('#modalRoot').innerHTML = `<div class="overlay"><form class="modal issue join" id="landForm" role="dialog" aria-modal="true" aria-labelledby="jTitle">
      <h2 id="jTitle">${t('nick_title')}</h2>
      <p class="sub">${esc(t('nick_sub'))}</p>
      <label>${t('nick_label')}<input id="lName" maxlength="20" autocomplete="nickname" value="${esc(L.name || '')}" placeholder="${esc(t('nick_ph'))}" ${L.busy ? 'disabled' : ''}></label>
      <div class="f"><span class="err" role="alert">${esc(err)}</span><span class="spacer"></span><button type="submit" class="btn primary" ${L.busy ? 'disabled' : ''}>${esc(L.busy ? t('nick_checking') : t('nick_go'))}</button></div>
    </form></div>`;
    if (!L.busy) $('#lName').focus();
  }
  async function submitName() {
    const L = state.landing; if (L.busy) return;
    const nm = ($('#lName').value || '').replace(/\s+/g, ' ').trim(); L.name = nm;
    if (nm.length < 2 || nm.length > 20) return openNameModal(t('nick_len'));
    L.busy = true; openNameModal();
    let r; try { r = await Store.profile({ name: nm }); } catch (e) { r = { error: e.message }; }
    L.busy = false;
    if (!r || !r.ok) return openNameModal(r && r.error === 'taken' ? t('nick_taken') : r && r.error === 'length' ? t('nick_len') : t('err_generic', { err: (r && r.error) || '?' }));
    setMe(r); closeModal();
    const rid = roomFromPath(); if (rid) joinRoom(rid); else renderHome();
  }
  function setMe(p) { state.me = { userId: p.userId, name: p.name, avatar: p.avatar }; saveMe(state.me); learn(p.userId, p.name, p.avatar); }
  /* the live card at "/" makes a fresh room; inside a room it just opens the document */
  async function startRoom() {
    if (!state.me) return openNameModal();
    if (state.creating) return; state.creating = true; toast(t('land_busy_start'));
    try { const rid = await Store.createRoom(); history.pushState(null, '', `/r/${rid}${location.search}`); await enterRoom(rid); }
    catch (e) { toast(t('err_generic', { err: e.message })); }
    state.creating = false;
  }
  async function joinRoom(rid) {
    if (!state.me) return openNameModal();
    try { await enterRoom(rid); }
    catch (e) {
      if (e.message === 'room_not_found') { history.replaceState(null, '', `/${location.search}`); showView('home'); toast(t('land_err_room')); }
      else toast(t('err_generic', { err: e.message }));
    }
  }
  /* the walkthrough modal (prototype); not opened automatically */
  function openGuide() {
    $('#modalRoot').innerHTML = `<div class="overlay" data-overlay><div class="modal" role="dialog" aria-modal="true" aria-labelledby="gTitle">
      <h2 id="gTitle">${t('guide_h')}</h2><p class="sub">${t('guide_sub')}</p>
      <div class="g-steps">${t('guide_steps_live').map((x, i) => `<div class="g-step"><span class="n">${i + 1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('')}</div>
      <div class="f"><button class="btn ghost" data-reset>${t('guide_reset')}</button><span class="spacer"></span><button class="btn primary" data-modal-close>${t('guide_start')}</button></div>
    </div></div>`;
    setTimeout(() => $('[data-modal-close]') && $('[data-modal-close]').focus(), 30);
  }


  /* ---------- joining a room and live updates ---------- */
  async function enterRoom(rid, me = state.me) {
    const data = await Store.join(rid, me);   // nicknames are already unique across Relay (api/profile)
    state.me = me; saveMe(me); learn(me.userId, me.name, me.avatar);
    state.roomId = rid; state.viewing = ME();
    applySnapshot(data, true);
    if (importedRoom()) rememberImportedRoom();
    showView('doc');
  }
  /* load a full snapshot: on join, and again after a dropped connection (sections that changed meanwhile are marked as new) */
  function applySnapshot(data, initial) {
    const before = initial ? null : Object.fromEntries(state.sections.map((s) => [s.id, JSON.stringify(s.paras)]));
    const knownDiscussions = new Set(state.discRows.map((d) => d.id));
    state.room = data.room;
    state.sections = data.sections.map(normSection);
    state.changeList = data.changes.map(normChange);
    state.messages = data.messages.map(normMessage);
    state.discRows = data.discussions; state.votes = data.votes; state.presence = data.presence || [];
    state.reactions = data.reactions || []; state.commentRows = data.comments || [];
    state.messages.forEach((m) => learn(m.userId, m.userName, m.meta && m.meta.avatar));
    state.changeList.forEach((c) => learn(c.by, c.byName));
    state.votes.forEach((v) => learn(v.user_id, v.user_name));
    state.presence.forEach((p) => learn(p.userId, p.name, p.avatar));
    if (initial) {
      state.sections.forEach((s) => {
        const c = latestChange(s.id);
        const fresh = c && c.by !== ME() && Date.now() - c.at < RECENT_CHANGE_MS;
        state.lastSeen[s.id] = clone(fresh ? c.prev : s.paras); if (fresh) state.unread.add(s.id);
      });
      return;
    }
    state.sections.forEach((s) => { if (before[s.id] !== JSON.stringify(s.paras) && (latestChange(s.id) || {}).by !== ME()) state.unread.add(s.id); });
    const opened = state.discRows.findLast((d) => d.status === 'open' && !knownDiscussions.has(d.id));
    if (opened) announceDiscussion(opened);
    renderPresence(); renderChat(); P.renderDisc(); renderLog(); renderTabs(); renderHeaderActions(); renderAgent(); renderDoc();
  }
  function announceDiscussion(disc) {
    if (state.view === 'doc' && state.tab !== 'disc') toast(t('discussion_opened', { n: disc.n, title: disc.title }));
  }
  let resyncing = false;
  Store.on('resync', async (why) => {
    if (state.view !== 'doc' || resyncing) return;
    resyncing = true;
    try { applySnapshot(await Store.snapshot(), false); console.info('resynced', why); } catch (e) { console.warn('resync failed', e); }
    resyncing = false;
  });
  Store.on('status', (st) => { document.body.classList.toggle('offline', st === 'offline'); if (st === 'offline') toast(t('offline')); });
  Store.on('sections', ({ row }) => {
    if (!row || row.room_id !== state.roomId) return;
    const next = normSection(row); const old = secById(next.id); const prev = old ? clone(old.paras) : [];
    upsert(state.sections, next); state.sections.sort((a, b) => a.num - b.num);
    if (!old || JSON.stringify(prev) === JSON.stringify(next.paras)) return renderDoc();
    const c = changeById(next.lastChangeId);
    const by = c ? c.by : (((state.room && state.room.agent) || {}).by_id || 'agent');
    afterChange(next.id, by);
    setTimeout(() => { renderDoc(); renderTabs(); typeIn(next.id, prev); }, 350);
  });
  Store.on('changes', ({ type, row }) => { if (type !== 'INSERT') return; const c = normChange(row); learn(c.by, c.byName); upsert(state.changeList, c); renderDoc(); renderLog(); renderTabs(); renderChat(); renderHeaderActions(); });
  Store.on('messages', ({ type, row }) => { if (type !== 'INSERT') return; const m = normMessage(row); learn(m.userId, m.userName, m.meta.avatar); const isNew = upsert(state.messages, m);
    if (isNew && m.role === 'agent' && state.view === 'doc' && Date.now() - m.at < 30000) startReveal(m.id);
    if (m.userId === ME() && m.role === 'agent' && m.meta.compose && state.view === 'doc') setTimeout(() => P.composeDiscussion(m.meta.compose.sectionId || 'none', m.meta.compose), 400); if (m.userId === state.viewing) renderChat(); renderLog(); renderTabs(); });
  Store.on('discussions', ({ row }) => {
    if (!row || row.room_id !== state.roomId) return;
    const added = upsert(state.discRows, row);
    if (added && row.status === 'open') announceDiscussion(row);
    state.discRows.sort((a, b) => a.n - b.n);
    P.renderDisc(); renderTabs(); renderDoc(); renderAgent(); renderLog();
  });
  Store.on('votes', ({ type, row }) => {
    if (!row) return; const key = (v) => `${v.discussion_id}:${v.user_id}`;
    if (type === 'DELETE') state.votes = state.votes.filter((v) => key(v) !== key(row)); else { learn(row.user_id, row.user_name); upsert(state.votes, row, key); }
    P.renderDisc();
  });
  Store.on('reactions', ({ type, row }) => {
    if (!row) return; const key = (r) => `${r.change_id}:${r.user_id}`;
    if (type === 'DELETE') state.reactions = state.reactions.filter((r) => key(r) !== key(row)); else { learn(row.user_id, row.user_name); upsert(state.reactions, row, key); }
    renderDoc(); renderLog(); renderTabs(); P.renderDisc();
  });
  Store.on('comments', ({ type, row }) => { if (type !== 'INSERT' || !row) return; learn(row.user_id, row.user_name); upsert(state.commentRows, row); P.renderDisc(); });
  Store.on('room', ({ row }) => { if (!row) return; const wasBots = state.room && state.room.bots_on; state.room = row; renderAgent(); if (wasBots !== row.bots_on) { renderPresence(); renderHeaderActions(); } renderReadingAvatars(); });
  Store.on('presence', (list) => {
    const edits = (l) => JSON.stringify(l.filter((p) => p.userId !== ME()).map((p) => `${p.userId}:${p.editing || ''}`).sort());   // my own editing state is already local
    const drafts = (l) => Object.fromEntries(l.filter((p) => p.editing && p.userId !== ME()).map((p) => [p.editing, JSON.stringify(p.draft || null)]));
    const e0 = edits(state.presence), d0 = drafts(state.presence);
    const who = (l) => JSON.stringify(l.map((p) => `${p.userId}:${p.name}:${p.avatar}:${p.private ? 1 : 0}`).sort());
    const w0 = who(state.presence);
    state.presence = list; list.forEach((p) => learn(p.userId, p.name, p.avatar));
    if (w0 !== who(list)) { renderPresence(); if (state.viewing !== ME()) renderChat(); }
    if (e0 !== edits(list)) return renderDoc();
    const d1 = drafts(list);
    Object.keys(d1).forEach((sid) => { if (d1[sid] !== d0[sid]) patchDraft(sid); });
    renderReadingAvatars();
  });
  setInterval(() => { if (state.view === 'doc') renderAgent(); }, 5000);   // a stuck lock (crashed function) times out visually

  /* ---------- views ---------- */
  function showView(v) {
    state.view = v;
    $('#home').hidden = v !== 'home'; $('.main').hidden = v !== 'doc';
    $$('.work-only').forEach((el) => { el.hidden = v !== 'doc'; });
    $$('.home-only').forEach((el) => { el.hidden = v !== 'home'; });
    document.body.classList.toggle('on-home', v === 'home');
    if (v === 'home') { Store.setPresence({ sectionId: null }); return renderHome(); }
    Store.setPresence({ private: state.myPrivate });
    renderPresence(); renderChatHead(); renderComposer(); renderChat(); P.renderDisc(); renderLog(); renderTabs(); renderChips(); renderCtx(); renderHeaderActions(); renderExport(); setTab('doc'); renderAgent(); renderDoc();
    setTimeout(trackMySection, 600);
  }
  let toastTimer;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
  function setLang(l) {
    try { localStorage.setItem('relay.lang', l); } catch (e) { /* storage may be blocked */ }
    const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
  }

  /* ---------- panels (discussions, activity log) ---------- */
  const R = { state, MEMBERS, $, $$, esc, fmt, t, icon, avatar, name, member, secById, secLabel, secRef, openDiscOf, latestChange, changeById, discussions, participants, sessionOf, renderDoc, renderTabs, setTab, gotoDiscussion, toast, Diff, ME, Store, lang, likeHtml, likesOf, localSay };
  const P = window.RelayPanels(R);
  const renderLog = () => P.renderLog();

  /* ---------- events (delegated) ---------- */
  document.addEventListener('click', (e) => {
    const t0 = e.target.closest('[data-goto],[data-goto-diff],[data-session],[data-disc],[data-pop],[data-diff],[data-ask],[data-toggle],[data-ldiff],[data-vote],[data-resolve],[data-user],[data-collapse],[data-ctx-clear],[data-home],[data-lang],[data-bot],[data-copy-link],[data-tab-go],[data-edit],[data-save-edit],[data-cancel-edit],[data-export-menu],[data-export],[data-page],[data-zoom],[data-lock],[data-open-unit],[data-add-issue],[data-pick],[data-modal-close],[data-overlay],[data-reset],[data-like],[data-open-disc],[data-compose-cancel],.chip,.tab');
    if (!t0) { if (state.exportOpen) { state.exportOpen = false; renderViewer(); } if (!e.target.closest('.pop') && state.openPop) { state.openPop = null; renderDoc(); } return; }
    const d = t0.dataset;
    if (d.lang) return setLang(d.lang);
    if (t0.classList.contains('tab')) { const tab = t0.id.replace('tab', '').toLowerCase(); setTab(tab); if (tab === 'disc') P.renderDisc(); return; }
    if (t0.classList.contains('chip')) return send(t0.textContent);
    if (t0.hasAttribute('data-modal-close')) { if (!$('#landForm')) closeModal(); return; }
    if (t0.hasAttribute('data-overlay')) { if (e.target === t0 && !$('#landForm')) closeModal(); return; }
    if (t0.hasAttribute('data-reset')) { closeModal(); history.pushState(null, '', `/${location.search}`); state.roomId = null; return startRoom(); }
    if (t0.hasAttribute('data-add-issue')) return openIssueModal();
    if (d.pick) { const set = state.issueDraft.members; if (d.pick !== 'me') { if (set.has(d.pick)) set.delete(d.pick); else set.add(d.pick); } t0.classList.toggle('on', set.has(d.pick)); t0.setAttribute('aria-pressed', set.has(d.pick)); return; }
    if (d.openUnit) {
      const imported = state.importedRooms.find((u) => u.id === d.openUnit);
      if (imported) return imported.roomId === state.roomId ? showView('doc') : location.assign(`/r/${imported.roomId}${location.search}`);
      const unit = state.units.find((u) => u.id === d.openUnit);
      if (unit?.live) return state.roomId && !importedRoom() ? showView('doc') : startRoom();
      return toast(t('toast_only_first'));
    }
    if (t0.hasAttribute('data-home')) return showView('home');
    if (t0.hasAttribute('data-lock')) { state.myPrivate = !state.myPrivate; Store.setPresence({ private: state.myPrivate }); renderPresence(); renderComposer(); return; }
    if (d.page) { state.page = Math.min(2, Math.max(1, state.page + Number(d.page))); renderViewer(); return gotoPage(state.page); }
    if (d.zoom) { state.zoom = Math.min(130, Math.max(80, state.zoom + Number(d.zoom))); return renderDoc(); }
    if (t0.hasAttribute('data-bot')) return bringTeammate();
    if (t0.hasAttribute('data-copy-link')) return copyRoomLink();
    if (d.tabGo) { setTab(d.tabGo); return d.tabGo === 'log' ? renderLog() : P.renderDisc(); }
    if (d.user) return viewSession(d.user);
    if (t0.hasAttribute('data-collapse')) return setCollapsed(!state.collapsed);
    if (t0.hasAttribute('data-ctx-clear')) { state.ctx = null; return renderCtx(); }
    if (d.goto) return gotoSection(d.goto);
    if (d.gotoDiff) { const [id, cid, ...rest] = d.gotoDiff.split(':'); const c = changeById(cid); return gotoSection(id, { diff: { label: rest.join(':'), base: c ? c.prev : state.lastSeen[id] } }); }
    if (d.session) return gotoSession(d.session);
    if (d.disc) return gotoDiscussion(d.disc);
    if (d.pop) {
      if (state.openPop === d.pop) state.openPop = null;
      else { state.openPop = d.pop; state.popMeta = { since: state.unread.has(d.pop) ? sinceSeen(d.pop) : 1, base: clone(state.lastSeen[d.pop]) }; }
      if (state.unread.has(d.pop)) { state.unread.delete(d.pop); state.lastSeen[d.pop] = clone(secById(d.pop).paras); }
      renderTabs(); return renderDoc();
    }
    if (d.diff) { state.openPop = null; const bc = changeById(d.base); const base = d.base === 'seen' ? state.popMeta && state.popMeta.base : bc && bc.prev; state.showDiff[d.diff] = { label: d.label, base: base || latestChange(d.diff).prev }; return renderDoc(); }
    if (d.ask) { state.openPop = null; renderDoc(); if (state.viewing !== ME()) viewSession(ME()); state.ctx = d.ask; renderCtx(); $('#input').focus(); return; }
    if (t0.hasAttribute('data-export-menu')) { state.exportOpen = !state.exportOpen; return renderViewer(); }
    if (d.export) return doExport(d.export);
    if (d.like) return toggleLike(d.like);
    if (d.openDisc) return P.composeDiscussion(d.openDisc);
    if (t0.hasAttribute('data-compose-cancel')) { state.draftDisc = null; renderDoc(); return P.renderDisc(); }
    if (d.edit) return startMyEdit(d.edit);
    if (t0.hasAttribute('data-save-edit')) return saveMyEdit();
    if (t0.hasAttribute('data-cancel-edit')) return cancelMyEdit();
    if (d.toggle) { state.openEntry = state.openEntry === d.toggle ? null : d.toggle; return renderLog(); }
    if (d.ldiff) { if (state.openDiffs.has(d.ldiff)) state.openDiffs.delete(d.ldiff); else state.openDiffs.add(d.ldiff); return renderLog(); }
    if (d.vote) { const i = d.vote.lastIndexOf(':'); return P.vote(d.vote.slice(0, i), d.vote.slice(i + 1)); }
    if (d.resolve) return P.resolveDiscussion(d.resolve);
  });
  document.addEventListener('click', () => { if (state.view === 'doc') dismissSeen(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalRoot').firstChild && !$('#landForm')) return closeModal();
    if (state.myEdit && e.key === 'Escape') return cancelMyEdit();
    if (state.myEdit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); return saveMyEdit(); }
    if (state.view === 'doc' && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter')) dismissSeen();
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'composer') { e.preventDefault(); const inp = $('#input'); const v = inp.value.trim(); if (!v || state.pending) return; inp.value = ''; inp.style.height = ''; send(v); }
    if (f.id === 'landForm') { e.preventDefault(); submitName(); }
    if (f.id === 'issueForm') { e.preventDefault(); createIssue(); }
    if (f.id === 'compose') { e.preventDefault(); P.openDiscussionFromDraft(); }
    if (f.dataset.cmt) { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (v) { f.querySelector('input').value = ''; P.comment(f.dataset.cmt, v); } }
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'start') {
      const importing = e.target.value === 'import';
      $('#importFileLabel').hidden = !importing;
      $$('#issueForm [data-template-field]').forEach((field) => { field.hidden = importing; });
    }
    if (e.target.id === 'iFile' && e.target.files[0] && !$('#iName').value.trim()) $('#iName').value = e.target.files[0].name.replace(/\.[^.]+$/, '').slice(0, 80);
    if (e.target.id === 'modelPick') { state.model = e.target.value; try { localStorage.setItem('relay.model', state.model); } catch (err) { /* private mode */ } }
    if (e.target.id === 'logCat') { state.logCat = e.target.value; renderLog(); }
    if (e.target.id === 'logMember') { state.logMember = e.target.value; renderLog(); }
    if (e.target.dataset.conclusion) { state.conclusion[e.target.dataset.conclusion] = e.target.value; P.renderDisc(); }
  });
  let typingTimer;
  $('#input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } });
  $('#input').addEventListener('input', (e) => {
    e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    Store.setPresence({ typing: true }); clearTimeout(typingTimer); typingTimer = setTimeout(() => Store.setPresence({ typing: false }), 2500);
  });
  window.addEventListener('popstate', () => location.reload());

  /* ---------- boot ---------- */
  document.documentElement.lang = lang;
  document.title = lang === 'ko' ? 'Relay 팀 에이전트' : 'Relay team agent';
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  $('#langSeg').title = t('lang_title');
  $('[data-copy-link]').textContent = t('copy_link');
  $('#tabDoc').firstChild.textContent = t('tab_doc') + ' '; $('#tabDisc').firstChild.textContent = t('tab_disc') + ' '; $('#tabLog').firstChild.textContent = t('tab_log') + ' ';
  $('.send').setAttribute('aria-label', t('send'));
  setAgent('idle', t('agent_idle'));
  loadModels();
  (async () => {
    try { ['relay.private'].concat(Object.keys(localStorage).filter((k) => k.startsWith('relay.guide.'))).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* old keys from earlier builds */ }
    const rid = roomFromPath();
    showView('home');
    if (!Store.configured()) return toast(t('land_err_conf'));
    const saved = loadMe();
    if (!saved) { forgetMe(); return openNameModal(); }
    /* the nickname lives on the server; a browser that remembers someone unknown (or renamed) is corrected here */
    let r; try { r = await Store.profile({ userId: saved.userId }); } catch (e) { r = { error: e.message }; }
    if (r && r.ok) setMe(r);
    else if (r && r.error === 'not_found') { forgetMe(); return openNameModal(); }
    else setMe(saved);   // network trouble: keep going with what we have
    renderHome();
    if (rid) joinRoom(rid);
  })();
})();
