const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ROOT = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '../..');
const KEY = 'discipline_os_state_v2';
const PENDING = 'discipline_os_pending_v1';
const BASELINE = 'discipline_os_sync_base_v1';
const RECOVERY = 'discipline_os_sync_recovery_v1';
const DAY = '2026-10-20';
const PRIOR = '2026-10-20T10:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
function harness(options = {}) {
  const storage = options.storage || new Map(Object.entries(options.seed || {}));
  const timers = new Map(); const faults = {}; const confirms = []; let tid = 0;
  const localStorage = {
    get length() { return storage.size; },
    key(index) { return [...storage.keys()][index] ?? null; },
    getItem(key) { if (faults.verifyBaseline && key === BASELINE) return null; if (faults.verifyBackup && key === RECOVERY) return null; return storage.get(key) ?? null; },
    setItem(key, value) { if ((faults.failBaseline && key === BASELINE) || (faults.failBackup && key === RECOVERY)) throw Error('synthetic storage quota'); storage.set(key, String(value)); },
    removeItem: key => storage.delete(key),
  };
  const document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, hidden: false };
  const setTimeout = (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const window = { localStorage, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, confirm: message => { confirms.push(message); if (typeof options.confirm === 'function') return options.confirm(message); if (options.confirm !== undefined) return Boolean(options.confirm); throw Error('Automatic sync must not ask for manual push/pull'); } };
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T12:00:00Z'])); } static now() { return Date.parse('2026-10-22T12:00:00Z'); } }
  const context = vm.createContext({ window, document, navigator: {}, URL, Date: TestDate, Intl, Map, Set, Math, Number, String, Boolean, Array, Object, JSON, Uint8Array, atob: s => Buffer.from(s, 'base64').toString('binary'), setTimeout, clearTimeout, clearInterval: () => {}, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'amulet.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sync-merge.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  source = source.replace(/  window\.Amulet\.mount\(\{[\s\S]*?\n  \}\);/, '');
  source = source.replace('  initialize();', '  // No UI, real browser storage, or live network in this harness.');
  const cut = source.lastIndexOf('})();');
  source = source.slice(0, cut) + `
    renderAll = () => {}; renderSyncPanel = () => {};
    window.__sync = { persistState, normalizeState, pushToCloud, pullFromCloud, synchronizeCloud,
      bootstrapCloudSyncNow, scheduleCloudPush, buildCloudPayload, readSyncBaseline, writeSyncBaseline,
      backupSyncRecovery, applyCloudSnapshot, reviewWalletSync, testCloudConnection, readPendingSyncDrafts, savePendingSyncDraft, acknowledgeSyncDrafts,
      draftKey: LOCAL_DRAFT_KEY,
      runtime: cloudRuntime, getState: () => state,
      setState: value => { state = normalizeState(value); },
      setRequest: fn => { requestCloudApi = fn; }, setOnline: fn => { canUseCloudSync = fn; }
    };
  ` + source.slice(cut);
  vm.runInContext(source, context);
  const api = window.__sync;
  api.setOnline(() => options.online !== false);
  api.getState().cloud = { enabled: true, webAppUrl: 'https://example.invalid/sync', userId: 'synthetic', lastSyncedAt: api.getState().cloud.lastSyncedAt || PRIOR };
  api.getState().auth = { email: 'synthetic@example.invalid', idToken: 'synthetic-private-id', sessionToken: 'synthetic-private-session', sessionExpiresAt: '2027-01-20T10:00:00Z', signedIn: true };
  if (options.state) api.setState(options.state);
  return { ...api, storage, timers, faults, confirms, context };
}
function server(initial, updatedAt = PRIOR) {
  let state = initial == null ? null : copy(initial); let timestamp = state ? updatedAt : ''; let revision = 0;
  const requests = []; const hooks = { before: null, after: null };
  const api = {
    requests, hooks, get: () => ({ state: copy(state), updatedAt: timestamp }),
    replace(value) { state = copy(value); timestamp = `2026-10-22T12:${String(++revision).padStart(2, '0')}:00.000Z`; return timestamp; },
    async request(action, payload = {}) {
      requests.push({ action, ...copy(payload) });
      if (hooks.before) await hooks.before(action, payload, api);
      if (action === 'sync') return { state: copy(state), updatedAt: timestamp };
      if (action !== 'push') throw Error(`Unexpected action ${action}`);
      if (payload.expectedUpdatedAt !== timestamp) { const error = Error('Cloud changed'); error.code = 'SYNC_CONFLICT'; throw error; }
      api.replace(payload.state);
      if (hooks.after) await hooks.after(action, payload, api);
      return { updatedAt: timestamp };
    },
  };
  return api;
}
function connect(h, cloud, { baseline = true } = {}) {
  h.setRequest((action, payload) => cloud.request(action, payload));
  if (baseline && cloud.get().state) h.writeSyncBaseline(cloud.get().state, cloud.get().updatedAt);
  return h;
}
function award(h, { id = 'award-read', habit = 'am_read', amount = 1000, date = DAY } = {}) {
  h.getState().amulet.ledger.push({ id, type: 'earn', habitId: habit, date, at: '2026-10-20T12:00:00.000Z', label: habit, amountOre: amount });
  h.persistState();
}
function note(h, value, date = DAY) { h.getState().dayNotes[date] = value; h.persistState(); }
function eventIds(snapshot) { return [...snapshot.amulet.ledger.map(e => e.id)].sort(); }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
module.exports = { ROOT, harness, server, connect, award, note, eventIds, flush, copy, KEY, PENDING, BASELINE, RECOVERY, DAY, PRIOR };
