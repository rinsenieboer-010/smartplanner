import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Alleen GET toegestaan' });

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Geen API key. Gebruik: Authorization: Bearer jmp_...' });
  }
  const apiKey = auth.slice(7).trim();

  // Zoek gebruiker op via API key
  const { data: keyData } = await supabase
    .from('api_keys')
    .select('user_id')
    .eq('key', apiKey)
    .single();

  if (!keyData) {
    return res.status(401).json({ error: 'Ongeldige API key' });
  }

  const uid = keyData.user_id;

  // Haal alle data op
  const [{ data: tasks }, { data: events }, { data: lists }] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', uid).order('created_at'),
    supabase.from('events').select('*').eq('user_id', uid).order('date'),
    supabase.from('lists').select('*').eq('user_id', uid),
  ]);

  return res.status(200).json({
    exported_at: new Date().toISOString(),
    tasks: (tasks || []).map(t => ({
      id:       t.id,
      title:    t.title,
      deadline: t.deadline,
      priority: t.priority,
      status:   t.status,
      list:     t.list_id,
      note:     t.note,
    })),
    events: (events || []).map(e => ({
      id:    e.id,
      title: e.title,
      date:  e.date,
      start: `${String(e.start_h).padStart(2,'0')}:${String(e.start_m).padStart(2,'0')}`,
      end:   `${String(e.end_h).padStart(2,'0')}:${String(e.end_m).padStart(2,'0')}`,
      color: e.color,
      note:  e.note,
    })),
    lists: (lists || []).map(l => ({
      id:    l.id,
      label: l.label,
      color: l.color,
    })),
  });
}
