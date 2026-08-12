const SHEET_NAME = 'state_store';
const HEADERS = ['user_id', 'updated_at', 'state_json'];
const SPREADSHEET_ID_PROPERTY = 'HABIT_TRACKER_SPREADSHEET_ID';
const ALLOWED_EMAIL_PROPERTY = 'HABIT_TRACKER_ALLOWED_EMAIL';
const GOOGLE_CLIENT_ID_PROPERTY = 'HABIT_TRACKER_GOOGLE_CLIENT_ID';
const SESSION_SECRET_PROPERTY = 'HABIT_TRACKER_SESSION_SECRET';
const TELEGRAM_BOT_TOKEN_PROPERTY = 'HABIT_TRACKER_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID_PROPERTY = 'HABIT_TRACKER_TELEGRAM_CHAT_ID';
const SESSION_LIFETIME_SECONDS = 90 * 24 * 60 * 60; // 90 days

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
    const idToken = String(req.idToken || '').trim();
    const sessionToken = String(req.sessionToken || '').trim();
    const userId = sanitizeUserId_(req.userId || 'default');

    // exchange-token is special: requires a fresh Google ID token, returns a session token.
    if (action === 'exchange-token') {
      if (!idToken) {
        throw new Error('Google ID token required for exchange');
      }
      const tokenInfo = assertGoogleIdTokenValid_(idToken);
      const email = String(tokenInfo.email || '').trim().toLowerCase();
      const newSessionToken = issueSessionToken_(email);
      ensureSheet_();
      return json_({
        ok: true,
        sessionToken: newSessionToken,
        expiresAt: new Date(
          (Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS) * 1000,
        ).toISOString(),
      });
    }

    // For all other actions: accept either session token OR Google ID token.
    const authToken = sessionToken || idToken;
    assertAuthorized_(authToken);
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

/**
 * Dispatches to the correct verifier based on token shape.
 * - Session tokens (issued by this server): 2 dot-separated parts (payload.signature)
 * - Google ID tokens: 3 dot-separated parts (header.payload.signature)
 */
function assertAuthorized_(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Unauthorized');
  }
  const dotCount = (token.match(/\./g) || []).length;
  if (dotCount === 1) {
    verifySessionToken_(token);
  } else if (dotCount === 2) {
    assertGoogleIdTokenValid_(token);
  } else {
    throw new Error('Unauthorized');
  }
}

/**
 * Verifies a Google ID token against the allowlist and Client ID, and returns the parsed info.
 * Throws on any verification failure.
 */
function assertGoogleIdTokenValid_(idToken) {
  const allowedEmail = String(
    PropertiesService.getScriptProperties().getProperty(ALLOWED_EMAIL_PROPERTY) || '',
  ).trim().toLowerCase();
  if (!allowedEmail) {
    throw new Error('Server email allowlist not configured');
  }

  const expectedClientId = String(
    PropertiesService.getScriptProperties().getProperty(GOOGLE_CLIENT_ID_PROPERTY) || '',
  ).trim();
  if (!expectedClientId) {
    throw new Error('Server Google Client ID not configured');
  }

  if (!idToken) {
    throw new Error('Unauthorized');
  }

  const tokenInfo = verifyGoogleIdToken_(idToken);
  const tokenEmail = String(tokenInfo.email || '').trim().toLowerCase();
  const tokenAudience = String(tokenInfo.aud || '').trim();
  const emailVerified = String(tokenInfo.email_verified || '').toLowerCase() === 'true';
  const expSeconds = Number(tokenInfo.exp || 0);

  if (!tokenEmail || !emailVerified) {
    throw new Error('Unauthorized');
  }
  if (tokenAudience !== expectedClientId) {
    throw new Error('Unauthorized');
  }
  if (tokenEmail !== allowedEmail) {
    throw new Error('Unauthorized');
  }
  if (!Number.isFinite(expSeconds) || expSeconds <= Math.floor(Date.now() / 1000) - 30) {
    throw new Error('Unauthorized');
  }

  return tokenInfo;
}

function verifyGoogleIdToken_(idToken) {
  const endpoint = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken));
  let response;
  try {
    response = UrlFetchApp.fetch(endpoint, {
      method: 'get',
      muteHttpExceptions: true,
    });
  } catch (error) {
    throw new Error('Auth verification failed');
  }

  if (!response || response.getResponseCode() !== 200) {
    throw new Error('Unauthorized');
  }

  let parsed;
  try {
    parsed = JSON.parse(response.getContentText() || '{}');
  } catch (error) {
    throw new Error('Unauthorized');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unauthorized');
  }

  return parsed;
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

function authorizeUrlFetch_() {
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=invalid", {
    muteHttpExceptions: true,
  });
  Logger.log(r.getResponseCode());
}

// =============================================================================
// Session tokens (server-issued, HMAC-signed, 90-day lifetime)
// =============================================================================

/**
 * Returns the HMAC signing secret, generating one on first use.
 * Stored in Script Properties so tokens survive across deployments.
 * Rotating this value invalidates all outstanding session tokens.
 */
function getOrCreateSessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty(SESSION_SECRET_PROPERTY);
  if (!secret) {
    // Mix UUIDs and time for ~256 bits of entropy.
    const entropy =
      Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + String(Date.now());
    const hashBytes = Utilities.computeHmacSha256Signature(entropy, String(Date.now()));
    secret = hashBytes
      .map(function (b) {
        return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
      })
      .join('');
    props.setProperty(SESSION_SECRET_PROPERTY, secret);
  }
  return secret;
}

/**
 * Call this from the Apps Script editor to invalidate ALL session tokens
 * (e.g. if you think one leaked). Next request from any device will force re-login.
 */
function rotateSessionSecret() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(SESSION_SECRET_PROPERTY);
  getOrCreateSessionSecret_(); // regenerate
  Logger.log('Session secret rotated. All existing session tokens are now invalid.');
}

function base64UrlEncode_(data) {
  return String(Utilities.base64EncodeWebSafe(data)).replace(/=+$/, '');
}

function base64UrlDecodeToString_(b64url) {
  let padded = b64url;
  while (padded.length % 4 !== 0) padded += '=';
  const bytes = Utilities.base64DecodeWebSafe(padded);
  return Utilities.newBlob(bytes).getDataAsString('utf-8');
}

function issueSessionToken_(email) {
  const secret = getOrCreateSessionSecret_();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: String(email || '').toLowerCase(),
    iat: now,
    exp: now + SESSION_LIFETIME_SECONDS,
    v: 1,
  };
  const payloadB64 = base64UrlEncode_(JSON.stringify(payload));
  const signatureBytes = Utilities.computeHmacSha256Signature(payloadB64, secret);
  const signatureB64 = base64UrlEncode_(signatureBytes);
  return payloadB64 + '.' + signatureB64;
}

function verifySessionToken_(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Unauthorized');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Unauthorized');
  }
  const payloadB64 = parts[0];
  const signatureB64 = parts[1];

  const secret = getOrCreateSessionSecret_();
  const expectedBytes = Utilities.computeHmacSha256Signature(payloadB64, secret);
  const expectedB64 = base64UrlEncode_(expectedBytes);

  if (!constantTimeEquals_(signatureB64, expectedB64)) {
    throw new Error('Unauthorized');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString_(payloadB64));
  } catch (e) {
    throw new Error('Unauthorized');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < now) {
    throw new Error('Session expired');
  }

  const allowedEmail = String(
    PropertiesService.getScriptProperties().getProperty(ALLOWED_EMAIL_PROPERTY) || '',
  ).trim().toLowerCase();
  if (!allowedEmail) {
    throw new Error('Server email allowlist not configured');
  }

  if (String(payload.email || '').toLowerCase() !== allowedEmail) {
    throw new Error('Unauthorized');
  }

  return payload;
}

function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// =============================================================================
// Daily reminder (Telegram bot push notification)
// =============================================================================

// Bot token and chat id live in Script Properties, never in this file — it is
// mirrored to a public repo. Set them once under
// Project Settings → Script Properties (see SETUP.md).
const APP_URL = 'https://jgfzm4hvfs-cyber.github.io/Habit-tracker/';
const REMINDER_USER_ID = 'default';
const REMINDER_MESSAGE =
  "🔔 <b>Discipline OS</b>\n\nYou haven't logged any habits today.";

/**
 * Time-driven trigger target. Reads state from the Sheet, counts today's
 * completions, and sends an ntfy notification only if zero are logged.
 * Safe to run manually (Run ▶) to force a check right now.
 */
function dailyReminderCheck() {
  try {
    ensureSheet_();
    const row = findUserRow_(REMINDER_USER_ID);
    if (!row) {
      Logger.log('No state row yet; sending reminder anyway.');
      sendTelegramReminder_();
      return;
    }

    const rawState = String(row.values[2] || '');
    let state;
    try {
      state = rawState ? JSON.parse(rawState) : {};
    } catch (error) {
      Logger.log('State JSON parse failed: ' + error);
      state = {};
    }

    const tz = Session.getScriptTimeZone() || 'Etc/UTC';
    const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    let completedToday = 0;
    const entries = state && state.entries ? state.entries : {};
    Object.keys(entries).forEach(function (habitId) {
      const byDate = entries[habitId] || {};
      const entry = byDate[todayKey];
      if (entry && entry.completed) {
        completedToday += 1;
      }
    });

    Logger.log('Completed today: ' + completedToday);
    if (completedToday === 0) {
      sendTelegramReminder_();
    } else {
      Logger.log('User already logged ' + completedToday + ' habit(s); no reminder sent.');
    }
  } catch (error) {
    Logger.log('dailyReminderCheck failed: ' + error);
  }
}

function sendTelegramReminder_() {
  const props = PropertiesService.getScriptProperties();
  const token = String(props.getProperty(TELEGRAM_BOT_TOKEN_PROPERTY) || '').trim();
  const chatId = String(props.getProperty(TELEGRAM_CHAT_ID_PROPERTY) || '').trim();
  // Fail loudly instead of firing a malformed request at Telegram, so a missing
  // property shows up as a clear log line rather than a silent 404.
  if (!token || !chatId) {
    Logger.log(
      'Telegram reminder skipped: set ' +
        TELEGRAM_BOT_TOKEN_PROPERTY +
        ' and ' +
        TELEGRAM_CHAT_ID_PROPERTY +
        ' in Project Settings → Script Properties.',
    );
    return;
  }

  const endpoint = 'https://api.telegram.org/bot' + token + '/sendMessage';
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    payload: {
      chat_id: chatId,
      text: REMINDER_MESSAGE,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
    },
    muteHttpExceptions: true,
  });
  Logger.log('Telegram status: ' + response.getResponseCode() + ' — ' + response.getContentText().slice(0, 200));
}

/**
 * Run this ONCE from the Apps Script editor to schedule the 8:00 PM daily
 * reminder trigger. Safe to re-run — it removes any existing triggers for
 * dailyReminderCheck first, then creates a fresh one.
 */
function setupDailyTrigger() {
  removeDailyTriggers();
  ScriptApp.newTrigger('dailyReminderCheck')
    .timeBased()
    .everyDays(1)
    .atHour(20) // 8 PM in the script's timezone
    .create();
  Logger.log('Daily 8 PM trigger created. Timezone: ' + Session.getScriptTimeZone());
}

function removeDailyTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'dailyReminderCheck') {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  Logger.log('Removed ' + removed + ' existing reminder trigger(s).');
}

/**
 * Run this from the Apps Script editor to send a test notification right now
 * (bypasses the "zero habits today" check). Useful for confirming setup.
 */
function testTelegramNotification() {
  sendTelegramReminder_();
}
