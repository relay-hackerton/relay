/* Export the shared document as it is now: Markdown, standalone HTML, PDF (print), JSON with the full change history. Browser only. */
window.RelayExport = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

  function toMarkdown({ title, lede, sections }) {
    const out = [`# ${title}`, '', lede ? `_${lede}_` : '', ''];
    sections.forEach((s) => {
      out.push(`## ${s.num}. ${s.title}`, '');
      s.paras.forEach((p, i) => out.push(s.steps ? `${i + 1}. ${p}` : p, ''));
      if (s.footnote) out.push(`> ${s.footnote}`, '');
    });
    out.push('---', `Exported from Relay · ${new Date().toISOString()}`);
    return out.join('\n');
  }

  function toHtml({ title, lede, sections }) {
    const body = sections.map((s) => `<section><h2><span>${s.num}</span>${esc(s.title)}</h2>${s.steps ? `<ol>${s.paras.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : s.paras.map((p) => {
      const m = p.match(/^([^:]{2,24}):\s(.*)$/); return `<p>${m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(p)}</p>`;
    }).join('')}${s.footnote ? `<p class="fn">${esc(s.footnote)}</p>` : ''}</section>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Pretendard,sans-serif;color:#1B2130;max-width:760px;margin:48px auto;padding:0 20px}h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}.lede{color:#5A6478;margin:0 0 28px}h2{font-size:18px;margin:28px 0 8px}h2 span{color:#8F98AB;font-weight:500;margin-right:8px}p{margin:0 0 8px}.fn{color:#8F98AB;font-size:13px}footer{margin-top:40px;padding-top:12px;border-top:1px solid #e6e8ee;color:#8F98AB;font-size:12px}@media print{body{margin:0 auto}}</style></head>
<body><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${body}<footer>Exported from Relay · ${esc(new Date().toLocaleString())}</footer></body></html>`;
  }

  function toJson({ title, lede, sections, changes, discussions, roomId }) {
    return JSON.stringify({ title, lede, roomId, exportedAt: new Date().toISOString(),
      sections: sections.map((s) => ({ id: s.id, num: s.num, title: s.title, paras: s.paras, footnote: s.footnote || null })),
      changes: changes.map((c) => ({ id: c.id, section: c.sectionId, kind: c.kind, by: c.byName, at: c.at, summary: c.summary, why: c.why, before: c.prev, after: c.next })),
      discussions: (discussions || []).map((d) => ({ n: d.n, title: d.title, section: d.section_id, status: d.status, result: d.result, options: (d.options || []).map((o) => ({ id: o.id, label: o.label, text: o.text })) })) }, null, 2);
  }

  /* Word: the docx library is loaded only when someone asks for a .docx */
  const DOCX_SRC = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
  function loadDocx() {
    if (window.docx) return Promise.resolve(window.docx);
    return new Promise((resolve, reject) => {
      const el = document.createElement('script'); el.src = DOCX_SRC; el.async = true;
      el.onload = () => (window.docx ? resolve(window.docx) : reject(new Error('docx library missing')));
      el.onerror = () => reject(new Error('could not load the Word exporter'));
      document.head.appendChild(el);
    });
  }
  async function toDocx({ title, lede, sections }) {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await loadDocx();
    const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
    if (lede) children.push(new Paragraph({ children: [new TextRun({ text: lede, italics: true })], spacing: { after: 240 } }));
    sections.forEach((s) => {
      children.push(new Paragraph({ text: `${s.num}. ${s.title}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }));
      s.paras.forEach((p, i) => {
        const m = p.match(/^([^:]{2,24}):\s(.*)$/);
        const runs = m ? [new TextRun({ text: `${m[1]}: `, bold: true }), new TextRun(m[2])] : [new TextRun(s.steps ? `${i + 1}. ${p}` : p)];
        children.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
      });
      if (s.footnote) children.push(new Paragraph({ children: [new TextRun({ text: s.footnote, italics: true, size: 18, color: '8F98AB' })] }));
    });
    children.push(new Paragraph({ children: [new TextRun({ text: `Exported from Relay · ${new Date().toLocaleString()}`, size: 16, color: '8F98AB' })], spacing: { before: 480 } }));
    return Packer.toBlob(new Document({ creator: 'Relay', title, sections: [{ children }] }));
  }

  function save(name, type, text) {
    const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function download(format, data) {
    const base = `relay-${data.roomId || 'doc'}-${stamp()}`;
    if (format === 'md') return save(`${base}.md`, 'text/markdown;charset=utf-8', toMarkdown(data));
    if (format === 'html') return save(`${base}.html`, 'text/html;charset=utf-8', toHtml(data));
    if (format === 'json') return save(`${base}.json`, 'application/json', toJson(data));
    if (format === 'docx') return toDocx(data).then((blob) => save(`${base}.docx`, blob.type, blob));
    if (format === 'pdf') {
      const w = window.open('', '_blank'); if (!w) return false;
      w.document.open(); w.document.write(toHtml(data)); w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 300);
      return true;
    }
    throw new Error(`unknown format ${format}`);
  }

  return { download, toMarkdown, toHtml, toJson, toDocx, FORMATS: ['md', 'html', 'pdf', 'docx', 'json'] };
})();
