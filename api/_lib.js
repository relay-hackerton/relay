/* Shared server helpers: Supabase REST (service role), responses, ids, the agent lock. No npm dependencies. */
import { randomUUID, randomBytes } from 'node:crypto';

const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function rest(path, { method = 'GET', body, prefer } = {}) {
  if (!SB_URL() || !SB_KEY()) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  const r = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY(), ...(SB_KEY().startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY()}` } : {}), 'Content-Type': 'application/json',   // new sb_secret_ keys go in apikey only
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${method} ${path.split('?')[0]} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const eq = (v) => `eq.${encodeURIComponent(v)}`;
export const db = {
  select: (table, query) => rest(`${table}?${query}`),
  insert: (table, rows) => rest(table, { method: 'POST', body: rows, prefer: 'return=representation' }),
  update: (table, query, patch) => rest(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }),
  rpc: (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: args }),
  eq,
};

export const uuid = () => randomUUID();
export const shortId = (n = 6) => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(n), (b) => abc[b % abc.length]).join('');
};
export const newId = (prefix) => `${prefix}_${shortId(10)}`;

export const LIMIT = () => Number(process.env.ROOM_CALL_LIMIT || 30);
export const MAX_TEXT = 500;

export function hhmm(d) {
  return new Date(d).toLocaleTimeString('en-GB', { timeZone: process.env.DISPLAY_TZ || 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
/* wraps fn(body) → result; a result may be { status, body } to set the HTTP status */
export function handler(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try { const body = await readBody(req); const out = await fn(body, req); send(res, (out && out.status) || 200, (out && out.body) || out); }
    catch (e) { console.error(e); send(res, 500, { error: String(e.message || e) }); }
  };
}

/* ---------- the agent lock (rooms.agent) ---------- */
export async function acquire(roomId, byId, byName, d = db) {
  const token = shortId(12);
  const calls = await d.rpc('acquire_agent', { p_room: roomId, p_by_id: byId, p_by_name: byName, p_token: token });
  return calls < 0 ? null : { token, calls };
}
export async function release(roomId, token, d = db) {
  try { await d.rpc('release_agent', { p_room: roomId, p_token: token }); } catch (e) { console.error('release failed', e); }
}
export async function setAgentSection(roomId, lock, byId, byName, sectionId, d = db) {
  try {
    await d.update('rooms', `id=${eq(roomId)}`, { agent: { state: 'working', by_id: byId, by_name: byName, section_id: sectionId, since: new Date().toISOString(), token: lock.token } });
  } catch (e) { console.error(e); }
}

export const hasHangul = (s) => /[ᄀ-ᇿ㄰-㆏가-힯]/.test(String(s || ''));
export const L = (lang, en, ko) => (lang === 'ko' ? ko : en);
