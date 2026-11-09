/* Local server: static files + /api/* with the same handlers Vercel runs.
   node dev-server.mjs          → real Supabase + Anthropic from .env.local
   MOCK=1 node dev-server.mjs   → in-memory DB, scripted Claude, fake realtime: the whole flow with no keys */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MOCK = process.env.MOCK === '1';
for (const f of ['.env.local', '.env']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

let mock = null;
if (MOCK) {
  process.env.SUPABASE_URL ||= 'http://mock'; process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
  const { mockDb } = await import('./scripts/mockdb.mjs');
  const { fakeClaude } = await import('./scripts/fake-claude.mjs');
  const lib = await import('./api/_lib.js');
  const m = mockDb(); const clients = new Map(); const presence = new Map();
  const push = (room, ev) => (clients.get(room) || new Set()).forEach((res) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
  const roomOf = (table, row) => (table === 'rooms' ? row.id : row.room_id);
  const wrap = (fn, kind) => async (table, ...a) => { const rows = await fn(table, ...a); (rows || []).forEach((row) => push(roomOf(table, row), { table, eventType: kind, row })); return rows; };
  const raw = { ...m.db };
  const rpc = async (fn, a) => { const out = await raw.rpc(fn, a); const room = m.T.rooms.find((r) => r.id === a.p_room); if (room) push(room.id, { table: 'rooms', eventType: 'UPDATE', row: room }); return out; };
  Object.assign(lib.db, { ...raw, insert: wrap(raw.insert, 'INSERT'), update: wrap(raw.update, 'UPDATE'), rpc });
  // Claude: route the real pipeline's call to the scripted fake
  globalThis.__RELAY_FAKE_CLAUDE = fakeClaude;
  mock = { m, clients, presence, push, raw, lib, fakeClaude };
}

async function body(req) { const c = []; for await (const x of req) c.push(x); try { return JSON.parse(Buffer.concat(c).toString() || '{}'); } catch { return {}; } }
const json = (res, obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function mockRoute(req, res, url) {
  const { m, clients, presence, push, lib } = mock;
  if (url.pathname === '/mock/events') {
    const room = url.searchParams.get('room');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write(': ok\n\n');
    if (!clients.has(room)) clients.set(room, new Set()); clients.get(room).add(res);
    res.write(`data: ${JSON.stringify({ presence: Object.fromEntries(presence.get(room) || []) })}\n\n`);
    req.on('close', () => { clients.get(room).delete(res); const p = presence.get(room); if (p && res.__key) { p.delete(res.__key); push(room, { presence: Object.fromEntries(p) }); } });
    return;
  }
  const b = await body(req);
  if (url.pathname === '/mock/query') {
    let rows = m.T[b.table].filter((r) => b.filters.every(([k, v]) => String(r[k]) === String(v)));
    if (b.order) { const [c, d] = b.order; rows = [...rows].sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (d === 'desc' ? -1 : 1)); }
    if (b.limit) rows = rows.slice(0, b.limit);
    return json(res, { data: b.single ? rows[0] || null : rows, error: null });
  }
  if (url.pathname === '/mock/delete') {
    const gone = m.T[b.table].filter((r) => b.filters.every(([k, v]) => String(r[k]) === String(v)));
    m.T[b.table] = m.T[b.table].filter((r) => !gone.includes(r));
    gone.forEach((row) => push(row.room_id, { table: b.table, eventType: 'DELETE', row }));
    return json(res, { data: null, error: null });
  }
  if (url.pathname === '/mock/insert') { const rows = await lib.db.insert(b.table, b.rows); return json(res, { data: rows, error: null }); }
  if (url.pathname === '/mock/upsert') {
    const keys = (b.onConflict || 'id').split(',');
    for (const row of b.rows) {
      const ex = m.T[b.table].find((r) => keys.every((k) => r[k] === row[k]));
      if (ex) await lib.db.update(b.table, keys.map((k) => `${k}=eq.${encodeURIComponent(row[k])}`).join('&'), row); else await lib.db.insert(b.table, [row]);
    }
    return json(res, { data: null, error: null });
  }
  if (url.pathname === '/mock/presence') {
    if (!presence.has(b.room)) presence.set(b.room, new Map());
    presence.get(b.room).set(b.key, [b.state]);
    (clients.get(b.room) || new Set()).forEach((r) => { if (!r.__key) r.__key = b.key; });
    push(b.room, { presence: Object.fromEntries(presence.get(b.room)) });
    return json(res, { ok: true });
  }
  json(res, { error: 'unknown mock route' }, 404);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (MOCK && url.pathname.startsWith('/mock/')) return await mockRoute(req, res, url);
    if (MOCK && url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end(`${fs.readFileSync(path.join(ROOT, 'scripts/mock-supabase.js'), 'utf8')}\nwindow.RELAY_CONFIG = { supabaseUrl: 'mock', supabaseAnonKey: 'mock', mock: true };`);
    }
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      const file = path.join(ROOT, 'api', `${api[1]}.js`);
      if (!fs.existsSync(file)) return json(res, { error: 'not found' }, 404);
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || /^\/r\/[a-z0-9]+\/?$/i.test(p)) p = '/index.html';
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); json(res, { error: String(e.message) }, 500); }
}).listen(PORT, () => console.log(`Relay dev server on http://localhost:${PORT}${MOCK ? ' (MOCK: no keys needed)' : ''}`));
