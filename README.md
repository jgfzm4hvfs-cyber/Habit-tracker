# Discipline OS

A Notion-style habit operating system with a polished UI, weekly table, monthly calendar, and Google Sheets cloud sync support.

## Included

- Sidebar `Daily Habits` view with fast today checkboxes
- Sidebar `Analytics` view (30-day completion per habit)
- `Week Table` view (habit x day matrix + day notes)
- `Full Month` calendar view with per-day habit toggles
- One-tap `Strength Training` quick button
- 10 default habits preloaded
- Google Sheets as the only durable data store (no localStorage persistence)
- Automatic cloud pull/push from `cloud-config.js` (no per-session Cloud Connect)

## Run locally

```bash
cd "Habit Tracker"
python3 -m http.server 4173
```

Open: `http://localhost:4173`

## Cloud sync setup

Use:

- `google-apps-script/Code.gs`
- `google-apps-script/SETUP.md`
- `cloud-config.js`

## Storage model

- Habit data is not persisted in browser localStorage.
- Durable data lives in your Google Sheet through Apps Script sync.

## Security before publishing

- Never commit real tokens or deployment URLs to this repo.
- Keep `cloud-config.js` as placeholders in public repos.
- If a token was previously committed, rotate it in Apps Script Script Properties.
