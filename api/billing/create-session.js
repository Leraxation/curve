import fetch from 'node-fetch';
import { parseCookies, verifySession } from '../_lib/auth.mjs';

export default async function handler(req, res) {
  const cookies = parseCookies(req);
  const secret = process.env.SESSION_SECRET || (process.env.ADMIN_PASSWORD || 'secret');
  const sess = verifySession(cookies.sid, secret);
  if (!sess) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(500).json({ error: 'billing_not_configured' });
  }
  try {
    const BASE = process.env.BASE_URL || 'http://localhost:3000';
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', `${BASE}/index.html?upgrade=success`);
    params.append('cancel_url', `${BASE}/index.html?upgrade=cancel`);
    params.append('line_items[0][price]', process.env.STRIPE_PRICE_ID);
    params.append('line_items[0][quantity]', '1');
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'stripe_error', detail: j });
    res.json({ url: j.url });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}

