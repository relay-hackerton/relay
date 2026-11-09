/* Extract text locally. Uploaded files stay in the browser. */
const MAX_TEXT = 30000;
const MAX_FILE = 10 * 1024 * 1024;
const PDF_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/';

async function readDocx(bytes) {
  const { unzipSync, strFromU8 } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js');
  let tooLarge = false;
  const files = unzipSync(bytes, { filter(entry) {
    if (entry.name !== 'word/document.xml') return false;
    tooLarge = entry.originalSize > MAX_FILE;
    return !tooLarge;
  } });
  if (tooLarge) throw new Error('import_file_large');
  if (!files['word/document.xml']) throw new Error('invalid_document');
  const xml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('invalid_document');
  const ns = xml.documentElement.namespaceURI;
  const paragraphs = Array.from(xml.getElementsByTagNameNS(ns, 'p'));
  return paragraphs.map((p) => {
    const text = Array.from(p.getElementsByTagNameNS(ns, 't'), (n) => n.textContent).join('');
    const style = p.getElementsByTagNameNS(ns, 'pStyle')[0]?.getAttributeNS(ns, 'val');
    const heading = /^Heading([1-6])$/i.exec(style || '');
    return heading && text.trim() ? '#'.repeat(Number(heading[1])) + ' ' + text : text;
  }).join('\n\n');
}

async function readPdf(data) {
  const pdfjs = await import(PDF_CDN + 'legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_CDN + 'legacy/build/pdf.worker.mjs';
  const task = pdfjs.getDocument({
    data, cMapUrl: PDF_CDN + 'cmaps/', standardFontDataUrl: PDF_CDN + 'standard_fonts/',
    wasmUrl: PDF_CDN + 'wasm/', isEvalSupported: false,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error('import_pdf_pages');
    const pages = [];
    let size = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent();
      const text = items.filter((item) => 'str' in item).map((item) => item.str + (item.hasEOL ? '\n' : '')).join('').trim();
      if (!text) continue;
      size += text.length + 1;
      if (size > MAX_TEXT) throw new Error('document_too_large');
      pages.push(text);
    }
    if (!pages.length) throw new Error('import_pdf_no_text');
    return pages.join('\f');
  } catch (e) {
    if (e.name === 'PasswordException') throw new Error('import_pdf_locked');
    throw e;
  } finally {
    await task.destroy();
  }
}

export async function readDocument(file) {
  const ext = file?.name.split('.').at(-1).toLowerCase();
  if (!['md', 'txt', 'docx', 'pdf'].includes(ext)) throw new Error('invalid_document');
  if (file.size > MAX_FILE) throw new Error('import_file_large');
  let text;
  try {
    if (ext === 'docx') text = await readDocx(new Uint8Array(await file.arrayBuffer()));
    else if (ext === 'pdf') text = await readPdf(new Uint8Array(await file.arrayBuffer()));
    else text = await file.text();
  } catch (e) {
    if (e.message.startsWith('import_') || e.message === 'document_too_large') throw e;
    if (e instanceof TypeError) throw new Error('import_unavailable');
    throw new Error('invalid_document');
  }
  text = text.trim();
  if (!text) throw new Error('invalid_document');
  if (text.length > MAX_TEXT) throw new Error('document_too_large');
  return { text, markdown: ext === 'md' || ext === 'docx' };
}
