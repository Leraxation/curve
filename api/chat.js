import fetch from 'node-fetch';
import { parseCookies, verifySession } from './_lib/auth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const cookies = parseCookies(req);
  const secret = process.env.SESSION_SECRET || (process.env.ADMIN_PASSWORD || 'secret');
  const sess = verifySession(cookies.sid, secret);
  if (!sess) return res.status(401).json({ error: 'unauthorized' });
  if (sess.plan !== 'pro') return res.status(402).json({ error: 'payment_required' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const question = body.question || 'Summarize the distribution.';
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
    const summary = JSON.stringify({
      counts: body.columns ? undefined : undefined,
      sample: rows.slice(0, 20)
    });
    const sys = 'You are an HR analytics assistant. Provide concise insights about rating distributions. Use bullet points.';
    const user = `Question: ${question}\nSample rows (truncated): ${summary}`;
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.3, max_tokens: 500 })
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      return res.status(502).json({ error: 'openai_error', detail: txt });
    }
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || 'No content';
    res.json({ answer: content });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
}

