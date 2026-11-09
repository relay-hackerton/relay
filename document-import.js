const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 30000;
const SUPPORTED = new Set(['md', 'txt', 'docx', 'pdf']);
const PDFJS = 'https://unpkg.com/pdfjs-dist@6.5.438';

async function readWord(file) {
  if (!window.mammoth) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/mammoth@1.13.0/mammoth.browser.min.js';
      script.integrity = 'sha384-8NWE3bZDrmRI4IePMoQaEoLhAQ1MmRMJkdNgnGiHRFanTqsFKr0TmK6aSZvFJ/PO';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('Could not load Word reader')); };
      document.head.append(script);
    });
  }
  /* Word → HTML (keeps headings, lists, bold, links, tables) → Markdown, so sections follow the Word headings */
  const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToMarkdown(value);
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const inline = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const inner = inline(n); const tag = n.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') return inner.trim() ? `**${inner.trim()}**` : '';
    if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : '';
    if (tag === 'a') { const href = n.getAttribute('href') || ''; return /^(https?:|mailto:)/.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner; }
    if (tag === 'br') return ' ';
    if (tag === 'img') return '';
    return inner;
  }).join('');
  const out = [];
  const list = (el, depth) => {
    let n = 1;
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
      const clone = li.cloneNode(true); clone.querySelectorAll('ul,ol').forEach((x) => x.remove());
      const text = inline(clone).trim();
      if (text) out.push(`${'  '.repeat(depth)}${el.tagName === 'OL' ? `${n++}.` : '-'} ${text}`, '');
      nested.forEach((x) => list(x, Math.min(depth + 1, 4)));
    }
  };
  for (const el of doc.body.children) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { const t = inline(el).trim(); if (t) out.push(`${'#'.repeat(Number(tag[1]))} ${t}`, ''); }
    else if (tag === 'ul' || tag === 'ol') list(el, 0);
    else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => `| ${[...tr.children].map((c) => inline(c).trim().replace(/\|/g, '/')).join(' | ')} |`);
      if (rows.length) { const cols = (rows[0].match(/\|/g) || []).length - 1; out.push(rows[0], `|${' --- |'.repeat(Math.max(1, cols))}`, ...rows.slice(1), ''); }
    } else if (tag === 'blockquote') { const t = inline(el).trim(); if (t) out.push(`> ${t}`, ''); }
    else { const t = inline(el).trim(); if (t) out.push(t, ''); }
  }
  return out.join('\n');
}

/* PDF text comes line by line: lines are joined into paragraphs, and a paragraph ends at a sentence end, a short
   line, a gap, or a bullet; the result has blank lines between paragraphs */
function pdfParagraphs(lines) {
  const lens = lines.map((l) => l.text.length).filter((n) => n > 0).sort((a, b) => a - b);
  const typical = lens[Math.floor(lens.length * 0.75)] || 80;
  const out = []; let cur = '';
  lines.forEach((l, i) => {
    const t = l.text.trim();
    if (!t) { if (cur) { out.push(cur); cur = ''; } return; }
    if (/^([•·▪◦‣∙●○■□–-]|\d{1,3}[.)])\s+/.test(t) && cur) { out.push(cur); cur = ''; }
    cur = cur ? `${cur.endsWith('-') ? cur.slice(0, -1) : cur + ' '}${t}` : t;
    const next = lines[i + 1];
    const ends = /[.!?。:;]["')\]]?$/.test(t) && t.length < typical * 0.92;
    if (ends || t.length < typical * 0.6 || l.gapAfter) { out.push(cur); cur = ''; }
    if (!next) { if (cur) out.push(cur); cur = ''; }
  });
  return out.join('\n\n');
}

async function readPdf(file) {
  const { getDocument, GlobalWorkerOptions } = await import(`${PDFJS}/legacy/build/pdf.min.mjs`);
  GlobalWorkerOptions.workerSrc = `${PDFJS}/legacy/build/pdf.worker.min.mjs`;
  const loading = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${PDFJS}/standard_fonts/`, wasmUrl: `${PDFJS}/wasm/`,
  });
  try {
    const pdf = await loading.promise;
    const lines = []; let size = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      let cur = { text: '', y: null, h: 0 };
      for (const item of items) {
        if (!('str' in item)) continue;
        const y = item.transform[5]; const h = Math.abs(item.transform[3]) || item.height || 10;
        if (cur.y !== null && Math.abs(y - cur.y) > h * 0.5 && cur.text.trim()) {   // a new line
          const gap = cur.y - y > Math.max(cur.h, h) * 1.8;
          lines.push({ text: cur.text.replace(/\s+/g, ' '), gapAfter: gap }); cur = { text: '', y: null, h: 0 };
        }
        cur.text += item.str + ' '; cur.y = y; cur.h = h;
        if (item.hasEOL && cur.text.trim()) { lines.push({ text: cur.text.replace(/\s+/g, ' '), gapAfter: false }); cur = { text: '', y: null, h: 0 }; }
      }
      if (cur.text.trim()) lines.push({ text: cur.text.replace(/\s+/g, ' '), gapAfter: true });
      lines.push({ text: '', gapAfter: true });   // page break ends a paragraph
      page.cleanup();
      size = lines.reduce((n, l) => n + l.text.length, 0);
      if (size > MAX_TEXT_CHARS) break;
    }
    return pdfParagraphs(lines);
  } finally {
    await loading.destroy();
  }
}

export async function readDocument(file) {
  const extension = /\.([a-z]+)$/i.exec(file?.name || '')?.[1].toLowerCase();
  if (!SUPPORTED.has(extension)) throw new Error('import_invalid');
  if (file.size > MAX_FILE_BYTES) throw new Error('import_file_large');
  let text;
  try {
    if (extension === 'docx') text = await readWord(file);
    else if (extension === 'pdf') text = await readPdf(file);
    else text = await file.text();
  } catch (e) {
    throw new Error('import_unreadable', { cause: e });
  }
  text = text.trim();
  if (!text) throw new Error('import_no_text');
  if (text.length > MAX_TEXT_CHARS) throw new Error('import_large');
  return { text, markdown: extension === 'md' || extension === 'docx' };
}
