# Agent Instructies — Just My Plan Notificaties

Als agent kun je Rinse bereiken via zijn productiviteitsapp Just My Plan.
Stuur altijd een taak als je iets voor hem hebt afgerond, ontdekt of ingepland.
Plan indien van toepassing ook tijd in zijn agenda.

---

## Endpoint

```
POST https://justmyplan.com/api/notify
Authorization: Bearer 4bf5e5449ed975c3a68f79ac3c0eff73233b59295ce715409f90cfd3d0f653ee
Content-Type: application/json
```

---

## Regels

1. **Voeg altijd een taak toe** ergens in de huidige week (maandag t/m zondag).
2. **Plan ook agenda-tijd** als jouw werk een specifiek moment vereist (review, call, check-in).
3. Zet jouw naam als `agent` zodat Rinse weet van wie de melding komt.
4. Gebruik een `date` in het formaat `YYYY-MM-DD` binnen de huidige week.
5. Voeg een korte `note` toe met wat je hebt gedaan of wat Rinse moet weten.

---

## Taak toevoegen

```json
{
  "type": "task",
  "title": "Korte omschrijving van wat je hebt gedaan of wat Rinse moet doen",
  "agent": "Naam van jouw agent",
  "priority": "hoog",
  "date": "YYYY-MM-DD",
  "note": "Uitleg, bevindingen of actie die nodig is."
}
```

**priority opties:** `laag` | `midden` | `hoog`

---

## Agendapunt toevoegen

```json
{
  "type": "event",
  "title": "Korte omschrijving",
  "agent": "Naam van jouw agent",
  "date": "YYYY-MM-DD",
  "startH": 10,
  "startM": 0,
  "endH": 11,
  "endM": 0,
  "color": "blue",
  "note": "Optionele toelichting."
}
```

**color opties:** `blue` | `red` | `yellow` | `green` | `purple`

---

## Voorbeeld (JavaScript / fetch)

```js
async function notifyRinse({ title, note, agent, date, priority = 'midden' }) {
  await fetch('https://justmyplan.com/api/notify', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer 4bf5e5449ed975c3a68f79ac3c0eff73233b59295ce715409f90cfd3d0f653ee',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'task', title, note, agent, date, priority }),
  });
}
```

---

## Huidige week berekenen

```js
function getCurrentWeekDates() {
  const today = new Date();
  const day = today.getDay(); // 0 = zondag
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toISOString().split('T')[0];
  return { monday: fmt(monday), sunday: fmt(sunday), today: fmt(today) };
}
// Gebruik: date = getCurrentWeekDates().today  (of een andere dag in de week)
```

---

## Volledig voorbeeld — taak + agendapunt

```js
const { today } = getCurrentWeekDates();

// Taak
await fetch('https://justmyplan.com/api/notify', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer 4bf5e5449ed975c3a68f79ac3c0eff73233b59295ce715409f90cfd3d0f653ee',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'task',
    title: 'Portfolio bijgewerkt — review gewenst',
    agent: 'Portfolio Agent',
    priority: 'hoog',
    date: today,
    note: 'Drie nieuwe projecten toegevoegd. Controleer of de beschrijvingen kloppen.',
  }),
});

// Agendapunt
await fetch('https://justmyplan.com/api/notify', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer 4bf5e5449ed975c3a68f79ac3c0eff73233b59295ce715409f90cfd3d0f653ee',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'event',
    title: 'Portfolio review',
    agent: 'Portfolio Agent',
    date: today,
    startH: 10,
    startM: 0,
    endH: 10,
    endM: 30,
    color: 'green',
    note: 'Nieuwe projecten bekijken op rjnieboer.com',
  }),
});
```
