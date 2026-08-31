import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const COOKIE_NAME = 'vs_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET must be set to a long random string in your environment.');
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function issueToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${expires}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [role, expires, signature] = parts;
  const payload = `${role}.${expires}`;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  if (Date.now() > Number(expires)) return false;
  return role === 'admin';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function setSessionCookie(res) {
  const token = issueToken();
  const isProd = process.env.NODE_ENV === 'production';
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isProd) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

export function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}

export function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated.' });
  next();
}

export async function checkPassword(candidate) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) throw new Error('ADMIN_PASSWORD_HASH is not configured.');
  return bcrypt.compare(String(candidate || ''), hash);
}

// --- simple in-memory login rate limiter (per IP) ---
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && now < record.lockedUntil) {
    const waitMin = Math.ceil((record.lockedUntil - now) / 60000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${waitMin} minute(s).` });
  }
  next();
}

export function recordLoginFailure(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, lockedUntil: 0, windowStart: now };
  if (now - record.windowStart > WINDOW_MS) { record.count = 0; record.windowStart = now; }
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) record.lockedUntil = now + WINDOW_MS;
  attempts.set(ip, record);
}

export function recordLoginSuccess(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  attempts.delete(ip);
}
