const MODEL_MAP = {
  opus:   'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku:  'claude-haiku-4-5-20251001',
};

const AGENT_DEFAULTS = {
  bart:        { name: "Bart",        model: "sonnet", role: "centrale dispatcher en Gmail-manager" },
  teacher:     { name: "Teacher",     model: "opus",   role: "verbeteraar van alle agents" },
  "agent-maker": { name: "Agent Maker", model: "opus", role: "bouwer van nieuwe agents" },
  piet:        { name: "Piet",        model: "opus",   role: "portfolio manager voor Trading 212, aandelen, ETFs en crypto" },
  alex:        { name: "Alex",        model: "sonnet", role: "accountant en financieel adviseur voor belastingen en cashflow" },
  dick:        { name: "Dick",        model: "opus",   role: "advocaat gespecialiseerd in Nederlands recht" },
  scott:       { name: "Scott",       model: "sonnet", role: "verkenner die nieuwe tech en ideeën onderzoekt" },
  ivo:         { name: "Ivo",         model: "sonnet", role: "maandelijkse tech en AI monitor" },
  bram:        { name: "Bram",        model: "sonnet", role: "personal brand manager voor X, LinkedIn en blogs" },
  wes:         { name: "Wes",         model: "sonnet", role: "website manager voor alle sites via GitHub en Vercel" },
  baby:        { name: "Baby",        model: "haiku",  role: "ontwikkelingsagent voor baby (geboren 29-11-2025)" },
  chris:       { name: "Chris",       model: "opus",   role: "kritisch adviseur die bikkelhard feedback geeft" },
  handy:       { name: "Handy",       model: "haiku",  role: "opslager van handige tips en werkwijzen" },
  stage:       { name: "Stage",       model: "opus",   role: "afstudeerstage zoeker in de regio Rotterdam" },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  const { agent_id, message } = req.body;
  if (!agent_id || !message) return res.status(400).json({ error: 'agent_id en message zijn verplicht' });

  const agentDefault = AGENT_DEFAULTS[agent_id];
  if (!agentDefault) return res.status(404).json({ error: 'Agent niet gevonden' });

  // Try to load system_prompt from Supabase agents table; fall back to default
  let systemPrompt = `Je bent ${agentDefault.name}, ${agentDefault.role} voor Rinse Nieboer. Beantwoord zijn vraag direct en bondig. Spreek Nederlands.`;
  let model = agentDefault.model;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );
    const { data } = await supabase.from('agents').select('system_prompt,model').eq('id', agent_id).single();
    if (data?.system_prompt) systemPrompt = data.system_prompt;
    if (data?.model) model = data.model;
  } catch {}

  const claudeModel = MODEL_MAP[model] || MODEL_MAP.sonnet;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'Anthropic API fout' });

    const reply = data.content?.find(b => b.type === 'text')?.text || 'Geen response';
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
