/* Paragraph diff with the same policy as GitHub: line (paragraph) LCS, no move detection, so a moved
   paragraph shows as removed at its old place and added at its new one. Paired lines get word highlights. */
window.RelayDiff = (() => {
  function lcs(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: 'eq', a: a[i], j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', a: a[i] }); i++; }
      else { ops.push({ t: 'add', b: b[j], j }); j++; }
    }
    while (i < n) ops.push({ t: 'del', a: a[i++] });
    while (j < m) ops.push({ t: 'add', b: b[j], j: j++ });
    return ops;
  }
  // rows: {t:'eq'|'del'|'add', text, pair?} ; a del/add run is paired index-wise for inline highlights
  function lineDiff(prev, next) {
    const ops = lcs(prev, next); const rows = []; let i = 0;
    while (i < ops.length) {
      if (ops[i].t === 'eq') { rows.push({ t: 'eq', text: ops[i].a, j: ops[i].j }); i++; continue; }
      const dels = [], adds = [];
      while (i < ops.length && ops[i].t !== 'eq') { (ops[i].t === 'del' ? dels : adds).push(ops[i]); i++; }
      const k = Math.min(dels.length, adds.length);
      dels.forEach((d, x) => rows.push({ t: 'del', text: d.a, pair: x < k ? adds[x].b : null }));
      adds.forEach((a, x) => rows.push({ t: 'add', text: a.b, j: a.j, pair: x < k ? dels[x].a : null }));
    }
    return rows;
  }
  // indices of paragraphs in `next` that are new or rewritten
  function changedIndices(prev, next) {
    return new Set(lineDiff(prev, next).filter((r) => r.t === 'add').map((r) => r.j));
  }
  const tokens = (s) => s.split(/(\s+|[·,.()→:]+)/).filter(Boolean);
  // text with the words that differ from `other` wrapped in <em>
  function inlineHtml(text, other, side, esc) {
    if (other == null) return esc(text);
    const ops = side === 'del' ? lcs(tokens(text), tokens(other)) : lcs(tokens(other), tokens(text));
    return ops.filter((o) => o.t === 'eq' || o.t === side).map((o) => (o.t === 'eq' ? esc(o.a) : `<em>${esc(side === 'del' ? o.a : o.b)}</em>`)).join('');
  }
  function renderUnified(prev, next, esc) {
    const rows = lineDiff(prev, next);
    return `<div class="udiff">${rows.map((r) => `<div class="row ${r.t}"><span class="g">${r.t === 'del' ? '−' : r.t === 'add' ? '+' : ''}</span><span class="tx">${r.t === 'eq' ? esc(r.text) : inlineHtml(r.text, r.pair, r.t, esc)}</span></div>`).join('')}</div>`;
  }
  return { lineDiff, changedIndices, inlineHtml, renderUnified };
})();
