import { parseCookies, verifySession } from '../_lib/auth.mjs';

export default async function handler(req, res) {
  const cookies = parseCookies(req);
  const token = cookies.sid;
  const secret = process.env.SESSION_SECRET || (process.env.ADMIN_PASSWORD || 'secret');
  const sess = verifySession(token, secret);
  res.json({ authenticated: !!sess, plan: (sess && sess.plan) || 'free' });
}

