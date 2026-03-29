export default async function handler(req, res) {
  const configured = !!process.env.OPENAI_API_KEY;
  res.json({ configured });
}

