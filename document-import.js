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
  const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
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
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const pageText = items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      if (pageText) text += (text ? '\n\n' : '') + pageText;
      page.cleanup();
      if (text.length > MAX_TEXT_CHARS) return text;
    }
    return text;
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
  return { text, markdown: extension === 'md' };
}
