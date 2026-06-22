// Dunne proxy naar de Anthropic API. De mobiele app (justmyplan-tel) belt dit
// endpoint i.p.v. rechtstreeks Anthropic, zodat de API-key alleen server-side
// leeft en niet meegebundeld wordt in de app. De app houdt zijn eigen tool-loop;
// dit endpoint geeft het Anthropic-antwoord 1-op-1 door.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  const { model, max_tokens, system, tools, tool_choice, messages } = req.body || {};
  if (!messages) return res.status(400).json({ error: 'messages ontbreekt' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: max_tokens || 8192,
        ...(system && { system }),
        ...(tools && { tools }),
        ...(tool_choice && { tool_choice }),
        messages,
      }),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
