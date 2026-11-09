/* Panels: discussions (real votes, conclusion through /api/resolve) and the activity log (changes · discussions · sessions, with GitHub-style diffs). */
window.RelayPanels = (R) => {
  const { state, $, esc, fmt, t, icon, avatar, name, member, secLabel, changeById, discussions, participants, sessionOf, renderDoc, renderTabs, toast, Diff, ME, Store, lang } = R;
  const optName = (o) => `${t('opt_fmt', { id: o.id })} ${o.label}`;

  /* ---------- discussions ---------- */
  function renderDisc() {
    const list = discussions().sort((a, b) => (a.status === b.status ? b.at - a.at : a.status === 'open' ? -1 : 1));
    $('#discPane').innerHTML = `<div class="disc-wrap">
      <div class="disc-top"><div><b>${t('disc_top_title')}</b><span>${t('compose_foot')}</span></div></div>
      ${list.length ? list.map(renderDiscussion).join('') : `<div class="disc-empty"><h3>${t('disc_empty_h')}</h3><p>${esc(t('disc_empty_live'))}</p></div>`}</div>`;
  }
  function renderDiscussion(d) {
    const total = Math.max(participants().length, 1);
    const voted = new Set(d.options.flatMap((o) => o.votes));
    const winner = d.status === 'resolved' ? d.result : null;
    const sorted = [...d.options].sort((a, b) => b.votes.length - a.votes.length);
    const top = sorted.length ? sorted[0].votes.length : 0;
    const tied = top > 0 ? sorted.filter((o) => o.votes.length === top) : [];
    const isTie = tied.length > 1;
    const myVote = (d.options.find((o) => o.votes.includes(ME())) || {}).id;
    const conclusion = d.conclusion || (top > 0 && !isTie ? sorted[0].id : '');
    const busy = state.resolving === d.id;
    const canResolve = voted.size >= 1 && conclusion && !busy;
    const target = d.sectionId ? secLabel(d.sectionId) : secLabel('s8');
    const opener = d.openedBy === 'agent' ? t('opened_by_agent') : t('opened_by', { name: name(d.openedBy) });
    return `
      <div class="disc ${d.status}" data-id="${d.id}">
        <div class="disc-h"><span class="disc-tag">${t('disc_n', { n: d.n })} · ${d.status === 'open' ? t('status_open') : t('status_done')}</span><strong>${esc(d.title)}</strong>${d.sectionId ? `<span class="sec-ref" data-goto="${d.sectionId}">${esc(secLabel(d.sectionId))}</span>` : ''}<span class="who">${avatar(d.openedBy, 'sm')} ${esc(opener)} · <span class="mono">${fmt(d.at)}</span></span></div>
        <p class="disc-q">${esc(d.question)}</p>
        <ul class="opts">${d.options.map((o) => `
          <li class="opt ${winner === o.id ? 'winner' : ''}" style="--w:${(o.votes.length / total) * 100}%">
            <span class="bar" aria-hidden="true"></span>
            <span class="key">${o.id}</span>
            <span class="lab">${esc(o.label)}${o.desc ? `<span class="desc">${esc(o.desc)}</span>` : ''}</span>
            <span class="voters"><span class="avs">${o.votes.map((v) => avatar(v)).join('')}</span>
              ${d.status === 'open' ? `<button class="btn vote" data-vote="${d.id}:${o.id}" aria-pressed="${myVote === o.id}">${myVote === o.id ? t('voted') : t('vote')}</button>` : `<span class="mono">${t('votes_n', { n: o.votes.length })}</span>`}
            </span>
          </li>`).join('')}
        </ul>
        ${d.comments.length ? `<ul class="cmts">${d.comments.map((c) => `<li class="cmt">${avatar(c.by)}<span><b>${esc(name(c.by))}</b>${esc(c.text)}<span class="t mono">${fmt(c.at)}</span></span></li>`).join('')}</ul>` : ''}
        <div class="disc-f">
          ${d.status === 'open'
            ? `<span class="agentline">${avatar('agent', '', 'waiting')}<span class="dot"></span>${esc(d.sectionId ? t('agent_watching', { sec: secLabel(d.sectionId) }) : t('agent_watching_none'))}</span><span class="spacer"></span>
               <span class="mono">${t('voted_count', { a: voted.size, b: total })}</span>
               ${isTie ? `<span class="tie">${esc(t('tie', { opts: tied.map((o) => o.id).join('·') }))}</span>` : ''}
               <select data-conclusion="${d.id}" aria-label="${esc(t('pick_conclusion'))}"><option value="">${isTie ? t('tie_pick') : t('pick_conclusion')}</option>${d.options.map((o) => `<option value="${o.id}" ${conclusion === o.id ? 'selected' : ''}>${esc(optName(o))}</option>`).join('')}</select>
               <button class="btn primary ${voted.size >= 3 && top >= 2 && !isTie ? 'ready' : ''}" data-resolve="${d.id}" ${canResolve ? '' : 'disabled'}>${busy ? t('resolving') : t('resolve')}</button>`
            : `${avatar('agent')}<span><b>${esc(t('concluded_as', { id: d.result }))}</b> · ${d.applied ? `${esc(t('applied_to', { sec: target }))} <span class="mono">${fmt(d.applied.at)}</span>` : t('applying')}</span>`}
        </div>
        ${d.status === 'resolved' ? `<div class="disc-result">
            ${d.applied ? `<div class="h">${t('result_h')}<span class="spacer"></span><button class="btn" data-goto-diff="${d.sectionId || 's8'}:${d.applied.changeId}:${esc(t('compare_label_disc', { n: d.n }))}">${t('see_in_doc')}</button></div>
              ${d.applied.before ? `<p class="del">${esc(d.applied.before)}</p>` : ''}<p class="add">${esc(d.applied.after)}</p>`
            : `<span class="pending">${avatar('agent', 'sm', 'working')} ${esc(t('result_pending', { sec: target }))}</span>`}
          </div>` : ''}
      </div>`;
  }
  async function vote(discId, optionId) {
    const d = state.discRows.find((x) => x.id === discId); if (!d || d.status !== 'open') return;
    const me = Store.me();
    const prev = state.votes.find((v) => v.discussion_id === discId && v.user_id === ME());
    state.votes = state.votes.filter((v) => v !== prev).concat([{ ...(prev || {}), discussion_id: discId, room_id: state.roomId, user_id: ME(), user_name: me.name, option_id: optionId, created_at: new Date().toISOString() }]);
    renderDisc();
    const r = await Store.vote(discId, optionId);
    if (r.error) { toast(t('err_generic', { err: r.error })); state.votes = state.votes.filter((v) => !(v.discussion_id === discId && v.user_id === ME())).concat(prev ? [prev] : []); renderDisc(); }
  }
  async function resolveDiscussion(discId) {
    const d = discussions().find((x) => x.id === discId);
    if (!d || d.status !== 'open' || state.resolving) return;
    const sorted = [...d.options].sort((a, b) => b.votes.length - a.votes.length);
    const isTie = sorted.length > 1 && sorted[0].votes.length === sorted[1].votes.length;
    if (isTie && !d.conclusion) return toast(t('err_tie'));
    state.resolving = discId; renderDisc();
    let r; try { r = await Store.resolve(discId, d.conclusion || null, { lang }); } catch (e) { r = { error: e.message }; }
    state.resolving = null; renderDisc();
    if (r && r.error) toast(r.error === 'tie' ? t('err_tie') : t('err_generic', { err: r.error }));
  }

  /* ---------- activity log: built from changes, discussions and sessions, newest first ---------- */
  function buildLog() {
    const out = [];
    state.changeList.forEach((c) => {
      if (c.kind === 'agent') out.push({ kind: 'session', at: c.at, by: c.by, sessionId: `ch:${c.id}`, sectionId: c.sectionId, changeId: c.id });
      if (c.kind === 'human') out.push({ kind: 'human', at: c.at, by: c.by, sectionId: c.sectionId, changeId: c.id });
    });
    state.messages.forEach((m) => { if (m.role === 'agent' && !m.meta.change_id && ['none', 'clarify'].includes(m.meta.action)) out.push({ kind: 'session', at: m.at, by: m.userId, sessionId: `msg:${m.id}`, sectionId: null }); });
    discussions().forEach((d) => {
      out.push({ kind: 'disc', at: d.at, by: 'agent', discussionId: d.id, sectionId: d.sectionId, text: t('log_disc_open', { n: d.n, title: d.title }) });
      const row = state.discRows.find((x) => x.id === d.id);
      if (d.status === 'resolved') {
        const opt = d.options.find((o) => o.id === d.result) || {};
        out.push({ kind: 'disc', at: new Date(row.resolved_at || d.at), by: row.resolved_by_id || 'agent', discussionId: d.id, sectionId: d.sectionId, text: t('log_disc_done', { n: d.n, id: d.result, label: opt.label || '' }) });
        if (d.applied) out.push({ kind: 'apply', at: new Date(d.applied.at.getTime() + 1), by: 'agent', discussionId: d.id, sectionId: d.sectionId || 's8', changeId: d.applied.changeId, text: d.sectionId ? t('log_apply_sec', { n: d.n, sec: secLabel(d.sectionId) }) : t('log_apply_none', { n: d.n }) });
      }
    });
    return out.sort((a, b) => b.at - a.at);
  }
  const CATS = { all: () => true, agent: (e) => (e.kind === 'session' && e.changeId) || e.kind === 'apply', human: (e) => e.kind === 'human', disc: (e) => e.kind === 'disc' || e.kind === 'apply' };
  const secRefOf = (id) => (id ? `<span class="sec-ref" data-goto="${id}">${esc(secLabel(id))}</span>` : t('no_section'));
  function diffBlock(changeId) {
    const c = changeById(changeId); if (!c) return '';
    const open = state.openDiffs.has(changeId);
    return `<div class="ent-diff"><button class="btn ghost sm" data-ldiff="${changeId}" aria-expanded="${open}">${open ? t('hide_diff') : t('show_diff')}</button>
      ${open ? `<p class="policy">${t('diff_policy')}</p>${Diff.renderUnified(c.prev, c.next, esc)}` : ''}</div>`;
  }
  function renderLog() {
    const chev = `<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>`;
    const all = buildLog();
    const entries = all.filter((e) => CATS[state.logCat](e) && (state.logMember === 'all' || e.by === state.logMember));
    const who = [...new Set(all.map((e) => e.by))].filter((id) => id !== 'agent');
    const items = entries.map((e) => {
      const m = member(e.by);
      if (e.kind === 'session') {
        const s = sessionOf(e.sessionId); if (!s) return '';
        const open = state.openEntry === e.sessionId;
        return `
          <li class="ent kind-session ${open ? 'open' : ''}" data-session="${e.sessionId}" style="--mc:${m.color}">
            <div class="ent-card">
              <button class="ent-h" data-toggle="${e.sessionId}" aria-expanded="${open}">${avatar(e.by)}<b>${esc(m.name)}</b><span class="what">${e.sectionId ? t('log_session', { sec: secRefOf(e.sectionId) }) : t('log_session_none')}</span><span class="t mono">${fmt(e.at)}</span>${chev}</button>
              <div class="ent-sum">${esc(s.title)}</div>
              ${e.changeId ? diffBlock(e.changeId) : ''}
              ${open ? `<div class="transcript">${s.messages.map((x) => `
                <div class="m ${x.role} ${x.applied ? 'applied' : ''}">${x.role === 'agent' ? avatar('agent') : avatar(s.by)}<div class="bub">${esc(x.text)}${x.applied ? `<div class="applied-tag"><i></i>${esc(secLabel(x.applied))}</div>` : ''}</div></div>`).join('')}</div>` : ''}
            </div>
          </li>`;
      }
      if (e.kind === 'human') {
        const c = changeById(e.changeId);
        return `<li class="ent kind-human" style="--mc:${m.color}"><div class="ent-card"><div class="ent-h">${avatar(e.by)}<b>${esc(m.name)}</b><span class="what">${t('log_human', { sec: secRefOf(e.sectionId) })}<span class="pill direct">${icon('pencil')}${t('cat_human')}</span></span><span class="t mono">${fmt(e.at)}</span></div>
          ${c ? `<div class="ent-sum">${esc(c.summary)}</div>` : ''}${diffBlock(e.changeId)}</div></li>`;
      }
      const isApply = e.kind === 'apply';
      const byAgent = isApply || e.by === 'agent';
      return `
        <li class="ent kind-${e.kind}" style="--mc:${byAgent ? '#6F70FF' : m.color}">
          <div class="ent-card"><div class="ent-h">${byAgent ? avatar('agent') : avatar(e.by)}<b>${esc(byAgent ? t('agent_name') : m.name)}</b><span class="what">${esc(e.text)}</span>
            ${e.discussionId ? `<button class="btn ghost sm" data-disc="${e.discussionId}">${t('view')}</button>` : ''}
            <span class="t mono">${fmt(e.at)}</span></div>${isApply && e.changeId ? diffBlock(e.changeId) : ''}</div>
        </li>`;
    }).join('');
    $('#logPane').innerHTML = `<div class="log-wrap">
      <div class="log-head"><p class="log-day">${t('log_head', { n: entries.length })}</p>
        <select id="logCat" aria-label="${t('cat_all')}">${['all', 'agent', 'human', 'disc'].map((k) => `<option value="${k}" ${state.logCat === k ? 'selected' : ''}>${t('cat_' + k)}</option>`).join('')}</select>
        <select id="logMember" aria-label="${t('mem_all')}"><option value="all" ${state.logMember === 'all' ? 'selected' : ''}>${t('mem_all')}</option>${who.map((id) => `<option value="${id}" ${state.logMember === id ? 'selected' : ''}>${esc(name(id))}</option>`).join('')}<option value="agent" ${state.logMember === 'agent' ? 'selected' : ''}>${t('agent_name')}</option></select></div>
      <ul class="log">${items || `<li class="empty">${t('log_empty')}</li>`}</ul></div>`;
  }

  return { renderDisc, vote, resolveDiscussion, buildLog, renderLog };
};
