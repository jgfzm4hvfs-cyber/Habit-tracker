# Google Sheets Sync Setup (Discipline OS)

This setup makes your habit data sync across Mac + iPhone using one Google Sheet.

## 1) Create the Google Sheet

1. Create a new Google Sheet in your Google Drive (example name: `Discipline OS Data`).
2. Open it.

## 2) Install backend code

1. In the sheet, go to `Extensions` -> `Apps Script`.
2. Replace all code in Apps Script `Code.gs` with the contents of:
   - `google-apps-script/Code.gs`
3. Save.

## 3) Set script properties (required)

1. In Apps Script, open `Project Settings`.
2. Under `Script properties`, add:
   - Key: `HABIT_TRACKER_API_TOKEN`
   - Value: your secret token (long random string)
3. Add one more:
   - Key: `HABIT_TRACKER_SPREADSHEET_ID`
   - Value: the Spreadsheet ID from your sheet URL
4. Save.

Example sheet URL:

`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit#gid=0`

Use only the `SPREADSHEET_ID_HERE` part as the value.

## 4) Deploy web app

1. Click `Deploy` -> `New deployment`.
2. Type: `Web app`.
3. Execute as: `Me`.
4. Who has access: `Anyone`.
5. Deploy.
6. Copy the Web App URL ending in `/exec`.

## 5) Configure auto-cloud in the app code (one time)

Open:

- `cloud-config.js`

Set:

```js
window.DISCIPLINE_OS_CLOUD_CONFIG = {
  enabled: true,
  webAppUrl: "https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec",
  apiToken: "REPLACE_WITH_YOUR_TOKEN",
  userId: "default",
};
```

With this, you do not need to open Cloud Sync modal every time.

Important for public repos:

- Do not commit real `webAppUrl` + `apiToken` values.
- Keep placeholders in `cloud-config.js` and set real values only in your private/local copy.

## 6) Verify sync

1. Open the app.
2. Tick one habit.
3. In Google Sheet, open tab `state_store`.
4. Confirm row `default` gets updated (column `updated_at` changes after each check/uncheck).

## 7) iPhone + Mac

1. Open the same app URL on both devices.
2. Use the same deployed `cloud-config.js` values.
3. Changes sync automatically (auto push + periodic pull).

## Notes

- `state_store` is created automatically.
- Each `user_id` has one JSON snapshot row.
- If you redeploy Apps Script, update `webAppUrl` in `cloud-config.js`.
- Keep token private.
