import { signSession, COOKIE } from '../_lib/auth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const { username, password } = body || {};
    const u = process.env.ADMIN_USER || 'admin';
    const p = process.env.ADMIN_PASSWORD || '';
    if (String(username || '') !== String(u) || String(password || '') !== String(p)) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    const secret = process.env.SESSION_SECRET || (process.env.ADMIN_PASSWORD || 'secret');
    const token = signSession({ user: u, plan: 'free', exp }, secret);
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12*60*60}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}

