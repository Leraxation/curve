import { parseCookies, verifySession, signSession, COOKIE } from '../_lib/auth.mjs';

export default async function handler(req, res) {
  const cookies = parseCookies(req);
  const secret = process.env.SESSION_SECRET || (process.env.ADMIN_PASSWORD || 'secret');
  const sess = verifySession(cookies.sid, secret);
  if (!sess) return res.status(401).json({ error: 'unauthorized' });
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const token = signSession({ user: sess.user, plan: 'pro', exp }, secret);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12*60*60}`);
  res.json({ plan: 'pro' });
}

