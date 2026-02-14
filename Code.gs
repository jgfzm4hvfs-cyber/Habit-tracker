const SHEET_NAME = 'state_store';
const HEADERS = ['user_id', 'updated_at', 'state_json'];
const TOKEN_PROPERTY = 'HABIT_TRACKER_API_TOKEN';
const SPREADSHEET_ID_PROPERTY = 'HABIT_TRACKER_SPREADSHEET_ID';

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const req = parseRequest_(e);
    const action = String(req.action || '').trim();
    const token = String(req.token || '').trim();
    const userId = sanitizeUserId_(req.userId || 'default');

    assertAuthorized_(token);
    ensureSheet_();

    if (action === 'ping') {
      const row = findUserRow_(userId);
      return json_({
        ok: true,
        updatedAt: row ? String(row.values[1] || '') : '',
      });
    }

    if (action === 'sync') {
      const row = findUserRow_(userId);
      if (!row) {
        return json_({ ok: true, updatedAt: '', state: null });
      }

      let parsedState = null;
      const rawState = String(row.values[2] || '');
      if (rawState) {
        try {
          parsedState = JSON.parse(rawState);
        } catch (error) {
          parsedState = null;
        }
      }

      return json_({
        ok: true,
        updatedAt: String(row.values[1] || ''),
        state: parsedState,
      });
    }

    if (action === 'push') {
      if (!req.state || typeof req.state !== 'object') {
        throw new Error('Missing state payload');
      }

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const updatedAt = new Date().toISOString();
        const stateJson = JSON.stringify(req.state);
        upsertUserState_(userId, updatedAt, stateJson);
        return json_({ ok: true, updatedAt: updatedAt });
      } finally {
        lock.releaseLock();
      }
    }

    return json_({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return json_({ ok: false, error: getErrorMessage_(error) });
  }
}

function parseRequest_(e) {
  const query = (e && e.parameter) || {};
  let body = {};

  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (error) {
      body = {};
    }
  }

  const merged = {};
  Object.keys(query).forEach((key) => {
    merged[key] = query[key];
  });
  Object.keys(body).forEach((key) => {
    merged[key] = body[key];
  });

  return merged;
}

function assertAuthorized_(token) {
  const expected = String(PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY) || '').trim();
  if (!expected) {
    throw new Error('Server token not configured');
  }
  if (!token || token !== expected) {
    throw new Error('Unauthorized');
  }
}

function getSpreadsheet_() {
  const configuredId = String(
    PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) || '',
  ).trim();

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (error) {
      throw new Error('Invalid HABIT_TRACKER_SPREADSHEET_ID');
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }

  throw new Error('Spreadsheet not configured. Add HABIT_TRACKER_SPREADSHEET_ID in Script properties.');
}

function ensureSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const mismatch = HEADERS.some((header, idx) => existingHeaders[idx] !== header);
  if (mismatch) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function findUserRow_(userId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === userId) {
      return {
        row: i + 2,
        values: values[i],
      };
    }
  }

  return null;
}

function upsertUserState_(userId, updatedAt, stateJson) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const rowInfo = findUserRow_(userId);

  if (rowInfo) {
    sheet.getRange(rowInfo.row, 1, 1, HEADERS.length).setValues([[userId, updatedAt, stateJson]]);
  } else {
    sheet.appendRow([userId, updatedAt, stateJson]);
  }
}

function sanitizeUserId_(value) {
  const cleaned = String(value || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  return cleaned || 'default';
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function getErrorMessage_(error) {
  if (error && error.message) {
    return String(error.message);
  }
  return String(error || 'Unknown error');
}
