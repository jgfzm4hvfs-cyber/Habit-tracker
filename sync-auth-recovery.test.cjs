const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual client auth functions with synthetic accounts, storage, time,
// Google responses and network requests. No browser or live backend is accessed.
const appPath = path.resolve(process.argv[2] || path.join(__dirname, 'app.js'));
const source = fs.readFileSync(appPath, 'utf8');
const names = [
  'normalizeAuthState', 'readAuthCache', 'persistAuthState', 'adoptStoredAuth',
  'installAuthRecoveryHooks', 'recoverCloudAuthentication', 'promptGoogleRecovery',
  'scheduleSessionExchangeRetry', 'requestCloudApi', 'loadPersistedState',
  'saveStateLocally', 'persistState', 'googleIdentity', 'setGoogleSignInError',
  'initializeGoogleAuth', 'waitForGoogleIdentity', 'renderGoogleSignInButton',
  'handleGoogleCredential', 'exchangeIdTokenForSession', 'signOutGoogle',
  'renderAuthIndicators', 'isJwtExpired', 'isSessionTokenExpiredAt_',
  'hasValidSessionToken_', 'decodeJwtPayload', 'canUseCloudSync',
];
function extract(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, name);
  const end = source.slice(start + 1).search(/^  (?:async )?function /m);
  assert.notEqual(end, -1, name);
  return source.slice(start, start + 1 + end);
}
const code = names.map(extract).join('\n');
const BASE = Date.parse('2026-10-22T10:00:00Z');
const EXPIRY = new Date(BASE + 90 * 86400000).toISOString();
const EMAIL = 'synthetic@example.invalid';
const AUTH_KEY = 'synthetic-auth';
const copy = value => JSON.parse(JSON.stringify(value));
function idToken(expiry = BASE + 3600000, marker = 'one') {
  return `synthetic.${Buffer.from(JSON.stringify({ email: EMAIL, exp: expiry / 1000, marker })).toString('base64url')}.signature`;
}
function auth(overrides = {}) {
  return { email: EMAIL, idToken: idToken(), sessionToken: 'synthetic-session', sessionExpiresAt: EXPIRY, signedIn: true, ...overrides };
}
function harness(options = {}) {
  let now = BASE, serial = 0, prompts = 0, bootstraps = 0;
  const timers = new Map(), requests = [], listeners = new Map();
  const storage = options.storage || new Map();
  class TestDate extends Date { static now() { return now; } }
  const identity = { initialize: () => {}, prompt: () => { prompts++; }, renderButton: () => {}, disableAutoSelect: () => {} };
  const runtime = {
    initialized: true, pending: null, error: '', hooksBound: false,
    exchangePending: null, exchangeId: '', exchangeTimer: null,
    exchangeFailures: 0, nextExchangeAt: 0, authVersion: '', authEpoch: 0,
    explicitSignedOut: false, promptShown: false,
  };
  const c = {
    Date: TestDate, console, atob: value => Buffer.from(value, 'base64').toString('binary'),
    state: { cloud: { enabled: true, userId: 'synthetic', webAppUrl: 'https://example.invalid/sync', lastSyncedAt: 'prior' },
      auth: auth(options.auth), amulet: { wallet: options.wallet ?? 760 }, entries: { reading: true } },
    cloudRuntime: { hasLocalChanges: true, changeRevision: 1 }, googleAuthRuntime: runtime,
    LOCAL_STATE_KEY: 'synthetic-state', LOCAL_PENDING_KEY: 'synthetic-pending', LOCAL_AUTH_KEY: AUTH_KEY,
    AUTH_CONFIG: { googleClientId: 'synthetic-client', allowedEmail: EMAIL },
    refs: { authBadge: {}, authStatusText: {}, signOutBtn: {}, signInBannerBtn: {} },
    renderSignInBanner: () => {}, renderAll: () => {}, showToast: () => {}, scheduleCloudPush: () => {},
    savePendingSyncDraft: () => {}, readPendingSyncDrafts: () => [],
    bootstrapCloudSyncNow: async () => { bootstraps++; return true; },
    updateSyncStatus: (status, message) => { c.cloudRuntime.status = status; c.cloudRuntime.message = message; },
  };
  const listen = (name, callback) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); };
  c.window = {
    google: { accounts: { id: identity } }, addEventListener: listen,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (options.authWriteFails && key === AUTH_KEY) throw new Error('quota'); storage.set(key, value); }, removeItem: key => storage.delete(key) },
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    setInterval: () => ++serial,
  };
  c.document = { hidden: false, addEventListener: listen };
  c.clearTimeout = id => timers.delete(id);
  c.fetch = async (url, request) => {
    assert.equal(url, 'https://example.invalid/sync');
    const body = JSON.parse(request.body); requests.push(body);
    const result = options.respond ? await options.respond(body, c, requests) : body.action === 'exchange-token'
      ? { ok: true, sessionToken: 'replacement-session', expiresAt: EXPIRY }
      : { ok: true, updatedAt: 'newer', state: null };
    return { ok: true, status: 200, text: async () => JSON.stringify(result), json: async () => copy(result) };
  };
  vm.createContext(c); vm.runInContext(code, c);
  return {
    c, storage, timers, requests, runtime,
    prompts: () => prompts, bootstraps: () => bootstraps,
    advance: ms => { now += ms; },
    emit: async (name, event = {}) => { for (const fn of listeners.get(name) || []) fn(event); for (let i = 0; i < 12; i++) await Promise.resolve(); },
  };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`ok ${passed} - ${name}`); }
(async () => {
  await test('90-day session survives ID-token expiry and reload', async () => {
    const h = harness(); h.c.persistAuthState(); h.advance(2 * 86400000);
    const saved = h.c.loadPersistedState();
    assert.equal(saved.auth.idToken, ''); assert.equal(saved.auth.sessionToken, 'synthetic-session');
    assert.equal(saved.auth.signedIn, true);
  });
  await test('fresh Google credential keeps existing durable same-account session during failed exchange', async () => {
    const h = harness({ respond: async () => { throw new Error('offline'); } });
    h.c.handleGoogleCredential({ credential: idToken(BASE + 3600000, 'refresh') });
    await h.runtime.exchangePending;
    assert.equal(h.c.state.auth.sessionToken, 'synthetic-session');
    assert.equal(h.prompts(), 0); assert.equal(h.timers.size, 1);
  });
  await test('exchange is single-flight and retries a temporary failure with backoff', async () => {
    let offline = true;
    const h = harness({ auth: { sessionToken: '', sessionExpiresAt: '' }, respond: async () => {
      if (offline) throw new Error('offline'); return { ok: true, sessionToken: 'recovered', expiresAt: EXPIRY };
    } });
    await Promise.all([h.c.exchangeIdTokenForSession(), h.c.exchangeIdTokenForSession()]);
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 1);
    const timer = [...h.timers.values()][0]; assert.equal(timer.delay, 2000);
    h.advance(timer.delay); offline = false; await timer.fn();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(h.requests.length, 2); assert.equal(h.c.state.auth.sessionToken, 'recovered');
    assert.equal(h.runtime.exchangeFailures, 0);
  });
  await test('startup exchanges a valid ID token left behind by an earlier failed exchange', async () => {
    const h = harness({ auth: { sessionToken: '', sessionExpiresAt: '' } });
    await h.c.initializeGoogleAuth(); await h.runtime.exchangePending;
    assert.equal(h.requests[0].action, 'exchange-token'); assert.equal(h.c.state.auth.sessionToken, 'replacement-session');
  });
  await test('rejected session falls back to Google and retries original request once', async () => {
    const h = harness({ respond: async body => body.sessionToken === 'synthetic-session'
      ? { ok: false, error: 'Unauthorized' }
      : body.action === 'exchange-token' ? { ok: true, sessionToken: 'replacement-session', expiresAt: EXPIRY }
      : { ok: true, updatedAt: 'latest' } });
    const result = await h.c.requestCloudApi('sync');
    assert.equal(result.updatedAt, 'latest');
    assert.deepEqual(h.requests.map(r => r.action), ['sync', 'exchange-token', 'sync']);
    assert.equal(h.requests[2].sessionToken, 'replacement-session'); assert.equal(h.prompts(), 0);
  });
  await test('delayed rejection cannot clear a newer session installed during request', async () => {
    let release;
    const h = harness({ respond: async body => body.sessionToken === 'synthetic-session'
      ? new Promise(resolve => { release = resolve; }) : { ok: true } });
    const pending = h.c.requestCloudApi('sync');
    h.c.state.auth = auth({ idToken: idToken(BASE + 3600000, 'fresh'), sessionToken: 'fresh-session' });
    h.c.persistAuthState(); release({ ok: false, error: 'Unauthorized' });
    await pending;
    assert.equal(h.c.state.auth.sessionToken, 'fresh-session');
    assert.equal(h.requests[1].sessionToken, 'fresh-session'); assert.equal(h.prompts(), 0);
  });
  await test('late exchange cannot restore authentication after explicit sign-out', async () => {
    let release;
    const h = harness({ auth: { sessionToken: '', sessionExpiresAt: '' }, respond: async () => new Promise(resolve => { release = resolve; }) });
    const pending = h.c.exchangeIdTokenForSession(); h.c.signOutGoogle();
    release({ ok: true, sessionToken: 'late-session', expiresAt: EXPIRY });
    assert.equal(await pending, false); assert.equal(h.c.state.auth.sessionToken, '');
    assert.equal(JSON.parse(h.storage.get(AUTH_KEY)).signedOut, true);
  });
  await test('other-tab login adopts only credentials and retains local pending records', async () => {
    const shared = new Map(); const old = harness({ storage: shared, wallet: 760 }); const fresh = harness({ storage: shared });
    old.c.installAuthRecoveryHooks(); fresh.c.installAuthRecoveryHooks();
    fresh.c.state.auth = auth({ sessionToken: 'other-tab-session' }); fresh.c.persistAuthState();
    await old.emit('storage', { key: AUTH_KEY });
    assert.equal(old.c.state.auth.sessionToken, 'other-tab-session'); assert.equal(old.c.state.amulet.wallet, 760);
    assert.equal(old.c.state.entries.reading, true); assert.equal(old.c.cloudRuntime.hasLocalChanges, true);
  });
  await test('stale habit snapshot cannot replace newer separately stored authentication', async () => {
    const shared = new Map(); const stale = harness({ storage: shared }); const fresh = harness({ storage: shared });
    fresh.c.state.auth = auth({ sessionToken: 'newest-session' }); fresh.c.persistAuthState();
    stale.c.saveStateLocally();
    assert.equal(JSON.parse(shared.get('synthetic-state')).auth.sessionToken, 'synthetic-session');
    assert.equal(stale.c.loadPersistedState().auth.sessionToken, 'newest-session');
  });
  await test('storage write failure retains fresh in-memory authentication instead of restoring an old cache', async () => {
    const shared = new Map(); const initial = harness({ storage: shared }); initial.c.persistAuthState();
    const full = harness({ storage: shared, authWriteFails: true }); full.c.adoptStoredAuth();
    full.c.state.auth = auth({ sessionToken: 'fresh-despite-quota' }); full.c.persistAuthState();
    full.c.renderAuthIndicators();
    assert.equal(full.c.state.auth.sessionToken, 'fresh-despite-quota');
    assert.equal(JSON.parse(shared.get(AUTH_KEY)).auth.sessionToken, 'synthetic-session');
  });
  await test('explicit sign-out propagates across tabs without automatic sign-in', async () => {
    const shared = new Map(); const first = harness({ storage: shared }); const second = harness({ storage: shared });
    first.c.installAuthRecoveryHooks(); second.c.installAuthRecoveryHooks(); first.c.signOutGoogle();
    await second.emit('storage', { key: AUTH_KEY }); await second.c.initializeGoogleAuth();
    assert.equal(second.c.state.auth.signedIn, false); assert.equal(second.runtime.explicitSignedOut, true);
    assert.equal(second.prompts(), 0); assert.equal(second.bootstraps(), 0);
    assert.equal(second.c.state.amulet.wallet, 760); assert.equal(second.c.cloudRuntime.hasLocalChanges, true);
  });
  await test('initial render and reload preserve the explicit sign-out marker', async () => {
    const shared = new Map(); const first = harness({ storage: shared }); first.c.signOutGoogle();
    const reopened = harness({ storage: shared });
    reopened.c.renderAuthIndicators(); await reopened.c.initializeGoogleAuth();
    assert.equal(reopened.runtime.explicitSignedOut, true); assert.equal(reopened.prompts(), 0);
    assert.equal(JSON.parse(shared.get(AUTH_KEY)).signedOut, true);
    assert.equal(reopened.c.state.auth.signedIn, false);
  });
  await test('rejected credentials prompt once and keep unsynced records intact', async () => {
    const h = harness({ auth: { idToken: '' }, respond: async () => ({ ok: false, error: 'Unauthorized' }) });
    await assert.rejects(h.c.requestCloudApi('sync'), error => error.code === 'AUTH_REQUIRED');
    await h.c.initializeGoogleAuth();
    assert.equal(h.prompts(), 1); assert.equal(h.requests.length, 1);
    assert.equal(h.c.state.amulet.wallet, 760); assert.equal(h.c.cloudRuntime.hasLocalChanges, true);
  });
  await test('network failure never clears authentication or prompts for Google sign-in', async () => {
    const h = harness({ respond: async () => { throw new Error('offline'); } });
    await assert.rejects(h.c.requestCloudApi('sync'), /Network request failed/);
    assert.equal(h.c.state.auth.sessionToken, 'synthetic-session'); assert.equal(h.prompts(), 0);
  });
  await test('foreground and online recover session acquisition without opening settings', async () => {
    let offline = true;
    const h = harness({ auth: { sessionToken: '', sessionExpiresAt: '' }, respond: async () => {
      if (offline) throw new Error('offline'); return { ok: true, sessionToken: 'online-session', expiresAt: EXPIRY };
    } });
    await h.c.initializeGoogleAuth(); await h.runtime.exchangePending; h.advance(3000); offline = false;
    await h.emit('online');
    assert.equal(h.c.state.auth.sessionToken, 'online-session'); assert.ok(h.bootstraps() > 0);
  });
  console.log(`${passed} authentication recovery tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
