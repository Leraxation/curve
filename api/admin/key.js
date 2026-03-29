export default async function handler(req, res) {
  // Serverless note: we cannot persist runtime keys across invocations on Vercel.
  // Use Vercel project environment variables instead.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const has = !!process.env.OPENAI_API_KEY;
  res.status(200).json({ configured: has });
}
