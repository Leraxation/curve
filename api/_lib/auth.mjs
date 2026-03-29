import crypto from 'crypto';

const COOKIE_NAME = 'sid';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}
function hmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function signSession({ user, plan = 'free', exp }, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { u: user, plan, exp };
  const base = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = hmac(base, secret);
  return `${base}.${sig}`;
}

export function verifySession(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const base = `${h}.${p}`;
    const expect = hmac(base, secret);
    if (expect !== s) return null;
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return { user: payload.u, plan: payload.plan || 'free', exp: payload.exp };
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const hdr = req.headers['cookie'] || '';
  const out = {};
  hdr.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) {
      const k = p.slice(0, i).trim();
      const v = p.slice(i + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export const COOKIE = COOKIE_NAME;

