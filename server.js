import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8001;
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

let RUNTIME_KEY = process.env.OPENAI_API_KEY || null;
const getKey = () => RUNTIME_KEY || process.env.OPENAI_API_KEY || null;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const QUOTA_USER_DAILY = parseInt(process.env.QUOTA_USER_DAILY || '200');
const QUOTA_DEPT_DAILY = parseInt(process.env.QUOTA_DEPT_DAILY || '2000');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const BASE_URL = process.env.BASE_URL || '';
const usageUser = new Map();
const usageDept = new Map();
function todayKey() { return new Date().toISOString().slice(0,10); }
function getUserId(req) {
  const hdr = req.headers['x-user-id'];
  if (typeof hdr === 'string' && hdr.trim()) return hdr.trim().slice(0,64);
  const xf = req.headers['x-forwarded-for'];
  const ip = Array.isArray(xf) ? xf[0] : (typeof xf === 'string' ? xf.split(',')[0] : (req.ip || 'anon'));
  return String(ip || 'anon');
}
function getDeptFromBody(body) {
  const scopeDept = body?.scope?.department;
  if (scopeDept) return String(scopeDept).trim() || 'unknown';
  if (Array.isArray(body?.rows) && body.rows.length && body.columns?.deptKey) {
    const v = body.rows[0][body.columns.deptKey];
    if (v) return String(v).trim();
  }
  return 'unknown';
}
function checkQuota(req, dept) {
  const key = todayKey();
  const uid = getUserId(req);
  const uMap = usageUser.get(key) || new Map();
  const dMap = usageDept.get(key) || new Map();
  const uCount = (uMap.get(uid) || 0) + 1;
  const dCount = (dMap.get(dept) || 0) + 1;
  if (uCount > QUOTA_USER_DAILY) return { ok: false, reason: 'user' };
  if (dCount > QUOTA_DEPT_DAILY) return { ok: false, reason: 'department' };
  uMap.set(uid, uCount);
  dMap.set(dept, dCount);
  usageUser.set(key, uMap);
  usageDept.set(key, dMap);
  return { ok: true };
}

function parseRating(v) {
  if (typeof v === 'number') {
    const n = Math.round(v);
    if (n >= 1 && n <= 5) return n;
  }
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    if (m) {
      const n = parseInt(m[0]);
      if (n >= 1 && n <= 5) return n;
    }
    const low = v.toLowerCase();
    if (low.includes('poor')) return 1;
    if (low.includes('satisfactory') || low.includes('below expectations')) return 2;
    if (low.includes('good') || low.includes('meets expectations')) return 3;
    if (low.includes('exceeds')) return 4;
    if (low.includes('outstanding') || low.includes('exceptional')) return 5;
  }
  return 0;
}

function computeAnalytics(rows, columns) {
  const ratingKey = columns?.ratingKey || '2025 Rating';
  const counts = [0,0,0,0,0];
  const arr = [];
  for (const r of rows || []) {
    const n = parseRating(r[ratingKey]);
    if (n >= 1 && n <= 5) {
      counts[n-1] += 1;
      arr.push(n);
    }
  }
  const nTot = arr.length;
  let mean = 0;
  let median = 0;
  if (nTot > 0) {
    mean = arr.reduce((a,b)=>a+b,0) / nTot;
    const s = arr.slice().sort((a,b)=>a-b);
    const mid = Math.floor(nTot/2);
    median = nTot % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2;
  }
  function byKey(field) {
    const res = new Map();
    for (const r of rows || []) {
      const key = String(r[field] || '').trim();
      if (!key) continue;
      const n = parseRating(r[ratingKey]);
      if (n < 1 || n > 5) continue;
      let e = res.get(key);
      if (!e) {
        e = { counts: [0,0,0,0,0], n: 0 };
        res.set(key, e);
      }
      e.counts[n-1] += 1;
      e.n += 1;
    }
    const out = [];
    for (const [k, e] of res.entries()) {
      const mean2 = e.n ? (e.counts.reduce((s,c,i)=>s + c*(i+1),0)/e.n) : 0;
      out.push({ key: k, n: e.n, mean: mean2, counts: e.counts });
    }
    out.sort((a,b)=>b.n-a.n);
    return out.slice(0, 20);
  }
  const byDepartment = columns?.deptKey ? byKey(columns.deptKey) : [];
  const byPositionLevel = columns?.positionKey ? byKey(columns.positionKey) : [];
  return { overall: { n: nTot, counts, mean, median }, byDepartment, byPositionLevel };
}

// In-memory mapping store (optional persistence layer)
const MAPPINGS = new Map();

// --- Auth ---
const SESSIONS = new Map();
const SUBSCRIPTIONS = new Map(); // uid -> 'free' | 'pro'
function parseCookies(req) {
  const hdr = req.headers.cookie || '';
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
function makeSid() {
  return crypto.randomBytes(24).toString('hex');
}
function isAuthenticated(req) {
  const c = parseCookies(req);
  const sid = c.sid;
  if (!sid) return false;
  const sess = SESSIONS.get(sid);
  if (!sess) return false;
  if (sess.exp && sess.exp < Date.now()) {
    SESSIONS.delete(sid);
    return false;
  }
  return true;
}
function requireAuthApi(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = process.env.ADMIN_USER || 'admin';
  const p = process.env.ADMIN_PASSWORD || '';
  if (String(username || '') === String(u) && String(password || '') === String(p)) {
    const sid = makeSid();
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    SESSIONS.set(sid, { user: u, exp });
    const uid = getUserId(req);
    if (!SUBSCRIPTIONS.get(uid)) SUBSCRIPTIONS.set(uid, 'free');
    res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/`);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'invalid_credentials' });
  }
});
app.get('/api/auth/status', (req, res) => {
  const uid = getUserId(req);
  const plan = SUBSCRIPTIONS.get(uid) || 'free';
  res.json({ authenticated: isAuthenticated(req), plan });
});
app.post('/api/auth/logout', (req, res) => {
  const c = parseCookies(req);
  const sid = c.sid;
  if (sid) SESSIONS.delete(sid);
  res.setHeader('Set-Cookie', `sid=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/`);
  res.json({ ok: true });
});

function requirePro(req, res) {
  const uid = getUserId(req);
  const plan = SUBSCRIPTIONS.get(uid) || 'free';
  if (plan !== 'pro') {
    res.status(402).json({ error: 'payment_required' });
    return false;
  }
  return true;
}

// --- Billing ---
app.get('/api/billing/plan', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  const uid = getUserId(req);
  res.json({ plan: SUBSCRIPTIONS.get(uid) || 'free' });
});
app.post('/api/billing/create-session', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'billing_not_configured' });
    }
    const successUrl = (BASE_URL || `http://${HOST}:${PORT}`) + '/index.html?upgrade=success';
    const cancelUrl = (BASE_URL || `http://${HOST}:${PORT}`) + '/index.html?upgrade=cancel';
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('line_items[0][price]', STRIPE_PRICE_ID);
    params.append('line_items[0][quantity]', '1');
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!r.ok) return res.status(502).json({ error: 'stripe_error', detail: await r.text().catch(()=> '') });
    const j = await r.json();
    res.json({ url: j.url });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});
// Manual upgrade endpoint (for testing without webhooks)
app.post('/api/billing/upgrade-manual', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  const uid = getUserId(req);
  SUBSCRIPTIONS.set(uid, 'pro');
  res.json({ plan: 'pro' });
});

// Health/status for insights
app.get('/api/insights', (req, res) => {
  const configured = !!getKey();
  res.json({ configured });
});

app.post('/api/insights', async (req, res) => {
  if (!requireAuthApi(req, res)) return;
  if (!requirePro(req, res)) return;
  try {
    const apiKey = getKey();
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    const q = checkQuota(req, getDeptFromBody(req.body));
    if (!q.ok) return res.status(429).json({ error: 'quota_exceeded', scope: q.reason });
    const { targetPercentages, actualCounts, actualPercentages, ratingNames, yearSeries } = req.body || {};
    const inputSummary = { ratings: ratingNames, targetPercentages, actualCounts, actualPercentages, yearSeries };
    const messages = [
      { role: 'system', content: 'You are an HR analytics assistant. Provide concise, actionable insights and short-term forecasts about performance rating distributions.' },
      { role: 'user', content: `Data: ${JSON.stringify(inputSummary)}. Provide 3-5 bullet insights highlighting over/under target areas, potential causes to investigate, and a brief forecast for next period based on the year series if present.` }
    ];
    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.4, messages })
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error', detail: await r.text().catch(()=> '') });
    const data = await r.json();
    res.json({ insights: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!requireAuthApi(req, res)) return;
  if (!requirePro(req, res)) return;
  try {
    const apiKey = getKey();
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    const body = req.body || {};
    const { question, rows, columns, scope, history, showSources } = body;
    if (!question || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Missing question or rows' });
    }
    const q = checkQuota(req, getDeptFromBody(body));
    if (!q.ok) return res.status(429).json({ error: 'quota_exceeded', scope: q.reason });
    const fields = {
      name: columns?.nameKey || 'EmployeeName',
      department: columns?.deptKey || 'Department',
      position: columns?.positionKey || 'Position',
      section: columns?.sectionKey || 'Section',
      sbu: columns?.sbuKey || 'SBU',
      rating: columns?.ratingKey || '2025 Rating'
    };
    const instruction =
      `You are a professional HR data assistant. Use ONLY the provided rows to answer.\n` +
      `Columns: name (${fields.name}), department (${fields.department}), position (${fields.position}), section (${fields.section}), sbu (${fields.sbu}), rating (${fields.rating}).\n` +
      `Rules:\n` +
      `- Filter by any department/section/rating mentioned (case-insensitive). Ratings are integers 1–5.\n` +
      `- Output in a clear, professional tone.\n` +
      `- If listing people, respond with:\n` +
      `  Line 1: "Employees in <Dept or Scope> with rating <R>: <COUNT>".\n` +
      `  Then a bullet list (one per line) of up to 20 names, sorted alphabetically.\n` +
      `  If more than 20, end with "… +<N> more".\n` +
      `- If no matches, answer exactly: "No matching records found."` +
      (showSources ? `\n- Include a final section "Sources:" with up to 10 entries of "Name — Department — Rating".` : ``);
    const messages = [{ role: 'system', content: instruction }];
    if (Array.isArray(history)) {
      history.forEach(m => {
        if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
          messages.push({ role: m.role, content: m.content });
        }
      });
    }
    messages.push({ role: 'user', content: `Scope: ${JSON.stringify(scope || {})}` });
    messages.push({ role: 'user', content: `Rows JSON (may be truncated): ${JSON.stringify(rows).slice(0, 180000)}` });
    const analytics = computeAnalytics(rows, columns);
    messages.push({ role: 'user', content: `Analytics JSON: ${JSON.stringify(analytics).slice(0, 180000)}` });
    messages.push({ role: 'user', content: `Question: ${question}` });
    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.2, messages })
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error', detail: await r.text().catch(()=> '') });
    const data = await r.json();
    res.json({ answer: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: set API key at runtime (memory only)
app.post('/api/admin/key', (req, res) => {
  if (!requireAuthApi(req, res)) return;
  const { key } = req.body || {};
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key' });
  }
  // basic sanity check to avoid accidental garbage
  if (!/^sk-/.test(key) && !/^sk_svcacct-/.test(key) && !/^sk-svcacct-/.test(key)) {
    // allow non-standard prefixes but warn
    // continue to set to support alternative providers
  }
  RUNTIME_KEY = key;
  res.json({ configured: true });
});

// Optional mapping endpoints
app.get('/api/mapping', (req, res) => {
  if (!requireAuthApi(req, res)) return;
  const filename = req.query.filename;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  const m = MAPPINGS.get(filename);
  res.json({ mapping: m || null });
});

app.post('/api/mapping', (req, res) => {
  if (!requireAuthApi(req, res)) return;
  const { filename, mapping } = req.body || {};
  if (!filename || !mapping) return res.status(400).json({ error: 'filename and mapping required' });
  MAPPINGS.set(filename, mapping);
  res.json({ ok: true });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get(['/', '/index.html', '/salaries.html'], (req, res, next) => {
  if (isAuthenticated(req)) return next();
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  const ready = getKey() ? 'READY' : 'NOT CONFIGURED';
  // eslint-disable-next-line no-console
  console.log(`Server running on http://${HOST}:${PORT} | AI: ${ready}`);
});
