# Just My Plan — Project Context

## Wat is dit?
justmyplan is een React productiviteitsapp met drie panelen: Taken (links), Agenda (midden), AI-assistent (rechts). De panelen zijn versleepbaar met splitters die snappen naar 5%, 50% of 95%.

## Tech stack
- React (Vite) — alles in één bestand: `src/App.jsx`
- Inline styles door de hele app (geen CSS bestanden)
- Claude API voor de AI-assistent (claude-sonnet-4-6, via `api/chat.js`)
- Supabase voor authenticatie en database
- Hosting: Vercel
- Repository: https://github.com/rinsenieboer-010/smartplanner
- Live URL: https://justmyplan.com

## API endpoints (Vercel functions in `api/`)
- `chat.js` — AI-assistent web: volledige tool-loop server-side
- `claude.js` — dunne Anthropic-proxy voor de mobiele app (app houdt eigen tool-loop)
- `agent-run.js` — agent-bericht uitvoeren (per-user agents uit de `agents`-tabel)
- `data.js` — externe API met `jmp_` API-key (Authorization: Bearer): taken/events lezen + schrijven
- `notify.js` — notificaties van agents naar Rinse

## Mobiele app (aparte repo)
- Repo: `C:\Users\RJNie\Documents\justmyplan-tel` (Expo / React Native)
- Staat live in de Apple App Store (bundle `com.justmyplan.app`)
- Updates: JS-wijzigingen via EAS Update (OTA, geen review); native wijzigingen via `eas build` + `eas submit` + Apple review
- Terminal-bridge: `C:\Users\RJNie\justmyplan-bridge` — vanaf de app met echte terminal-agents praten (tabel `agent_requests`)

## Agents (Model A)
- Agents worden NIET handmatig in de UI aangemaakt (knoppen verwijderd in web + app)
- Aanmaken gaat via de API-key door een externe AI; bewerken/verwijderen kan nog wel in de UI

## Supabase configuratie
- Project URL: https://fsublwuxvujxibyacvvp.supabase.co
- Anon key staat in `.env.local` (nooit committen naar GitHub)
- OAuth providers: Google en Microsoft (Azure) — beide geconfigureerd
- RLS is ingeschakeld op alle tabellen met eigen-data policies
- Tabellen: `tasks`, `events`, `lists` (elk met `user_id` kolom)
- Auth: email bevestiging uitgeschakeld, gebruikers komen direct in de app

## Kleurpalet (Mondriaan stijl)
- Blauw accent: #2563EB / blauw bg: #DBEAFE
- Rood accent: #DC2626 / rood bg: #FEE2E2
- Geel accent: #E6B400 / geel bg: #FFF176
- Donkere zijbalk: #18181b / actief item: #27272a
- Font: DM Sans (Google Fonts)

## Bestandsstructuur
- `src/App.jsx` — volledige app (alle componenten)
- `src/supabase.js` — Supabase client
- `src/db.js` — alle database functies (CRUD voor tasks, events, lists)
- `.env.local` — omgevingsvariabelen (lokaal, niet in Git)

## Structuur van App.jsx
- `LoginPage` — loginscherm met Google/Microsoft OAuth + email/wachtwoord
- `App` — hoofdcomponent, beheert auth sessie, panelbreedtes en splitter logica
- `TaskPanel` — takenpaneel met zijbalk (lijsten), tabel (naam/datum/prioriteit/status), notities
- `CalendarPanel` — weekkalender met zijbalk (agenda's), afspraken toevoegen/bewerken
- `AIPanel` — chat interface gekoppeld aan Claude API met context van taken en afspraken
- `Splitter` — versleepbare splitter component
- `TimeSelect` — tijd dropdown component (uur + kwartier)

## Data flow
- Bij inloggen worden tasks, events en lists geladen uit Supabase per user_id
- Elke CRUD actie slaat direct op in Supabase via db.js functies
- Lists state wordt beheerd in App (niet in TaskPanel) en doorgegeven als props
- Trash is lokaal state (niet opgeslagen in Supabase)

## Belangrijke gedragsregels
- Zijbalken verdwijnen automatisch als paneel smaller is dan 400px (animatie 1.5s)
- Panelen snappen bij loslaten naar 5% (dicht), 50% (splitscreen), 95% (andere kant dicht)
- Als agenda ingeklapt is en je sleept de rechter splitter, blijft agenda ingeklapt
- Taken gesorteerd op datum (vroegste bovenaan, geen datum onderaan)
- Voltooide taken krijgen een fade animatie van 2 seconden voor ze naar prullebak gaan

## Auth flow (belangrijk)
- OAuth redirect geeft hash tokens (#access_token=...)
- App extraheert refresh_token uit de hash en roept refreshSession aan (omzeilt klok-skew probleem)
- onAuthStateChange luistert naar sessie wijzigingen
- authLoading voorkomt dat loginscherm flikkert tijdens sessie detectie

## Vercel omgevingsvariabelen
Moeten ingesteld zijn op Production:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
(geen whitespace in de waarden!)

## Deployen
Na aanpassingen:
```
git add .
git commit -m "beschrijving"
git push
```
Vercel deployt automatisch.

## Volgende stappen (nog te doen)
- `POST /api/agents`: agents aanmaken via de API-key (Model A afmaken)
- Server-side auth op `api/claude.js` en `api/agent-run.js` (nu open endpoints)
- Notificaties / herinneringen
- Gebruikersnaam of profielafbeelding in header
