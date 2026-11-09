/* Turning an uploaded file into sections. A section is a title plus a list of paragraphs (strings), so Markdown blocks
   become one paragraph each: list items "- x" / "1. x", quotes "> x", code "```…```", tables "| a | b |" and
   sub-headings "### x" keep their Markdown and are drawn by markdown.js. Plain text (.txt, .pdf) is split on blank
   lines, or on every line when it has none. */

const PARA_MAX = 600;
const CODE_MAX = 1800;
const TITLE_MAX = 120;

function splitLong(p) {
  if (p.length <= PARA_MAX) return [p];
  const head = p.match(/^(\s*(?:[-*+]|\d{1,3}[.)])\s+|>\s?)/)?.[0] || '';
  const parts = p.slice(head.length).match(/[\s\S]{1,580}(?:\s|$)|[\s\S]{1,580}/gu) || [];
  return parts.map((s, i) => (i === 0 ? head : head.startsWith('>') ? '> ' : '') + s.trim()).filter((s) => s.trim());
}
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/* Markdown → [{ heading: level, text } | { para }] */
export function markdownBlocks(text) {
  let lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
  if (lines[0]?.trim() === '---') { const end = lines.slice(1, 60).findIndex((l) => /^(---|\.\.\.)\s*$/.test(l)); if (end >= 0) lines = lines.slice(end + 2); }
  const out = []; let buf = null;   // buf: { kind: 'p' | 'li' | 'quote', text }
  const flush = () => { if (buf && clean(buf.text)) out.push({ para: buf.kind === 'quote' ? `> ${clean(buf.text)}` : buf.kind === 'li' ? buf.prefix + clean(buf.text) : clean(buf.text) }); buf = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; let m;
    if ((m = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/))) {   // fenced code
      flush(); const fence = m[1][0]; const body = [];
      for (i++; i < lines.length && !new RegExp(`^\\s*${fence === '`' ? '```' : '~~~'}`).test(lines[i]); i++) body.push(lines[i]);
      const code = body.join('\n').replace(/\s+$/, '');
      if (code) out.push({ para: `\`\`\`${m[2] || ''}\n${code.slice(0, CODE_MAX)}\n\`\`\`` });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*<!--/.test(line)) { while (i < lines.length && !lines[i].includes('-->')) i++; continue; }
    if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); if (m[2]) out.push({ heading: m[1].length, text: m[2] }); continue; }
    if (!buf && line.trim() && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1] || '') && !/^\s*[-*+]\s/.test(line)) { out.push({ heading: lines[i + 1].includes('=') ? 1 : 2, text: line.trim() }); i++; continue; }   // setext
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); continue; }   // horizontal rule
    if (/^\s*\|/.test(line)) {   // table: consecutive "|" rows
      flush(); const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(lines[i].trim());
      i--; out.push({ para: rows.join('\n').slice(0, CODE_MAX) }); continue;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/))) {
      flush(); const level = Math.min(4, Math.floor(m[1].length / 2));
      const marker = /\d/.test(m[2]) ? `${parseInt(m[2], 10)}. ` : '- ';
      buf = { kind: 'li', prefix: '  '.repeat(level) + marker, text: m[3] }; continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { if (!buf || buf.kind !== 'quote') { flush(); buf = { kind: 'quote', text: '' }; } buf.text += ' ' + m[1]; continue; }
    if (buf && buf.kind === 'quote') flush();
    if (!buf) buf = { kind: 'p', text: '' };
    buf.text += ' ' + line.replace(/ {2,}$/, '');   // a wrapped line (or a list item's continuation) joins the paragraph
  }
  flush();
  return out;
}

/* blocks → sections. Section breaks use the highest heading level that repeats; a single title heading above them is
   not a section of its own, and deeper headings stay inside the section as "### …" paragraphs. */
export function sectionsFromBlocks(blocks, docTitle) {
  const levels = blocks.filter((b) => b.heading).map((b) => b.heading);
  let level = levels.length ? Math.min(...levels) : 0;
  if (level && levels.filter((l) => l === level).length === 1 && levels.some((l) => l > level)) level = Math.min(...levels.filter((l) => l > level));
  const sections = []; let cur = { title: docTitle, paras: [] };
  const push = () => { if (cur.paras.length) sections.push(cur); };
  for (const b of blocks) {
    if (b.heading && b.heading <= level) { push(); cur = { title: b.text.slice(0, TITLE_MAX), paras: [] }; continue; }
    if (b.heading) { cur.paras.push(`${'#'.repeat(Math.min(6, b.heading))} ${b.text}`); continue; }
    cur.paras.push(...splitLong(b.para));
  }
  push();
  return sections;
}

/* plain text: blank lines separate paragraphs (wrapped lines are joined); with no blank lines every line is one */
export function plainBlocks(text) {
  const t = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const bullet = (s) => s.replace(/^\s*[•·▪◦‣∙●○■□–]\s+/, '- ');
  const chunks = /\n[ \t]*\n/.test(t) ? t.split(/\n[ \t]*\n/) : t.split('\n');
  const out = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    let para = ''; let last = '';
    const wrapAt = Math.max(...lines.map((l) => l.length), 0) * 0.6;   // a line this long without a full stop was wrapped
    for (const l of lines) {
      if (/^([•·▪◦‣∙●○■□–-]|\d{1,3}[.)])\s+/.test(l)) { if (para) out.push({ para }); para = bullet(l); }   // list items stay their own paragraph
      else if (para && (last.length < wrapAt || /[.!?。:;]["')\]]?$/.test(last))) { out.push({ para: clean(para) }); para = l; }   // after a short or finished line, a new paragraph
      else para = para ? `${para} ${l}` : l;
      last = l;
    }
    if (para) out.push({ para: clean(para) });
  }
  return out;
}

export function importSections({ text, markdown, title = 'Document' }) {
  const blocks = markdown ? markdownBlocks(text) : plainBlocks(text);
  return sectionsFromBlocks(blocks, title).map((s, i) => ({ id: `import-${i + 1}`, num: i + 1, title: s.title, paras: s.paras }));
}
