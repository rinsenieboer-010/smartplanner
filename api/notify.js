export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  // Auth check
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token || token !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    type     = 'task',   // 'task' of 'event'
    title,
    note     = '',
    priority = 'midden', // 'laag' | 'midden' | 'hoog'
    date,                // 'YYYY-MM-DD' (optioneel, default vandaag)
    startH, startM,      // voor events
    endH,   endM,        // voor events
    color   = 'blue',    // blue | red | yellow | green | purple
    agent,               // naam van de agent, wordt als prefix gezet: "[AgentNaam] Titel"
    list_id,             // optioneel: ID van de lijst (alleen voor tasks)
  } = req.body || {};

  if (!title) return res.status(400).json({ error: '`title` is verplicht' });

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const USER_ID      = process.env.NOTIFY_USER_ID;

  if (!SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
    return res.status(500).json({ error: 'Server niet correct geconfigureerd' });
  }

  const today       = new Date().toISOString().split('T')[0];
  const finalTitle  = agent ? `[${agent}] ${title}` : title;
  const finalDate   = date || today;

  let table, payload;

  if (type === 'event') {
    table = 'events';
    payload = {
      user_id: USER_ID,
      title:   finalTitle,
      date:    finalDate,
      start_h: startH ?? 9,
      start_m: startM ?? 0,
      end_h:   endH   ?? 10,
      end_m:   endM   ?? 0,
      color,
      note,
    };
  } else {
    table = 'tasks';
    payload = {
      user_id:  USER_ID,
      title:    finalTitle,
      priority,
      status:   'open',
      deadline: date || null,
      note,
      ...(list_id ? { list_id } : {}),
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data[0]?.id, type, title: finalTitle });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
