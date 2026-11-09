import { createHmac, timingSafeEqual } from 'node:crypto';
import { handler } from './_lib.js';
import { runProfile } from './_profile.js';

const COOKIE = 'relay_session';
const LIFETIME = 365 * 24 * 60 * 60;

function sign(value) {
  const secret = process.env.RELAY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Relay session signing key is missing');
  return createHmac('sha256', secret).update('relay-profile:' + value).digest('base64url');
}

export function setSession(req, res, userId) {
  const value = `${userId}.${Math.floor(Date.now() / 1000) + LIFETIME}`;
  const secure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}.${sign(value)}; Path=/; Max-Age=${LIFETIME}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
}

export function sessionUser(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(COOKIE + '='));
  const match = /^((u_[a-z0-9]{6,20})\.(\d{10,12}))\.([A-Za-z0-9_-]{43})$/.exec(cookie?.slice(COOKIE.length + 1) || '');
  if (!match || Number(match[3]) <= Date.now() / 1000) return null;
  return timingSafeEqual(Buffer.from(match[4]), Buffer.from(sign(match[1]))) ? match[2] : null;
}

export const sessionRequired = { status: 401, body: { error: 'session_required' } };

export function withProfile(fn) {
  return handler(async (body, req) => {
    const userId = sessionUser(req);
    if (!userId) return sessionRequired;
    const profile = await runProfile({ userId });
    if (!profile.ok) return sessionRequired;
    return fn({ ...body, userId: profile.userId, userName: profile.name });
  });
}
