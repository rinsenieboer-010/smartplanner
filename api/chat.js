const TOOLS = [
  {
    name: "create_event",
    description: "Plan een afspraak of taak in de agenda van de gebruiker. Gebruik dit wanneer de gebruiker iets wil inplannen.",
    input_schema: {
      type: "object",
      properties: {
        title:   { type: "string",  description: "Titel van de afspraak" },
        date:    { type: "string",  description: "Datum in YYYY-MM-DD formaat" },
        start_h: { type: "integer", description: "Startuur (0-23)" },
        start_m: { type: "integer", description: "Startminuten (0 of 30)" },
        end_h:   { type: "integer", description: "Einduur (0-23)" },
        end_m:   { type: "integer", description: "Eindminuten (0 of 30)" },
        color:   { type: "string",  enum: ["blue", "red", "yellow", "green", "purple"], description: "Kleur van de afspraak" }
      },
      required: ["title", "date", "start_h", "start_m", "end_h", "end_m"]
    }
  },
  {
    name: "create_task",
    description: "Maak een nieuwe taak aan voor de gebruiker.",
    input_schema: {
      type: "object",
      properties: {
        title:    { type: "string", description: "Titel van de taak" },
        deadline: { type: "string", description: "Deadline in YYYY-MM-DD formaat (optioneel)" },
        priority: { type: "string", enum: ["", "hoog", "midden", "laag"] }
      },
      required: ["title"]
    }
  },
  {
    name: "update_task",
    description: "Update de status, deadline of prioriteit van een bestaande taak. Gebruik de task_id uit de takenlijst.",
    input_schema: {
      type: "object",
      properties: {
        task_id:  { type: "string", description: "ID van de taak (uit de takenlijst)" },
        status:   { type: "string", enum: ["", "open", "bezig", "klaar"] },
        deadline: { type: "string", description: "Nieuwe deadline in YYYY-MM-DD" },
        priority: { type: "string", enum: ["", "hoog", "midden", "laag"] }
      },
      required: ["task_id"]
    }
  },
  {
    name: "update_memory",
    description: "Sla een werkwijze, voorkeur of concept op voor toekomstige gesprekken. Gebruik dit wanneer de gebruiker iets uitlegt dat ook later relevant is. Schrijf de volledige bijgewerkte inhoud — voeg toe aan het bestaande geheugen, verwijder niets zonder toestemming.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "De volledige bijgewerkte inhoud van het geheugen." }
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
    `- [ID:${t.id}] ${t.title} (${t.priority || 'geen prioriteit'}, ${t.status || 'geen status'}${t.deadline ? ', deadline: ' + t.deadline : ''})`
  ).join('\n');
  const eventList = (events || []).map(e =>
    `- ${e.title} op ${e.date} ${pad(e.startH)}:${pad(e.startM)}-${pad(e.endH)}:${pad(e.endM)}`
  ).join('\n');

  const systemPrompt = `Je bent een slimme, proactieve dagelijkse planningsassistent voor justmyplan. Je helpt de gebruiker taken inplannen in de agenda en hun dag/week te organiseren.

Vandaag is het: ${today}

Je hebt tools om direct taken en afspraken aan te maken of bij te werken. Gebruik ze proactief wanneer de gebruiker vraagt om iets in te plannen — vraag niet of je het mag, doe het gewoon en bevestig daarna.

WERKWIJZE (onthoud dit altijd):
${memory || 'Nog geen werkwijze opgeslagen.'}

TAKEN (gebruik de ID bij update_task):
${taskList || 'Geen taken'}

AGENDA:
${eventList || 'Geen afspraken'}

Regels:
- Spreek altijd Nederlands
- Geef korte, concrete antwoorden
- Bevestig na elke actie wat je hebt gedaan
- Plan taken op logische tijden (niet 's nachts)
- Gebruik de taak-ID's correct bij update_task
- Gebruik update_memory zodra de gebruiker een voorkeur of werkwijze uitlegt die je moet onthouden`;

  try {
    let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const actions = [];
    let newMemory = undefined;

    // Tool use loop
    let continueLoop = true;
    while (continueLoop) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
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
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Werkwijze opgeslagen.' });
          } else {
            actions.push({ type: toolUse.name, data: toolUse.input });
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Actie succesvol uitgevoerd.' });
          }
        }

        apiMessages = [
          ...apiMessages,
          { role: 'assistant', content: data.content },
          { role: 'user', content: toolResults }
        ];
      } else {
        const reply = data.content?.find(b => b.type === 'text')?.text || 'Sorry, er ging iets mis.';
        return res.status(200).json({ reply, actions, ...(newMemory !== undefined && { newMemory }) });
        continueLoop = false;
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
