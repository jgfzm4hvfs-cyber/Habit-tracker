# Discipline OS

A Notion-style habit operating system with a polished UI, weekly table, monthly calendar, and Google Sheets cloud sync support.

## Included

- Sidebar `Daily Habits` view with fast today checkboxes
- Cornerstone vs Regular habit sections (daily panel + editor)
- Sidebar `Analytics` view (30-day completion per habit)
- `Week Table` view (habit x day matrix + day notes)
- `Month Heatmap` view (habit-by-day completion matrix)
- `Full Month` calendar view with per-day habit toggles
- One-tap `Strength Training` quick button
- 10 default habits preloaded
- Google Sheets cloud sync with local cache for faster relaunch + auth/session continuity
- Google Sign-In gated sync (allowlist one email)
- Automatic cloud pull/push after sign-in

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

- Primary durable data lives in your Google Sheet through Apps Script sync.
- A browser local cache is used for quicker startup and longer sign-in continuity.

## Security before publishing

- Never commit real tokens or deployment URLs to this repo.
- Keep `cloud-config.js` as placeholders in public repos.
- If a token was previously committed, rotate it in Apps Script Script Properties.
