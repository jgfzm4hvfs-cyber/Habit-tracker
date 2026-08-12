# Google Sheets + Google Login Setup (Discipline OS)

This setup makes sync available on the public website, but only for your Google account.

## 1) Create Google OAuth client (Web)

1. Open your Apps Script project.
2. `Project Settings` -> open linked Google Cloud project.
3. In Google Cloud: `APIs & Services` -> `Credentials` -> `Create Credentials` -> `OAuth client ID`.
4. Type: `Web application`.
5. Add Authorized JavaScript origins:
   - `https://jgfzm4hvfs-cyber.github.io`
   - `http://localhost:4173` (optional local testing)
6. Copy the generated Client ID.

## 2) Configure Apps Script code

1. In Google Sheet: `Extensions` -> `Apps Script`.
2. Replace Apps Script `Code.gs` with `google-apps-script/Code.gs`.
3. Save.

## 3) Set required Script properties

In Apps Script `Project Settings` -> `Script properties`, add:

- `HABIT_TRACKER_SPREADSHEET_ID` = spreadsheet ID from sheet URL
- `HABIT_TRACKER_ALLOWED_EMAIL` = your Google email (lowercase)
- `HABIT_TRACKER_GOOGLE_CLIENT_ID` = OAuth Client ID from step 1

Only if you use the daily Telegram reminder:

- `HABIT_TRACKER_TELEGRAM_BOT_TOKEN` = bot token from @BotFather
- `HABIT_TRACKER_TELEGRAM_CHAT_ID` = your Telegram chat ID

These two are read at send time. Leave them unset and the reminder simply
skips with a note in the log. Keep them here rather than in `Code.gs` — that
file is mirrored to a public repo.

## 4) Deploy web app

1. `Deploy` -> `New deployment`.
2. Type: `Web app`.
3. `Execute as`: `Me`.
4. `Who has access`: `Anyone`.
5. Deploy and copy URL ending in `/exec`.

## 5) Configure frontend placeholders

Edit `cloud-config.js`:

```js
window.DISCIPLINE_OS_CLOUD_CONFIG = {
  enabled: true,
  webAppUrl: "https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec",
  userId: "default",
};

window.DISCIPLINE_OS_AUTH_CONFIG = {
  googleClientId: "REPLACE_WITH_GOOGLE_CLIENT_ID",
  allowedEmail: "you@example.com",
};
```

## 6) Verify

1. Open app website.
2. Sign in with Google.
3. Confirm only your allowed email can sync.
4. Tick a habit and verify `state_store` updates in the sheet.
