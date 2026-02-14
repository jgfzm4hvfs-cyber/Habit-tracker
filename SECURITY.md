# Security Checklist

Use this checklist before pushing to a public repository.

## 1) Secrets

- `cloud-config.js` must contain placeholders only.
- No real API token, Web App URL, Spreadsheet ID, or personal email in committed files.
- Rotate token in Apps Script if it was ever shared.

## 2) Files to never commit

- `.DS_Store`
- local secret files (for example `cloud-config.local.js`)
- logs (`*.log`)

## 3) Verify before push

Run:

```bash
rg -n --hidden -S "AKfy|script.google.com/macros/s/|HABIT_TRACKER_API_TOKEN|apiToken\\s*:\\s*\"[^\"]+\"|token\\s*:\\s*\"[^\"]+\"|password|secret"
```

Inspect matches and ensure no real secrets are present.
