import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const pad = (n) => String(n).padStart(2, '0');

// "HH:MM" → { h, m } (valt terug op default bij ongeldige invoer)
function parseTime(s, def) {
  if (typeof s !== 'string' || !s.includes(':')) return def;
  const [h, m] = s.split(':').map(x => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : def.h, m: Number.isFinite(m) ? m : def.m };
}

// ── Lezen: volledige export ────────────────────────────────────────────────────
async function readAll(uid) {
  const [{ data: tasks }, { data: events }, { data: lists }] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', uid).is('deleted_at', null).order('created_at'),
    supabase.from('events').select('*').eq('user_id', uid).order('date'),
    supabase.from('lists').select('*').eq('user_id', uid),
  ]);
  return {
    exported_at: new Date().toISOString(),
    tasks: (tasks || []).map(t => ({
      id: t.id, title: t.title, deadline: t.deadline, priority: t.priority,
      status: t.status, list: t.list_id, note: t.note,
    })),
    events: (events || []).map(e => ({
      id: e.id, title: e.title, date: e.date,
      start: `${pad(e.start_h)}:${pad(e.start_m)}`, end: `${pad(e.end_h)}:${pad(e.end_m)}`,
      color: e.color, note: e.note,
    })),
    lists: (lists || []).map(l => ({ id: l.id, label: l.label, color: l.color })),
  };
}

// ── Schrijven: één actie, altijd vastgepind op de eigenaar van de key (uid) ─────
async function runAction(uid, act) {
  const action = act?.action;
  try {
    switch (action) {
      case 'create_task': {
        const t = act.task || act;
        if (!t.title) return { action, ok: false, error: 'title verplicht' };
        const { data, error } = await supabase.from('tasks').insert({
          user_id: uid, title: t.title, deadline: t.deadline || null,
          priority: t.priority || null, status: t.status || null,
          list_id: t.list || t.list_id || 'mine', note: t.note || null,
        }).select('id').single();
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id: data.id };
      }
      case 'update_task': {
        const id = act.id || act.task?.id;
        if (!id) return { action, ok: false, error: 'id verplicht' };
        const f = act.fields || act.task || act;
        const patch = {};
        for (const k of ['title', 'deadline', 'priority', 'status', 'note']) if (k in f) patch[k] = f[k];
        if ('list' in f) patch.list_id = f.list;
        if ('list_id' in f) patch.list_id = f.list_id;
        const { error } = await supabase.from('tasks').update(patch).eq('id', id).eq('user_id', uid);
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id };
      }
      case 'complete_task':
      case 'delete_task': {
        const id = act.id;
        if (!id) return { action, ok: false, error: 'id verplicht' };
        // zacht verwijderen (zelfde als de app): naar prullenbak
        const { error } = await supabase.from('tasks')
          .update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', uid);
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id };
      }
      case 'create_event': {
        const e = act.event || act;
        if (!e.title || !e.date) return { action, ok: false, error: 'title en date verplicht' };
        const st = parseTime(e.start, { h: 9, m: 0 });
        const en = parseTime(e.end, { h: 10, m: 0 });
        const { data, error } = await supabase.from('events').insert({
          user_id: uid, title: e.title, date: e.date,
          start_h: st.h, start_m: st.m, end_h: en.h, end_m: en.m,
          color: e.color || 'blue', note: e.note || null,
        }).select('id').single();
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id: data.id };
      }
      case 'update_event': {
        const id = act.id || act.event?.id;
        if (!id) return { action, ok: false, error: 'id verplicht' };
        const f = act.fields || act.event || act;
        const patch = {};
        for (const k of ['title', 'date', 'color', 'note']) if (k in f) patch[k] = f[k];
        if ('start' in f) { const s = parseTime(f.start, { h: 9, m: 0 }); patch.start_h = s.h; patch.start_m = s.m; }
        if ('end' in f)   { const en = parseTime(f.end, { h: 10, m: 0 }); patch.end_h = en.h; patch.end_m = en.m; }
        const { error } = await supabase.from('events').update(patch).eq('id', id).eq('user_id', uid);
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id };
      }
      case 'delete_event': {
        const id = act.id;
        if (!id) return { action, ok: false, error: 'id verplicht' };
        const { error } = await supabase.from('events').delete().eq('id', id).eq('user_id', uid);
        return error ? { action, ok: false, error: error.message } : { action, ok: true, id };
      }
      default:
        return { action: action || null, ok: false, error: 'onbekende action' };
    }
  } catch (err) {
    return { action, ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Key valideren → user_id van de eigenaar
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Geen API key. Gebruik: Authorization: Bearer jmp_...' });
  }
  const apiKey = auth.slice(7).trim();
  const { data: keyData } = await supabase.from('api_keys').select('user_id').eq('key', apiKey).single();
  if (!keyData) return res.status(401).json({ error: 'Ongeldige API key' });
  const uid = keyData.user_id;

  if (req.method === 'GET') {
    return res.status(200).json(await readAll(uid));
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const actions = Array.isArray(body.actions) ? body.actions : [body];
    const results = [];
    for (const act of actions) results.push(await runAction(uid, act));
    return res.status(200).json({ ok: results.every(r => r.ok), results });
  }

  return res.status(405).json({ error: 'Alleen GET of POST toegestaan' });
}
