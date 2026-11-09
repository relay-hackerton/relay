/* Light Markdown for document paragraphs. A section is a list of paragraphs (one string each), so block syntax is per
   paragraph: "- item", "1. item", "> quote", "```code```", "| table |", "### heading". Inline: **bold**, *italic*,
   `code`, ~~strike~~, [link](https://…). Everything is escaped first; only http(s)/mailto links are made. */
(() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function inline(text) {
    const codes = [];
    let h = esc(text).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    h = h
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt) => `<span class="md-img">${alt || 'image'}</span>`)
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
    return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  /* one paragraph → { cls, html, style } for a <p>; plain text keeps the prototype's "Label: text" look */
  function block(text) {
    const t = String(text);
    let m;
    if (/^```chart\b/.test(t)) return { cls: 'md-chart', html: chart(t) };
    if (/^```/.test(t)) return { cls: 'md-code', html: `<code>${esc(t.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, ''))}</code>` };
    if (/^\|.*\|\s*(\n\|.*\|\s*)*$/.test(t)) return { cls: 'md-table', html: table(t) };
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) return { cls: `md-h md-h${Math.min(6, m[1].length + 2)}`, html: inline(m[2]) };
    if ((m = t.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/s))) return { cls: 'md-li md-task', style: depth(m[1]), html: `<span class="md-box" aria-hidden="true">${m[2].trim() ? '✓' : ''}</span>${inline(m[3])}` };
    if ((m = t.match(/^(\s*)[-*+]\s+(.*)$/s))) return { cls: 'md-li', style: depth(m[1]), html: inline(m[2]) };
    if ((m = t.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/s))) return { cls: 'md-ol', style: depth(m[1]), html: `<span class="md-n">${m[2]}.</span>${inline(m[3])}` };
    if ((m = t.match(/^>\s?(.*)$/s))) return { cls: 'md-quote', html: inline(m[1]) };
    if ((m = t.match(/^([^:*`[\]#|>]{2,24}):\s(.*)$/))) return { cls: '', html: `<span class="lbl">${inline(m[1])}:</span> ${inline(m[2])}` };
    return { cls: '', html: inline(t) };
  }
  const depth = (ws) => { const n = Math.min(4, Math.floor(ws.replace(/\t/g, '  ').length / 2)); return n ? `--md-depth:${n}` : ''; };
  /* tables stay inside the paragraph (sections address paragraphs by index), drawn as a grid of spans */
  function table(t) {
    const rows = t.split('\n').map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const cols = Math.max(...body.map((r) => r.length));
    return `<span class="md-grid" style="--cols:${cols}">${body.map((r, i) => Array.from({ length: cols }, (_, j) => `<span class="${i === 0 ? 'th' : ''}">${inline(r[j] || '')}</span>`).join('')).join('')}</span>`;
  }
  /* ```chart … ```: an optional "title: …" line, then "Label | value" rows → horizontal bars (values keep their unit) */
  function chart(t) {
    const lines = t.replace(/^```chart[^\n]*\n?/, '').replace(/\n?```\s*$/, '').split('\n').map((l) => l.trim()).filter(Boolean);
    let title = '';
    const rows = [];
    for (const l of lines) {
      const m = l.match(/^title:\s*(.+)$/i); if (m) { title = m[1]; continue; }
      const [label, raw = ''] = l.split('|').map((x) => x.trim());
      const num = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
      if (label && Number.isFinite(num)) rows.push({ label, raw, num });
    }
    const max = Math.max(...rows.map((r) => r.num), 0) || 1;
    return `${title ? `<span class="ch-t">${inline(title)}</span>` : ''}<span class="ch-rows">${rows.map((r) =>
      `<span class="ch-l">${inline(r.label)}</span><span class="ch-bar"><i style="width:${Math.max(2, (r.num / max) * 100).toFixed(1)}%"></i></span><span class="ch-v">${esc(r.raw)}</span>`).join('')}</span>`;
  }

  /* plain text of a paragraph, for places that cannot show markup */
  const plain = (text) => String(text).replace(/^```[^\n]*\n?|\n?```\s*$/g, '').replace(/^(\s*[-*+]\s+(\[[ xX]\]\s+)?|\s*\d{1,3}[.)]\s+|>\s?|#{1,6}\s+)/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|~~|`/g, '');

  window.RelayMarkdown = { esc, inline, block, plain };
})();
