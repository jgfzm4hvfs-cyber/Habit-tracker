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
cd "/Users/michael/Desktop/Habit-tracker-main"
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

## Amulet

The nine starter habits are available from October 12, 2026, including backdated check-offs. Newly added habits start on their creation date.

Amulet rewards completed daily habits with a personal spending allowance in Norwegian kroner. It is a virtual wallet, not real money. It includes editable rewards and schedules, completion history, 7- and 30-day rolling progress, withdrawals, a wishlist, and purchase history. Menu → Visible folders hides/restores any main tab without removing its data.

The existing local project stays at `/Users/michael/Desktop/Habit-tracker-main`. Both Codex and Claude Code should edit this same directory, one at a time. `amulet.js` owns the feature and its normalized `state.amulet` slice; `amulet.css` scopes its design. The existing `app.js` handles Google login and saves the complete state through the same Google Sheets sync. No Apps Script redeployment is needed for Amulet.

Money is stored as integer øre. The wallet is derived from its transaction ledger; a daily check-off captures the reward at that moment. Editing/removing a habit does not rewrite past earnings. Undoing a check-off reverses its original reward. Purchasing deducts its saved price once; undoing the purchase refunds it. Removing a habit archives it so earlier progress and earnings remain.

Before publishing an asset change, update the version query strings in `index.html` and `sw.js`, add new offline assets to `APP_ASSETS`, and bump `CACHE_NAME`. Stage only intended files explicitly. Keep credentials out of commits. Local changes appear on the hosted website after they are committed/pushed and GitHub Pages finishes deployment.

## Checks

Run the money/history and sync regression checks with Node (no dependencies needed):

```bash
TZ=Europe/Oslo node tests/amulet-model.cjs
TZ=Europe/Oslo node tests/sync.cjs
node tests/startup.cjs
node tests/service-worker.cjs
```

The checks use isolated in-memory data and never contact your Google Sheet. Phone layouts were also checked at 320, 393 and 402 pixels wide, with desktop at 1280 pixels.

## Startup

The app shows its saved state immediately and syncs with Google Sheets in the background. Only the visible tracker is rendered; other trackers render when opened. The service worker returns cached cloud configuration immediately while refreshing it for the next visit. Pending local edits stay protected during background sync. The first visit on a new device still needs to download the app.
