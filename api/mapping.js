let MAPPINGS = {};

function jsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET') {
    const filename = url.searchParams.get('filename');
    if (!filename) return res.status(400).json({ error: 'filename required' });
    return res.json({ mapping: MAPPINGS[filename] || null });
  }
  if (req.method === 'POST') {
    const body = await jsonBody(req);
    const { filename, mapping } = body || {};
    if (!filename || !mapping) return res.status(400).json({ error: 'filename and mapping required' });
    MAPPINGS[filename] = mapping;
    return res.json({ ok: true });
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

