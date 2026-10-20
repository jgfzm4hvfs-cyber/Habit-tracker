const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the application's real sync functions with synthetic state, storage,
// clocks and HTTP responses. No browser profile or live endpoint is accessed.
const appPath = path.resolve(process.argv[2] || path.join(__dirname, 'app.js'));
const source = fs.readFileSync(appPath, 'utf8');
const functionNames = [
  'scheduleCloudPush', 'pushToCloud', 'stopCloudPushForConflict',
  'backupLocalDataBeforePull', 'requestCloudApi', 'pullFromCloud',
  'buildCloudPayload', 'persistState', 'saveStateLocally', 'testCloudConnection',
];
function extractFunction(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `Missing function: ${name}`);
  const tail = source.slice(start + 1);
  const next = tail.search(/^  (?:async )?function /m);
  assert.notEqual(next, -1, `Missing function boundary: ${name}`);
  return source.slice(start, start + 1 + next);
}
const syncSource = functionNames.map(extractFunction).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const OLD = '2026-10-20T10:00:00.000Z';
const REMOTE = '2026-10-20T11:00:00.000Z';
const NEXT = '2026-10-20T12:00:00.000Z';

function harness(options = {}) {
  const storage = new Map();
  const timers = new Map();
  const requests = [];
  const confirms = [];
  const events = [];
  let timerId = 0;
  const initialState = {
    cloud: { enabled: true, userId: 'synthetic', webAppUrl: 'https://example.invalid/sync', lastSyncedAt: OLD },
    auth: { email: 'synthetic@example.invalid', idToken: 'fake-id', sessionToken: 'fake-session', sessionExpiresAt: NEXT, signedIn: true },
    amulet: { wallet: 430 }, entries: { reading: { today: { completed: false } } },
  };
  const context = {
    state: copy(initialState),
    cloudRuntime: { inFlight: false, pushTimer: null, pullTimer: null, hasLocalChanges: true, changeRevision: 1, pushBlockedByConflict: false },
    LOCAL_STATE_KEY: 'test-state', LOCAL_PENDING_KEY: 'test-pending',
    LOCAL_PULL_BACKUPS_KEY: 'test-backups',
    CLOUD_CONFLICT_MESSAGE: 'Newer cloud data available. Open sync settings to review.',
    CLOUD_SYNC_DEBOUNCE_MS: 450, CLOUD_PUSH_RETRY_MS: 1400, CLOUD_PUSH_ERROR_RETRY_MS: 15000,
    canUseCloudSync: () => true, hasValidSessionToken_: () => true,
    isJwtExpired: () => false, isSessionTokenExpiredAt_: () => false,
    getErrorMessage: error => error.message, cloneData: copy, normalizeState: copy,
    hasMeaningfulLocalData: () => true,
    renderAll: () => {}, renderSyncPanel: () => {}, renderAuthIndicators: () => {},
    updateSyncStatus: (status, message) => { context.cloudRuntime.status = status; context.cloudRuntime.message = message; },
    clearTimeout: id => timers.delete(id),
  };
  context.window = {
    confirm: message => { confirms.push(message); return options.confirm !== false; },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    localStorage: {
      getItem: key => options.unverifiable && key === 'test-backups' ? null : storage.get(key) ?? null,
      setItem: (key, value) => {
        if (options.backupFailure && key === 'test-backups') throw new Error('quota');
        events.push({ key, value }); storage.set(key, value);
      },
      removeItem: key => storage.delete(key),
    },
  };
  context.fetch = async (url, request) => {
    assert.equal(url, 'https://example.invalid/sync');
    const body = JSON.parse(request.body);
    requests.push(body);
    let result;
    if (options.respond) result = await options.respond(body, context, requests);
    else if (body.action === 'ping') result = { ok: true, updatedAt: options.remoteAt ?? OLD };
    else if (body.action === 'sync') result = { ok: true, updatedAt: options.remoteAt ?? REMOTE, state: { ...copy(initialState), amulet: { wallet: 700 } } };
    else result = { ok: true, updatedAt: NEXT };
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  vm.createContext(context);
  vm.runInContext(`"use strict";\n${syncSource}`, context);
  return { c: context, storage, timers, requests, confirms, events };
}

let passed = 0;
async function test(name, fn) {
  await fn(); passed += 1; console.log(`ok ${passed} - ${name}`);
}

(async () => {
  await test('matching auto push pings first and sends compare-and-swap timestamp', async () => {
    const h = harness();
    assert.equal(await h.c.pushToCloud(), true);
    assert.deepEqual(h.requests.map(r => r.action), ['ping', 'push']);
    assert.equal(h.requests[1].expectedUpdatedAt, OLD);
    assert.equal(h.c.state.cloud.lastSyncedAt, NEXT);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, false);
    assert.equal(h.storage.has('test-pending'), false);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.requests[1].state.auth, { email: '', idToken: '', signedIn: false });
    assert.equal(h.requests[1].state.cloud.webAppUrl, undefined);
  });
  await test('stale automatic push preserves local records, clears timers and persists pending marker', async () => {
    const h = harness({ remoteAt: REMOTE });
    const original = copy(h.c.state);
    h.c.cloudRuntime.pushTimer = h.c.window.setTimeout(() => {}, 1);
    assert.equal(await h.c.pushToCloud(), false);
    assert.deepEqual(h.requests.map(r => r.action), ['ping']);
    assert.deepEqual(copy(h.c.state), original);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, true);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.equal(h.timers.size, 0);
    assert.match(h.c.cloudRuntime.message, /Newer cloud data/);
    assert.equal(h.confirms.length, 0);
    await h.c.pushToCloud();
    h.c.scheduleCloudPush();
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
  });
  await test('an empty cloud timestamp also blocks a stale automatic push', async () => {
    const h = harness({ remoteAt: '' });
    assert.equal(await h.c.pushToCloud(), false);
    assert.equal(h.requests.length, 1);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, true);
  });
  await test('manual conflict cancel cannot upload or discard pending changes', async () => {
    const h = harness({ remoteAt: REMOTE, confirm: false });
    assert.equal(await h.c.pushToCloud({ reason: 'manual' }), false);
    assert.equal(h.confirms.length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.c.state.amulet.wallet, 430);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.equal(h.timers.size, 0);
  });
  await test('manual conflict confirmation uses current server timestamp and unblocks after success', async () => {
    const h = harness({ remoteAt: REMOTE });
    h.c.cloudRuntime.pushBlockedByConflict = true;
    assert.equal(await h.c.pushToCloud({ reason: 'manual' }), true);
    assert.equal(h.confirms.length, 1);
    assert.deepEqual(h.requests.map(r => r.action), ['ping', 'push']);
    assert.equal(h.requests[1].expectedUpdatedAt, REMOTE);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, false);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, false);
  });
  await test('manual first push into empty cloud needs no overwrite confirmation', async () => {
    const h = harness({ remoteAt: '' });
    h.c.state.cloud.lastSyncedAt = '';
    assert.equal(await h.c.pushToCloud({ reason: 'manual' }), true);
    assert.equal(h.requests[1].expectedUpdatedAt, '');
    assert.equal(h.confirms.length, 0);
  });
  await test('first automatic sync still requires an explicit choice', async () => {
    const h = harness();
    h.c.state.cloud.lastSyncedAt = '';
    assert.equal(await h.c.pushToCloud(), false);
    assert.equal(h.requests.length, 0);
  });
  await test('server race conflict propagates structured error and stops retries', async () => {
    const h = harness({ respond: async body => body.action === 'ping'
      ? { ok: true, updatedAt: OLD }
      : { ok: false, error: 'Cloud data changed on another device', code: 'SYNC_CONFLICT' } });
    assert.equal(await h.c.pushToCloud(), false);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, true);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, true);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.equal(h.timers.size, 0);
    assert.match(h.c.cloudRuntime.message, /Newer cloud data/);
  });
  await test('request helper preserves backend conflict code', async () => {
    const h = harness({ respond: async () => ({ ok: false, error: 'Changed', code: 'SYNC_CONFLICT' }) });
    await assert.rejects(h.c.requestCloudApi('push', {}), error => error.code === 'SYNC_CONFLICT');
  });
  await test('ordinary network failure preserves pending state and schedules one retry', async () => {
    const h = harness({ respond: async () => { throw new Error('offline'); } });
    assert.equal(await h.c.pushToCloud(), false);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, false);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, 15000);
    assert.match(h.c.cloudRuntime.message, /Push pending: Network request failed/);
  });
  await test('an edit during ping is included in the uploaded revision', async () => {
    const h = harness({ respond: async (body, c) => {
      if (body.action === 'ping') { c.state.amulet.wallet = 440; c.cloudRuntime.changeRevision += 1; return { ok: true, updatedAt: OLD }; }
      return { ok: true, updatedAt: NEXT };
    } });
    assert.equal(await h.c.pushToCloud(), true);
    assert.equal(h.requests[1].state.amulet.wallet, 440);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, false);
    assert.equal(h.timers.size, 0);
  });
  await test('an edit during upload remains pending for the next upload', async () => {
    const h = harness({ respond: async (body, c) => {
      if (body.action === 'ping') return { ok: true, updatedAt: OLD };
      c.state.amulet.wallet = 440; c.cloudRuntime.changeRevision += 1;
      return { ok: true, updatedAt: NEXT };
    } });
    assert.equal(await h.c.pushToCloud(), true);
    assert.equal(h.requests[1].state.amulet.wallet, 430);
    assert.equal(h.c.state.amulet.wallet, 440);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, true);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.equal(h.timers.size, 1);
  });
  await test('manual pull saves an auth-free backup before replacing local records', async () => {
    const h = harness();
    h.c.cloudRuntime.pushBlockedByConflict = true;
    h.c.cloudRuntime.pushTimer = h.c.window.setTimeout(() => {}, 1);
    assert.equal(await h.c.pullFromCloud({ interactive: true }), true);
    const backups = JSON.parse(h.storage.get('test-backups'));
    assert.equal(backups.length, 1);
    assert.equal(backups[0].state.amulet.wallet, 430);
    assert.deepEqual(backups[0].state.auth, { email: '', idToken: '', signedIn: false });
    assert.equal(backups[0].state.cloud.webAppUrl, undefined);
    assert.equal(h.events[0].key, 'test-backups');
    assert.equal(h.c.state.amulet.wallet, 700);
    assert.equal(h.c.state.auth.sessionToken, 'fake-session');
    assert.equal(h.c.cloudRuntime.hasLocalChanges, false);
    assert.equal(h.c.cloudRuntime.pushBlockedByConflict, false);
    assert.equal(h.timers.size, 0);
  });
  await test('backup history keeps only the latest three snapshots', async () => {
    const h = harness();
    for (let wallet = 1; wallet <= 5; wallet++) {
      h.c.state.amulet.wallet = wallet;
      h.c.backupLocalDataBeforePull();
    }
    assert.deepEqual(JSON.parse(h.storage.get('test-backups')).map(b => b.state.amulet.wallet), [5, 4, 3]);
  });
  await test('backup write failure aborts pull with local records and pending marker intact', async () => {
    const h = harness({ backupFailure: true });
    h.c.saveStateLocally();
    assert.equal(await h.c.pullFromCloud({ interactive: true }), false);
    assert.equal(h.c.state.amulet.wallet, 430);
    assert.equal(h.c.cloudRuntime.hasLocalChanges, true);
    assert.equal(h.storage.get('test-pending'), '1');
    assert.match(h.c.cloudRuntime.message, /data has not been replaced/);
  });
  await test('unverifiable backup fails closed', async () => {
    const h = harness({ unverifiable: true });
    assert.equal(await h.c.pullFromCloud({ interactive: true }), false);
    assert.equal(h.c.state.amulet.wallet, 430);
    assert.match(h.c.cloudRuntime.message, /data has not been replaced/);
  });
  await test('invalid existing backup history is preserved and blocks replacement', async () => {
    const h = harness();
    h.storage.set('test-backups', '{unreadable');
    assert.equal(await h.c.pullFromCloud({ interactive: true }), false);
    assert.equal(h.storage.get('test-backups'), '{unreadable');
    assert.equal(h.c.state.amulet.wallet, 430);
  });
  await test('cancelled pull creates no backup and preserves local records', async () => {
    const h = harness({ confirm: false });
    assert.equal(await h.c.pullFromCloud({ interactive: true }), false);
    assert.equal(h.storage.has('test-backups'), false);
    assert.equal(h.c.state.amulet.wallet, 430);
  });
  await test('interactive pull can discard pending edits even when cloud timestamp matches', async () => {
    const h = harness({ remoteAt: OLD });
    assert.equal(await h.c.pullFromCloud({ interactive: true }), true);
    assert.equal(h.confirms.length, 1);
    assert.equal(h.c.state.amulet.wallet, 700);
    assert.equal(JSON.parse(h.storage.get('test-backups'))[0].state.amulet.wallet, 430);
  });
  await test('a connection test does not hide an unresolved conflict', async () => {
    const h = harness();
    h.c.cloudRuntime.pushBlockedByConflict = true;
    assert.equal(await h.c.testCloudConnection(), true);
    assert.match(h.c.cloudRuntime.message, /Newer cloud data/);
  });
  console.log(`${passed} client sync safety tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
