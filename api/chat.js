const TOOLS = [
  {
    name: "create_event",
    description: "Plan een afspraak in de agenda van de gebruiker.",
    input_schema: {
      type: "object",
      properties: {
        title:   { type: "string" },
        date:    { type: "string", description: "YYYY-MM-DD" },
        start_h: { type: "integer" },
        start_m: { type: "integer" },
        end_h:   { type: "integer" },
        end_m:   { type: "integer" },
        color:   { type: "string", enum: ["blue", "red", "yellow", "green", "purple"] }
      },
      required: ["title", "date", "start_h", "start_m", "end_h", "end_m"]
    }
  },
  {
    name: "create_task",
    description: "Maak een nieuwe taak aan.",
    input_schema: {
      type: "object",
      properties: {
        title:    { type: "string" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: ["", "hoog", "midden", "laag"] }
      },
      required: ["title"]
    }
  },
  {
    name: "update_task",
    description: "Update één taak. Gebruik dit voor wijzigingen aan een enkele taak.",
    input_schema: {
      type: "object",
      properties: {
        task_id:  { type: "string" },
        status:   { type: "string", enum: ["", "open", "bezig", "klaar"] },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: ["", "hoog", "midden", "laag"] }
      },
      required: ["task_id"]
    }
  },
  {
    name: "filter_and_update_tasks",
    description: "Zoek taken op basis van een zoekwoord in de taaknaam en pas ze allemaal tegelijk aan. Gebruik dit voor opdrachten zoals 'alle stage-taken op donderdag zetten'.",
    input_schema: {
      type: "object",
      properties: {
        keyword:  { type: "string", description: "Zoekwoord dat in de taaknaam moet voorkomen (hoofdletterongevoelig)" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        status:   { type: "string", enum: ["", "open", "bezig", "klaar"] },
        priority: { type: "string", enum: ["", "hoog", "midden", "laag"] }
      },
      required: ["keyword"]
    }
  },
  {
    name: "update_memory",
    description: "Sla een werkwijze of voorkeur op voor toekomstige gesprekken.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" }
      },
      required: ["content"]
    }
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  const { messages, tasks, events, today, memory } = req.body;

  const pad = n => String(n).padStart(2, '0');
  const taskList = (tasks || []).map(t =>
    `- task_id="${t.id}" | ${t.title} | ${t.priority || 'geen prioriteit'} | ${t.status || 'geen status'}${t.deadline ? ' | deadline: ' + t.deadline : ''}`
  ).join('\n');
  const eventList = (events || []).map(e =>
    `- ${e.title} op ${e.date} ${pad(e.startH)}:${pad(e.startM)}-${pad(e.endH)}:${pad(e.endM)}`
  ).join('\n');

  const systemPrompt = `Je bent een slimme planningsassistent voor justmyplan.

Vandaag is het: ${today}

GEDRAGSREGEL — je gebruikt ALTIJD een tool, zonder uitzondering:
- Gebruiker vraagt een actie (taak/afspraak aanmaken of wijzigen)? → gebruik de actie-tool direct
- Gebruiker stelt een vraag of voert gesprek? → gebruik no_action met je antwoord
- Meerdere taken wijzigen op basis van een woord in de naam? → gebruik filter_and_update_tasks met het zoekwoord
- Eén specifieke taak wijzigen? → gebruik update_task met de task_id

VERBOD: Zeg NOOIT dat je iets hebt gedaan zonder de bijbehorende tool aan te roepen.

WERKWIJZE:
${memory || 'Nog geen werkwijze opgeslagen.'}

TAKEN:
${taskList || 'Geen taken'}

AGENDA:
${eventList || 'Geen afspraken'}

Regels:
- Spreek altijd Nederlands
- Geef korte, concrete antwoorden als bevestiging na een actie
- Gebruik de task_id exact zoals hij in de lijst staat, niets toevoegen of weglaten
- Gebruik update_memory zodra de gebruiker een voorkeur uitlegt`;

  try {
    let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const actions = [];
    let newMemory = undefined;

    // Tool use loop (max 10 iteraties om infinite loops te voorkomen)
    let iterations = 0;
    let continueLoop = true;
    while (continueLoop && iterations < 10) {
      iterations++;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          tools: TOOLS,
          messages: apiMessages
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(500).json({ error: data.error?.message || 'Anthropic API fout' });
      }

      if (data.stop_reason === 'tool_use') {
        const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === 'update_memory') {
            newMemory = toolUse.input.content;
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Opgeslagen.' });
          } else if (toolUse.name === 'filter_and_update_tasks') {
            // Server filtert taken op keyword en maakt losse update_task actions
            const d = toolUse.input;
            const keyword = (d.keyword || '').toLowerCase();
            const matched = (tasks || []).filter(t => t.title?.toLowerCase().includes(keyword));
            for (const task of matched) {
              actions.push({ type: 'update_task', data: {
                task_id: task.id,
                ...(d.deadline !== undefined && { deadline: d.deadline }),
                ...(d.status   !== undefined && { status:   d.status }),
                ...(d.priority !== undefined && { priority: d.priority }),
              }});
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `${matched.length} taken met "${d.keyword}" gevonden en bijgewerkt.` });
          } else {
            actions.push({ type: toolUse.name, data: toolUse.input });
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Uitgevoerd.' });
          }
        }

        apiMessages = [
          ...apiMessages,
          { role: 'assistant', content: data.content },
          { role: 'user', content: toolResults }
        ];
      } else {
        const reply = data.content?.find(b => b.type === 'text')?.text
          || (actions.length > 0 ? `Gedaan. ${actions.length} item${actions.length > 1 ? 's' : ''} bijgewerkt.` : 'Sorry, er ging iets mis.');
        return res.status(200).json({ reply, actions, ...(newMemory !== undefined && { newMemory }) });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
