/* Relay MVP: the prototype's screens, driven by Store (Supabase + /api). One agent, many people, every change traceable, live. */
(() => {
  const { MEMBERS, DOC_EN } = window.SEED;
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
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n]}"/></svg>`;

  /* ---------- people: whoever shows up in presence, messages, changes and votes ---------- */
  const PHOTOS = { me: ['img/me.jpg', '#D9503B'], minsu: ['img/minsu.jpg', '#2E6BE0'], jieun: ['img/jieun.jpg', '#1E9A66'], hyunwoo: ['img/hyunwoo.jpg', '#D28B0A'] };
  const AVATARS = ['p:me', 'p:hyunwoo', 'c:#D9503B', 'c:#8B5CF6', 'c:#0EA5A4', 'c:#2E6BE0'];
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
  const avatarOf = (av, nm, cls = '') => { const tmp = `__pick_${av}`; learn(tmp, nm, av); const h = avatar(tmp, cls); people.delete(tmp); return h; };

  /* ---------- state ---------- */
  const state = {
    view: 'landing', tab: 'doc', me: null, roomId: null, room: null, viewing: null, landing: { busy: false, err: '', avatar: null },
    sections: [], changeList: [], messages: [], discRows: [], votes: [], presence: [],
    editing: {}, recent: {}, showDiff: {}, unread: new Set(), lastSeen: {},
    openPop: null, popMeta: null, openEntry: null, openDiffs: new Set(), logCat: 'all', logMember: 'all',
    ctx: null, pending: false, queued: false, resolving: null, botBusy: false, conclusion: {}, collapsed: false, localMsgs: [],
    animating: 0, docDirty: false, agentStatus: 'idle', myEdit: null, saving: false,
  };
  const ME = () => state.me && state.me.userId;

  const normSection = (r) => ({ id: r.id, num: r.num, title: r.title, paras: r.paras || [], footnote: r.footnote, steps: r.steps, page: r.page || 1, rev: r.rev, lastChangeId: r.last_change_id });
  const normChange = (r) => ({ id: r.id, sectionId: r.section_id, kind: r.kind, by: r.by_id, byName: r.by_name, summary: r.summary || '', why: r.why, prev: r.prev || [], next: r.next || [], discussionId: r.discussion_id, messageId: r.message_id, at: new Date(r.created_at) });
  const normMessage = (r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, role: r.role, text: r.text, meta: r.meta || {}, at: new Date(r.created_at) });
  const upsert = (list, item, key = (x) => x.id) => { const i = list.findIndex((x) => key(x) === key(item)); if (i >= 0) list[i] = item; else list.push(item); return i < 0; };

  const secById = (id) => state.sections.find((s) => s.id === id);
  const secLabel = (id) => { const s = secById(id); return s ? `${s.num}. ${s.title}` : t('no_section'); };
  const secRef = (id) => secById(id) ? `<span class="sec-ref" data-goto="${id}">${esc(secLabel(id))}</span>` : t('no_section');
  const changesOf = (sid) => state.changeList.filter((c) => c.sectionId === sid);
  const changeById = (cid) => state.changeList.find((c) => c.id === cid);
  const latestChange = (sid) => { const s = secById(sid); const byId = s && s.lastChangeId && changeById(s.lastChangeId); if (byId) return byId; const l = changesOf(sid); return l.length ? l[l.length - 1] : null; };
  const latestChangeTime = () => state.changeList.reduce((a, c) => (!a || c.at > a ? c.at : a), null);
  const humanEditing = (sid) => { const p = state.presence.find((x) => x.userId !== ME() && x.editing === sid); return p ? p.userId : null; };
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
      comments: vs.filter((v) => v.comment).map((v) => ({ by: v.user_id, text: v.comment, at: new Date(v.created_at) })),
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
    setTimeout(() => { delete state.recent[sid]; renderDoc(); }, RECENT_MS);
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
      if (!state.animating && state.docDirty) { state.docDirty = false; renderDoc(); } else renderCursors();
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
  function markRead(id) { const s = secById(id); if (!s) return; state.unread.delete(id); state.lastSeen[id] = clone(s.paras); renderDoc(); renderTabs(); }
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
    $('#presence').innerHTML = ids.map((id) => {
      const m = member(id); const mine = id === ME();
      const p = state.presence.find((x) => x.userId === id);
      const where = p && p.sectionId ? ` · ${secLabel(p.sectionId)}` : '';
      const title = `${m.name} · ${mine ? t('presence_me') : m.bot ? t('presence_bot') : t('presence_online')}${where}${mine ? '' : ' · ' + t('presence_view')}`;
      return `<button class="av live ${state.viewing === id ? 'current' : ''}" data-user="${id}" style="--c:${m.color}" title="${esc(title)}">${m.photo ? `<img src="${m.photo}" alt="${esc(m.name)}">` : esc(initial(m.name))}</button>`;
    }).join('');
  }
  const botDone = () => state.changeList.some((c) => c.by === 'bot_jieun' && c.sectionId === 's3');
  function renderHeaderActions() {
    const b = $('#botBtn'); if (!b) return;
    const on = botDone();
    b.innerHTML = `${icon('userplus')}<span>${on ? t('bot_on') : state.botBusy ? t('bot_busy') : t('bot_btn')}</span>`;
    b.disabled = !!(on || state.botBusy);
    $('#inviteBtn').innerHTML = `${icon('link')}<span>${t('invite_btn')}</span>`;
  }

  /* ---------- the right pane: my session or someone else's (read-only) ---------- */
  function viewSession(id) { state.viewing = id; renderPresence(); renderChatHead(); renderGuide(); renderChat(); renderComposer(); }
  function renderChatHead() {
    const id = state.viewing; const mine = id === ME();
    $('#chatHead').innerHTML = `${avatar(id)}<div class="ttl"><h2>${esc(t('my_session', { name: name(id) }))}</h2></div>
      <span class="head-acts">${mine ? '' : `<button class="btn ghost" data-user="${ME()}">${t('back_to_mine')}</button>`}<button class="iconbtn sm" data-collapse title="${t('collapse')}">${icon('panel')}</button></span>`;
  }
  function renderComposer() {
    const mine = state.viewing === ME();
    $('#composer').hidden = !mine; $('#readonly').hidden = mine;
    if (!mine) $('#readonly').innerHTML = `${icon('lock')}<span>${t('readonly_badge')}</span>`;
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
  function agentHtml(m) {
    const meta = m.meta || {};
    let h = `<p>${esc(m.text)}</p>`;
    const c = meta.change_id && changeById(meta.change_id);
    if (meta.applied && meta.action === 'edit') h += `<p class="meta"><span class="done"><i></i>${t('msg.applied_meta')}</span> · ${secRef(meta.applied)}</p>${c ? diffMini(c) : ''}`;
    if (meta.action === 'resolve' && c) h += `<div class="acts"><button class="btn" data-goto-diff="${c.sectionId}:${c.id}:${esc(t('compare_label_disc', { n: (state.discRows.find((d) => d.id === meta.discussion_id) || {}).n }))}">${t('msg.see_changes')}</button><button class="btn ghost" data-goto="s8">${t('msg.see_decision')}</button></div>`;
    if (meta.conflict) {
      const cf = meta.conflict;
      h += `<div class="note">${t('msg.conflict_live', { note: esc(cf.note) })}${cf.discussion_id ? ` ${esc(t('msg.conflict_disc', { n: cf.discussion_n || '' }))}` : ''}</div><div class="acts">${cf.discussion_id ? `<button class="btn primary" data-disc="${cf.discussion_id}">${t('see_disc')}</button>` : ''}${changeById(cf.change_id) ? `<button class="btn" data-session="ch:${cf.change_id}">${esc(t('msg.see_convo_of', { name: cf.by_name }))}</button>` : ''}</div>`;
    }
    return h;
  }
  function renderChat() {
    const box = $('#msgs'); const id = state.viewing; if (!id) return;
    const mine = id === ME();
    const list = state.messages.filter((m) => m.userId === id);
    const items = [];
    if (mine) items.push({ role: 'agent', html: t('msg.welcome_live', { name: esc(name(id)) }), at: new Date(0) });
    list.forEach((m) => items.push(m.role === 'agent' ? { role: 'agent', html: agentHtml(m), at: m.at } : { role: 'me', text: m.text, at: m.at }));
    if (mine) state.localMsgs.forEach((m) => items.push(m));
    items.sort((a, b) => a.at - b.at);
    if (mine && state.queued) items.push({ role: 'agent', html: t('msg.queued', { name: esc((state.room.agent || {}).by_name || '?') }) });
    if (mine && state.pending && !state.queued) items.push({ kind: 'typing' });
    box.innerHTML = (!mine && !list.length ? `<div class="private-note"><p>${esc(t('sess_empty'))}</p></div>` : '') + items.map((m) => {
      if (m.kind === 'typing') return `<div class="msg agent">${avatar('agent', '', 'working')}<div class="bub typing"><i></i><i></i><i></i></div></div>`;
      return `<div class="msg ${m.role}">${m.role === 'agent' ? avatar('agent') : ''}<div class="bub">${m.role === 'me' ? `<p>${esc(m.text)}</p>` : m.html}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
  function localSay(html) { state.localMsgs.push({ role: 'agent', html, at: new Date() }); renderChat(); }

  /* ---------- the in-product walkthrough for a judge who is alone ---------- */
  function guideStep() {
    const ds = state.discRows;
    if (ds.some((d) => d.status === 'resolved')) return 3;
    if (ds.some((d) => d.status === 'open')) return 2;
    if (botDone()) return 1;
    return 0;
  }
  function renderGuide() {
    const el = $('#guide'); if (!el) return;
    if (state.viewing !== ME()) { el.hidden = true; return; }
    el.hidden = false;
    const step = guideStep(); const steps = t('guide_live'); const [h, p] = steps[step];
    const open = state.discRows.find((d) => d.status === 'open');
    const act = step === 0 ? `<button class="btn primary sm" data-bot ${state.botBusy ? 'disabled' : ''}>${icon('userplus')}${state.botBusy ? t('bot_busy') : t('bot_btn')}</button>`
      : step === 1 ? `<button type="button" class="chip suggest" data-suggest ${state.pending ? 'disabled' : ''}>${esc(t('guide_suggest'))}</button>`
      : step === 2 && open ? `<button class="btn primary sm" data-disc="${open.id}">${t('see_disc')}</button>`
      : `<button class="btn sm" data-tab-go="log">${t('tab_log')}</button><button class="btn sm" data-invite>${icon('link')}${t('invite_btn')}</button>`;
    el.innerHTML = `<div class="g-head"><span class="g-dots">${steps.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}"></i>`).join('')}</span><span class="g-k">${esc(t('guide_title'))} · ${esc(t('guide_step', { n: step + 1 }))}</span></div>
      <div class="g-body"><b>${esc(h)}</b><p>${esc(p)}</p><div class="g-act">${act}</div></div>`;
  }
  function renderChips() { $('#chips').innerHTML = t('chips_live').map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join(''); }
  function renderCtx() {
    $('#ctx').innerHTML = state.ctx ? `<span class="ctx">${esc(t('ctx_about', { sec: secLabel(state.ctx) }))}<button type="button" data-ctx-clear aria-label="${t('ctx_clear')}">${icon('close')}</button></span>` : '';
    $('#input').placeholder = state.ctx ? t('input_ph_ctx', { sec: secLabel(state.ctx) }) : t('input_ph');
  }

  async function send(text) {
    if (state.viewing !== ME() || state.pending) return;
    const body = (state.ctx ? t('ask_prefix', { sec: secLabel(state.ctx) }) : '') + text;
    state.pending = true; state.ctx = null; renderCtx(); renderComposer(); renderChat(); renderGuide();
    Store.setPresence({ typing: false });
    let res;
    try { res = await Store.say(body.slice(0, 500), { lang, onQueued: (q) => { state.queued = q; renderAgent(); renderChat(); } }); }
    catch (e) { res = { error: e.message }; }
    state.pending = false; state.queued = false;
    renderComposer(); renderAgent(); renderChat(); renderGuide();
    if (res && res.error) localSay(`<p class="meta">${esc(t('err_generic', { err: res.error }))}</p>`);
    $('#input').focus();
  }
  async function bringTeammate() {
    if (state.botBusy || botDone()) return;
    state.botBusy = true; renderHeaderActions(); renderGuide();
    let r; try { r = await Store.bot({ lang }); } catch (e) { r = { error: e.message }; }
    state.botBusy = false; renderHeaderActions(); renderGuide();
    if (r && r.error) toast(t('err_generic', { err: r.error }));
  }
  function copyInvite() {
    const url = `${location.origin}/r/${state.roomId}`;
    const done = () => toast(t('toast_copied'));
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('', url)); else prompt('', url);
  }

  /* ---------- tabs ---------- */
  function setTab(tab) {
    state.tab = tab;
    ['doc', 'disc', 'log'].forEach((x) => { $(`#tab${x[0].toUpperCase() + x.slice(1)}`).setAttribute('aria-selected', x === tab); $(`#${x}Pane`).hidden = x !== tab; });
    if (tab === 'doc') renderCursors();
  }
  function renderDocMeta() { $('#tabsHint').innerHTML = `<span class="mono">${esc(DOC.version)}</span> · ${t('last_applied')} <span class="mono">${fmt(latestChangeTime())}</span>`; }
  function renderTabs() {
    $('#docCount').textContent = state.unread.size; $('#docCount').hidden = state.unread.size === 0; $('#docCount').classList.toggle('hot', state.unread.size > 0);
    const open = state.discRows.filter((d) => d.status === 'open').length;
    $('#discCount').textContent = state.discRows.length; $('#discCount').classList.toggle('open', open > 0);
    $('#logCount').textContent = P.buildLog().length;
  }

  /* ---------- document ---------- */
  function renderDoc() {
    if (state.view !== 'doc') return;
    if (state.animating) { state.docDirty = true; return; }
    const keep = state.myEdit && $(`.sec[data-id="${state.myEdit}"] .sec-body.editable`);
    const keepHtml = keep ? keep.innerHTML : null; const hadFocus = keep && document.activeElement === keep;
    const title = (state.room && state.room.title) || DOC.title;
    $('#docTitle').textContent = title;
    const p1 = state.sections.filter((s) => (s.page || 1) === 1), p2 = state.sections.filter((s) => s.page === 2);
    $('#docPane').innerHTML = `
      <div class="paper-wrap" style="--zoom:1">
        <article class="paper"><h1>${esc(title)}</h1><p class="lede">${esc(DOC.lede)}</p>${p1.map(renderSection).join('')}<div class="paper-foot mono"><span>${esc(DOC.footer)}</span><span>01 / 02</span></div></article>
        <article class="paper">${p2.map(renderSection).join('')}<div class="paper-foot mono"><span>${esc(DOC.footer)}</span><span>02 / 02</span></div></article>
      </div>`;
    if (keepHtml != null) { const el = $(`.sec[data-id="${state.myEdit}"] .sec-body.editable`); if (el) { el.innerHTML = keepHtml; if (hadFocus) el.focus(); } }
    renderDocMeta(); renderCursors();
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
        <header class="sec-h">
          <h2><span class="num">${sec.num}</span>${esc(sec.title)}</h2>
          ${mine ? `<span class="edit-tools"><span class="hint">${t('editing_hint')}</span><button class="btn primary sm" data-save-edit ${state.saving ? 'disabled' : ''}>${t('save')}</button><button class="btn ghost sm" data-cancel-edit>${t('cancel')}</button></span>`
          : `<span class="sec-tools">
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
        <div class="pop-actions">
          <button class="btn" data-diff="${sectionId}" data-base="${since > 1 ? 'seen' : ch.id}" data-label="${esc(label)}">${t('compare')}</button>
          ${ch.kind === 'agent' ? `<button class="btn" data-session="ch:${ch.id}">${isMe ? t('see_my_convo') : t('see_convo')}</button>` : ''}
          ${ch.discussionId ? `<button class="btn" data-disc="${ch.discussionId}">${t('see_disc')}</button>` : ''}
          ${!isMe && !isAgent ? `<button class="btn agent" data-ask="${sectionId}">${t('ask_different')}</button>` : ''}
        </div>
        ${earlier.length ? `<div class="pop-earlier"><b>${t('pop_earlier')}</b>${earlier.map((c) => `<span class="row">${avatar(c.by, 'sm')}<span>${esc(c.summary)}</span><span class="t mono">${fmt(c.at)}</span></span>`).join('')}</div>` : ''}
      </div>`;
  }

  /* ---------- who is where: a name tag at the start of the section each person is looking at ---------- */
  function cursors() {
    const out = {};
    state.presence.forEach((p) => { if (p.userId !== ME() && (p.editing || p.sectionId)) out[p.userId] = p.editing || p.sectionId; });
    if (state.room && state.room.bots_on) {
      const a = state.room.agent || {}; const open = state.discRows.find((d) => d.status === 'open');
      out.bot_jieun = a.state === 'working' && a.by_id === 'bot_jieun' && a.section_id ? a.section_id : 's3';
      out.bot_minsu = open ? (open.section_id || 's8') : 's2';
    }
    return out;
  }
  function makeCaret(mid) {
    const editing = !!state.presence.find((p) => p.userId === mid && p.editing);
    const s = document.createElement('span'); s.className = `cursor ${editing ? 'typing' : ''}`; s.style.setProperty('--c', member(mid).color); s.contentEditable = 'false';
    s.innerHTML = `<i></i><b>${esc(name(mid))}${editing ? icon('pencil') : ''}</b>`; return s;
  }
  function renderCursors() {
    if (state.view !== 'doc' || state.tab !== 'doc') return;
    $$('.cursor').forEach((el) => el.remove());
    $$('.sec-body p').forEach((p) => p.normalize());
    const bySec = {};
    Object.entries(cursors()).forEach(([mid, sid]) => { (bySec[sid] ||= []).push(mid); });
    Object.entries(bySec).forEach(([sid, list]) => {
      const el = $(`.sec[data-id="${sid}"]`); if (!el || state.myEdit === sid) return;
      const ps = $$('.sec-body > p:not(.fn)', el);
      list.forEach((mid, i) => { const p = ps[Math.min(i, ps.length - 1)]; if (p) p.insertBefore(makeCaret(mid), p.firstChild); });
    });
  }
  let presTimer = null;
  function trackMySection() {
    if (state.view !== 'doc' || state.tab !== 'doc') return;
    clearTimeout(presTimer);
    presTimer = setTimeout(() => {
      const sc = $('#leftScroll'); const mid = sc.getBoundingClientRect().top + sc.clientHeight / 2;
      let best = null, dist = Infinity;
      $$('.sec').forEach((el) => { const r = el.getBoundingClientRect(); const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0; if (d < dist) { dist = d; best = el.dataset.id; } });
      if (best) Store.setPresence({ sectionId: best });
    }, 350);
  }
  $('#leftScroll').addEventListener('scroll', () => {
    if (state.tab !== 'doc') return;
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
  function cancelMyEdit() { state.myEdit = null; Store.setPresence({ editing: null }); renderDoc(); }
  async function saveMyEdit() {
    const id = state.myEdit; if (!id || state.saving) return;
    const body = $(`.sec[data-id="${id}"] .sec-body.editable`);
    const paras = Array.from(body.childNodes).map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!paras.length || JSON.stringify(paras) === JSON.stringify(secById(id).paras)) return cancelMyEdit();
    state.saving = true; renderDoc();
    let r; try { r = await Store.edit(id, paras, state.editRev, { lang }); } catch (e) { r = { error: e.message }; }
    state.saving = false; state.myEdit = null; Store.setPresence({ editing: null });
    renderDoc();
    if (r && r.error) toast(r.error === 'stale' ? t('err_stale') : r.error === 'frozen' ? t('err_frozen') : t('err_generic', { err: r.error }));
  }

  /* ---------- landing: name, avatar, start or join ---------- */
  const roomFromPath = () => { const m = location.pathname.match(/^\/r\/([a-z0-9]{4,12})\/?$/i); return m ? m[1].toLowerCase() : null; };
  function loadMe() { try { const v = JSON.parse(localStorage.getItem('relay.me') || 'null'); return v && v.userId && v.name ? v : null; } catch (e) { return null; } }
  function saveMe(v) { try { localStorage.setItem('relay.me', JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function renderLanding() {
    const L = state.landing; const rid = L.forceNew ? null : roomFromPath(); const saved = loadMe();
    const nm = L.name ?? (saved ? saved.name : '');
    const av = L.avatar || (saved && saved.avatar) || AVATARS[0]; L.avatar = av;
    $('#home').innerHTML = `
      <div class="landing"><form class="land-card" id="landForm">
        <div class="land-brand"><span class="brand-mark" aria-hidden="true"></span>Relay</div>
        <h1>${esc(t('land_tag'))}</h1>
        <ul class="land-points">${t('land_points').map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul>
        <label class="land-field">${t('land_name')}<input id="lName" maxlength="24" autocomplete="off" value="${esc(nm)}" placeholder="${esc(t('land_name_ph'))}"></label>
        <div class="lbl-row">${t('land_avatar')}</div>
        <div class="avatar-pick">${AVATARS.map((a) => `<button type="button" class="pick ${a === av ? 'on' : ''}" data-avatar="${a}" aria-pressed="${a === av}">${avatarOf(a, nm || '?')}</button>`).join('')}</div>
        <button type="submit" class="btn primary big" ${L.busy ? 'disabled' : ''}>${esc(L.busy ? (rid ? t('land_busy_join') : t('land_busy_start')) : (rid ? t('land_join', { id: rid }) : t('land_start')))}</button>
        <p class="land-hint">${esc(rid ? t('land_hint_join', { id: rid }) : t('land_hint_start'))}</p>
        ${rid ? `<button type="button" class="btn ghost sm" data-new-room>${t('land_new')}</button>` : ''}
        ${L.err ? `<p class="err">${esc(L.err)}</p>` : ''}
      </form></div>`;
  }
  async function submitLanding() {
    const L = state.landing; if (L.busy) return;
    const nm = ($('#lName').value || '').trim(); L.name = nm;
    if (!nm) { L.err = t('land_err_name'); renderLanding(); $('#lName').focus(); return; }
    if (!Store.configured()) { L.err = t('land_err_conf'); renderLanding(); return; }
    const saved = loadMe();
    const me = { userId: saved && saved.userId ? saved.userId : `u_${Math.random().toString(36).slice(2, 10)}`, name: nm, avatar: L.avatar || AVATARS[0] };
    saveMe(me); state.me = me; learn(me.userId, me.name, me.avatar);
    L.busy = true; L.err = ''; renderLanding();
    try {
      let rid = L.forceNew ? null : roomFromPath();
      if (!rid) { rid = await Store.createRoom(); history.pushState(null, '', `/r/${rid}${location.search}`); }
      await enterRoom(rid);
    } catch (e) {
      L.busy = false; L.err = e.message === 'room_not_found' ? t('land_err_room') : t('err_generic', { err: e.message }); if (e.message === 'room_not_found') L.forceNew = true;
      renderLanding();
    }
  }

  /* ---------- joining a room and live updates ---------- */
  async function enterRoom(rid) {
    const data = await Store.join(rid, state.me);
    state.roomId = rid; state.room = data.room; state.viewing = ME();
    state.sections = data.sections.map(normSection);
    state.changeList = data.changes.map(normChange);
    state.messages = data.messages.map(normMessage);
    state.discRows = data.discussions; state.votes = data.votes; state.presence = data.presence || [];
    state.messages.forEach((m) => learn(m.userId, m.userName, m.meta && m.meta.avatar));
    state.changeList.forEach((c) => learn(c.by, c.byName));
    state.votes.forEach((v) => learn(v.user_id, v.user_name));
    state.presence.forEach((p) => learn(p.userId, p.name, p.avatar));
    state.sections.forEach((s) => {
      const c = latestChange(s.id);
      const fresh = c && c.by !== ME() && Date.now() - c.at < RECENT_CHANGE_MS;
      state.lastSeen[s.id] = clone(fresh ? c.prev : s.paras); if (fresh) state.unread.add(s.id);
    });
    showView('doc');
  }
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
  Store.on('changes', ({ type, row }) => { if (type !== 'INSERT') return; const c = normChange(row); learn(c.by, c.byName); upsert(state.changeList, c); renderDoc(); renderLog(); renderTabs(); renderChat(); renderGuide(); renderHeaderActions(); });
  Store.on('messages', ({ type, row }) => { if (type !== 'INSERT') return; const m = normMessage(row); learn(m.userId, m.userName, m.meta.avatar); upsert(state.messages, m); if (m.userId === state.viewing) renderChat(); renderLog(); renderTabs(); });
  Store.on('discussions', ({ row }) => { if (!row || row.room_id !== state.roomId) return; upsert(state.discRows, row); state.discRows.sort((a, b) => a.n - b.n); P.renderDisc(); renderTabs(); renderDoc(); renderAgent(); renderGuide(); renderLog(); });
  Store.on('votes', ({ type, row }) => {
    if (!row) return; const key = (v) => `${v.discussion_id}:${v.user_id}`;
    if (type === 'DELETE') state.votes = state.votes.filter((v) => key(v) !== key(row)); else { learn(row.user_id, row.user_name); upsert(state.votes, row, key); }
    P.renderDisc();
  });
  Store.on('room', ({ row }) => { if (!row) return; const wasBots = state.room && state.room.bots_on; state.room = row; renderAgent(); if (wasBots !== row.bots_on) { renderPresence(); renderHeaderActions(); } renderCursors(); });
  Store.on('presence', (list) => { const before = JSON.stringify(state.presence.map((p) => p.editing || null)); state.presence = list; list.forEach((p) => learn(p.userId, p.name, p.avatar)); renderPresence(); if (before !== JSON.stringify(list.map((p) => p.editing || null))) renderDoc(); else renderCursors(); });
  setInterval(() => { if (state.view === 'doc') renderAgent(); }, 5000);   // a stuck lock (crashed function) times out visually

  /* ---------- views ---------- */
  function showView(v) {
    state.view = v;
    $('#home').hidden = v !== 'landing'; $('.main').hidden = v !== 'doc';
    $$('.work-only').forEach((el) => { el.hidden = v !== 'doc'; });
    document.body.classList.toggle('on-home', v === 'landing');
    if (v === 'landing') return renderLanding();
    renderPresence(); renderChatHead(); renderComposer(); renderGuide(); renderChat(); P.renderDisc(); renderLog(); renderTabs(); renderChips(); renderCtx(); renderHeaderActions(); setTab('doc'); renderAgent(); renderDoc();
    setTimeout(trackMySection, 600);
  }
  let toastTimer;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
  function setLang(l) {
    try { localStorage.setItem('relay.lang', l); } catch (e) { /* storage may be blocked */ }
    const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
  }

  /* ---------- panels (discussions, activity log) ---------- */
  const R = { state, MEMBERS, $, $$, esc, fmt, t, icon, avatar, name, member, secById, secLabel, secRef, openDiscOf, latestChange, changeById, discussions, participants, sessionOf, renderDoc, renderTabs, setTab, gotoDiscussion, toast, Diff, ME, Store, lang };
  const P = window.RelayPanels(R);
  const renderLog = () => P.renderLog();

  /* ---------- events (delegated) ---------- */
  document.addEventListener('click', (e) => {
    const t0 = e.target.closest('[data-goto],[data-goto-diff],[data-session],[data-disc],[data-pop],[data-diff],[data-ask],[data-toggle],[data-ldiff],[data-vote],[data-resolve],[data-user],[data-collapse],[data-ctx-clear],[data-home],[data-lang],[data-bot],[data-invite],[data-avatar],[data-new-room],[data-suggest],[data-tab-go],[data-edit],[data-save-edit],[data-cancel-edit],.chip,.tab');
    if (!t0) { if (!e.target.closest('.pop') && state.openPop) { state.openPop = null; renderDoc(); } return; }
    const d = t0.dataset;
    if (t0.classList.contains('tab')) { const tab = t0.id.replace('tab', '').toLowerCase(); setTab(tab); if (tab === 'disc') P.renderDisc(); return; }
    if (t0.hasAttribute('data-suggest')) return send(t('guide_suggest'));
    if (t0.classList.contains('chip')) return send(t0.textContent);
    if (d.avatar) { state.landing.avatar = d.avatar; state.landing.name = $('#lName').value; return renderLanding(); }
    if (t0.hasAttribute('data-new-room')) { state.landing.forceNew = true; state.landing.name = $('#lName').value; return renderLanding(); }
    if (d.lang) return setLang(d.lang);
    if (t0.hasAttribute('data-home')) { location.href = `/${location.search}`; return; }
    if (t0.hasAttribute('data-bot')) return bringTeammate();
    if (t0.hasAttribute('data-invite')) return copyInvite();
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
    if (state.myEdit && e.key === 'Escape') return cancelMyEdit();
    if (state.myEdit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); return saveMyEdit(); }
    if (state.view === 'doc' && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter')) dismissSeen();
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'composer') { e.preventDefault(); const inp = $('#input'); const v = inp.value.trim(); if (!v || state.pending) return; inp.value = ''; inp.style.height = ''; send(v); }
    if (f.id === 'landForm') { e.preventDefault(); submitLanding(); }
  });
  document.addEventListener('change', (e) => {
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
  $('#tabDoc').firstChild.textContent = t('tab_doc') + ' '; $('#tabDisc').firstChild.textContent = t('tab_disc') + ' '; $('#tabLog').firstChild.textContent = t('tab_log') + ' ';
  $('.send').setAttribute('aria-label', t('send'));
  setAgent('idle', t('agent_idle'));
  (async () => {
    const rid = roomFromPath(); const saved = loadMe();
    if (rid && saved && Store.configured()) {
      state.me = saved; learn(saved.userId, saved.name, saved.avatar);
      state.landing.busy = true; showView('landing');
      try { await enterRoom(rid); return; }
      catch (e) { state.landing.busy = false; state.landing.err = e.message === 'room_not_found' ? t('land_err_room') : t('err_generic', { err: e.message }); if (e.message === 'room_not_found') state.landing.forceNew = true; }
    }
    if (!Store.configured()) state.landing.err = t('land_err_conf');
    showView('landing');
  })();
})();
