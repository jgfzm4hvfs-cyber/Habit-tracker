const assert = require('node:assert/strict');
const { harness, server, connect, award, note, eventIds, flush, copy, KEY, PENDING, BASELINE, RECOVERY, DAY, PRIOR } = require('./tests/helpers/sync-harness.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`ok ${count} - ${name}`); }
(async () => {
  await test('a local change made while downloading is included and never overwritten', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    let release; const original = cloud.request;
    h.setRequest(async (action, payload) => action === 'sync' ? new Promise(resolve => { release = resolve; }) : original(action, payload));
    const syncing = h.synchronizeCloud(); award(h); release(cloud.get());
    assert.equal(await syncing, true); assert.deepEqual(eventIds(h.getState()), ['award-read']);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
  });
  await test('edits during upload remain pending and the baseline describes only the acknowledged upload', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    let release; cloud.hooks.after = () => new Promise(resolve => { release = resolve; });
    const syncing = h.synchronizeCloud(); await flush(); assert.ok(release);
    award(h, { id: 'award-run', habit: 'am_run', amount: 3000 }); release();
    assert.equal(await syncing, true); assert.equal(h.runtime.hasLocalChanges, true); assert.equal(h.storage.get(PENDING), '1');
    assert.deepEqual(eventIds(h.readSyncBaseline().state), ['award-read']);
    assert.deepEqual(eventIds(h.getState()), ['award-read', 'award-run']);
    cloud.hooks.after = null; assert.equal(await h.synchronizeCloud(), true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read', 'award-run']); assert.equal(h.storage.has(PENDING), false);
  });
  await test('a compare-and-swap race downloads again and retains the other device edit', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    let raced = false; cloud.hooks.before = (action, payload, api) => {
      if (action === 'push' && !raced) { raced = true; const remote = api.get().state; remote.dayNotes['2026-10-21'] = 'Racing phone edit'; api.replace(remote); }
    };
    assert.equal(await h.synchronizeCloud(), true);
    assert.deepEqual(cloud.requests.map(r => r.action), ['sync', 'push', 'sync', 'push']);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read']); assert.equal(cloud.get().state.dayNotes['2026-10-21'], 'Racing phone edit');
  });
  await test('a continually busy second device gets bounded attempts and a later retry', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    cloud.hooks.before = (action, payload, api) => { if (action === 'push') api.replace(api.get().state); };
    assert.equal(await h.synchronizeCloud(), false);
    assert.equal(cloud.requests.filter(r => r.action === 'push').length, 3);
    assert.equal(h.runtime.hasLocalChanges, true); assert.equal(h.storage.get(PENDING), '1');
    assert.ok([...h.timers.values()].some(t => t.ms === 1400)); assert.equal(h.runtime.inFlight, false);
  });
  await test('a lost successful-upload response is recovered idempotently with no duplicate award', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    let lost = false; cloud.hooks.after = () => { if (!lost) { lost = true; throw Error('response lost after server committed'); } };
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.runtime.hasLocalChanges, true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    assert.equal(await h.synchronizeCloud(), true); assert.equal(h.runtime.hasLocalChanges, false);
    assert.deepEqual(eventIds(h.getState()), ['award-read']); assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    assert.equal(cloud.requests.filter(r => r.action === 'push').length, 1);
  });
  await test('authentication, endpoint and current navigation remain local when remote records apply', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    const auth = copy(h.getState().auth); h.getState().activeTopTab = 'amulet'; h.getState().viewMode = 'heatmap'; h.getState().sidebarMode = 'analytics';
    const remote = cloud.get().state; remote.auth = { email: 'wrong@example.invalid', idToken: 'remote-secret' }; remote.cloud.webAppUrl = 'https://example.invalid/wrong'; remote.activeTopTab = 'exercise'; remote.dayNotes[DAY] = 'Phone'; cloud.replace(remote);
    assert.equal(await h.synchronizeCloud(), true); assert.deepEqual(copy(h.getState().auth), auth);
    assert.equal(h.getState().cloud.webAppUrl, 'https://example.invalid/sync'); assert.equal(h.getState().cloud.userId, 'synthetic');
    assert.equal(h.getState().activeTopTab, 'amulet'); assert.equal(h.getState().viewMode, 'heatmap'); assert.equal(h.getState().sidebarMode, 'analytics');
  });
  await test('backup failure preserves pending local data and cannot upload a partial merge', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    const remote = cloud.get().state; remote.dayNotes[DAY] = 'Phone'; cloud.replace(remote); const before = copy(h.getState()); h.faults.failBackup = true;
    assert.equal(await h.synchronizeCloud(), false); assert.deepEqual(copy(h.getState()), before);
    assert.equal(cloud.requests.filter(r => r.action === 'push').length, 0); assert.equal(h.storage.get(PENDING), '1');
  });
  await test('unverifiable merge backup cannot replace local data', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    const remote = cloud.get().state; remote.dayNotes[DAY] = 'Phone'; cloud.replace(remote); h.faults.verifyBackup = true;
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.getState().dayNotes[DAY], undefined);
    assert.deepEqual(eventIds(h.getState()), ['award-read']); assert.equal(cloud.requests.filter(r => r.action === 'push').length, 0);
  });
  await test('baseline write failure aborts a clean remote replacement before changing records', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    const remote = cloud.get().state; remote.dayNotes[DAY] = 'Phone'; cloud.replace(remote); h.faults.failBaseline = true;
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.getState().dayNotes[DAY], undefined);
    assert.equal(h.getState().cloud.lastSyncedAt, PRIOR); assert.equal(cloud.requests.filter(r => r.action === 'push').length, 0);
  });
  await test('unverifiable baseline also aborts before replacing a clean local snapshot', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    const remote = cloud.get().state; remote.dayNotes[DAY] = 'Phone'; cloud.replace(remote); h.faults.verifyBaseline = true;
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.getState().dayNotes[DAY], undefined);
  });
  await test('baseline failure after server commit keeps pending state and recovers without duplicating money', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    cloud.hooks.after = () => { h.faults.failBaseline = true; };
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.runtime.hasLocalChanges, true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    h.faults.failBaseline = false; cloud.hooks.after = null;
    assert.equal(await h.synchronizeCloud(), true); assert.equal(cloud.requests.filter(r => r.action === 'push').length, 1);
    assert.deepEqual(eventIds(h.getState()), ['award-read']);
  });
  await test('overlapping requests share a single active sync rather than double uploading', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    let release; h.setRequest((action, payload) => action === 'sync' ? new Promise(resolve => { release = resolve; }) : cloud.request(action, payload));
    const first = h.synchronizeCloud(); assert.equal(await h.synchronizeCloud(), false); release(cloud.get());
    assert.equal(await first, true); assert.equal(cloud.requests.filter(r => r.action === 'push').length, 1);
  });
  await test('clean connectivity failure keeps records and displays automatic reconnection', async () => {
    const h = harness(); const before = copy(h.getState()); h.setRequest(async () => { throw Error('offline'); });
    assert.equal(await h.synchronizeCloud(), false); assert.deepEqual(copy(h.getState()), before);
    assert.equal(h.runtime.hasLocalChanges, false); assert.match(h.runtime.message, /Reconnecting/);
  });
  await test('checking the same habit on two offline devices credits the wallet only once', async () => {
    const first = harness(); const second = harness({ state: first.buildCloudPayload() });
    const cloud = server(first.buildCloudPayload()); connect(first, cloud); connect(second, cloud);
    award(first, { id: 'phone-award' }); award(second, { id: 'computer-award' });
    assert.equal(await first.synchronizeCloud(), true); assert.equal(await second.synchronizeCloud(), true);
    assert.equal(await first.synchronizeCloud(), true);
    for (const snapshot of [first.getState(), second.getState(), cloud.get().state]) {
      assert.equal(snapshot.amulet.ledger.filter(event => event.type === 'earn').length, 1);
      assert.equal(snapshot.amulet.ledger.reduce((sum, event) => sum + event.amountOre, 0), 1000);
    }
  });
  await test('incompatible offline spending preserves both copies and never silently loses a purchase', async () => {
    const first = harness(); award(first); first.runtime.hasLocalChanges = false;
    const initial = first.buildCloudPayload(); const second = harness({ state: initial });
    const cloud = server(initial); connect(first, cloud); connect(second, cloud);
    for (const [h, id] of [[first, 'phone-spend'], [second, 'computer-spend']]) {
      h.getState().amulet.ledger.push({ id, type: 'withdraw', amountOre: -800, label: id, date: DAY, at: '2026-10-20T13:00:00.000Z' }); h.persistState();
    }
    assert.equal(await first.synchronizeCloud(), true);
    assert.equal(await second.synchronizeCloud(), false);
    assert.ok(second.runtime.walletConflict); assert.equal(second.runtime.hasLocalChanges, true);
    assert.ok(eventIds(second.getState()).includes('computer-spend'));
    assert.ok(eventIds(cloud.get().state).includes('phone-spend'));
    const backup = JSON.parse(second.storage.get(RECOVERY))[0];
    assert.ok(eventIds(backup.local).includes('computer-spend')); assert.ok(eventIds(backup.remote).includes('phone-spend'));
    assert.equal(cloud.requests.filter(request => request.action === 'push').length, 1);
  });
  await test('a stale clean tab cannot erase another tab journal and reopening recovers it even if the old flag was cleared', async () => {
    const shared = new Map(); const editing = harness({ storage: shared }); const stale = harness({ storage: shared });
    const cloud = server(editing.buildCloudPayload()); connect(editing, cloud); connect(stale, cloud);
    award(editing); const journal = shared.get(editing.draftKey); assert.ok(journal);
    stale.getState().activeTopTab = 'exercise'; stale.persistState({ skipCloud: true });
    assert.equal(shared.get(editing.draftKey), journal); assert.equal(shared.get(PENDING), '1');
    assert.equal(JSON.parse(shared.get(KEY)).amulet.ledger.length, 0);
    shared.delete(PENDING); // Simulate a previously open old client clearing the obsolete common flag.
    const reopened = harness({ storage: shared }); connect(reopened, cloud, { baseline: false });
    assert.equal(reopened.runtime.hasLocalChanges, true); assert.equal(await reopened.synchronizeCloud(), true);
    assert.deepEqual(eventIds(reopened.getState()), ['award-read']); assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    assert.equal(shared.has(editing.draftKey), false); assert.equal(shared.has(PENDING), false);
    assert.ok(!journal.includes('synthetic-private'));
  });
  await test('two same-origin tab edits reconcile even when the main cached snapshot contains only the last tab', async () => {
    const shared = new Map(); const first = harness({ storage: shared }); const second = harness({ storage: shared });
    const cloud = server(first.buildCloudPayload()); connect(first, cloud); connect(second, cloud);
    award(first); award(second, { id: 'award-run', habit: 'am_run', amount: 3000 });
    assert.deepEqual(eventIds(JSON.parse(shared.get(KEY))), ['award-run']);
    assert.equal(await second.synchronizeCloud(), true); assert.deepEqual(eventIds(cloud.get().state), ['award-read', 'award-run']);
    assert.equal(await first.synchronizeCloud(), true); assert.deepEqual(eventIds(first.getState()), ['award-read', 'award-run']);
    assert.equal(first.readPendingSyncDrafts().length, 0);
  });
  await test('a new edit in another tab during upload keeps its changed journal for the next sync', async () => {
    const shared = new Map(); const first = harness({ storage: shared }); const second = harness({ storage: shared });
    const cloud = server(first.buildCloudPayload()); connect(first, cloud); connect(second, cloud);
    award(first); award(second, { id: 'award-run', habit: 'am_run', amount: 3000 });
    let release; cloud.hooks.after = () => new Promise(resolve => { release = resolve; });
    const syncing = first.synchronizeCloud(); await flush(); assert.ok(release);
    award(second, { id: 'award-meditate', habit: 'am_meditate', amount: 4000 });
    const newJournal = shared.get(second.draftKey); release(); assert.equal(await syncing, true);
    assert.equal(shared.get(second.draftKey), newJournal); assert.equal(shared.get(PENDING), '1');
    assert.deepEqual(eventIds(cloud.get().state), ['award-read', 'award-run']);
    cloud.hooks.after = null; assert.equal(await first.synchronizeCloud(), true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-meditate', 'award-read', 'award-run']);
    assert.equal(shared.has(second.draftKey), false);
  });
  await test('a stale tab first edit after another tab advanced the shared baseline cannot delete that tab reward', async () => {
    const shared = new Map(); const first = harness({ storage: shared }); const stale = harness({ storage: shared });
    const cloud = server(first.buildCloudPayload()); connect(first, cloud); connect(stale, cloud);
    award(first); assert.equal(await first.synchronizeCloud(), true);
    assert.equal(stale.getState().amulet.ledger.length, 0); assert.equal(stale.getState().cloud.lastSyncedAt, PRIOR);
    award(stale, { id: 'award-run', habit: 'am_run', amount: 3000 });
    const draft = JSON.parse(shared.get(stale.draftKey));
    assert.ok(!draft.base || draft.updatedAt === PRIOR);
    assert.equal(await stale.synchronizeCloud(), true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read', 'award-run']);
  });
  await test('resolving a same-origin wallet conflict acknowledges captured drafts without immediately repeating the conflict', async () => {
    for (const keepLocal of [true, false]) {
      const funded = harness(); award(funded); const initial = funded.buildCloudPayload();
      const shared = new Map(); const first = harness({ storage: shared, state: initial, confirm: keepLocal });
      const second = harness({ storage: shared, state: initial }); const cloud = server(initial);
      connect(first, cloud); connect(second, cloud);
      for (const [h, id] of [[first, 'local-spend'], [second, 'other-spend']]) {
        h.getState().amulet.ledger.push({ id, type: 'withdraw', amountOre: -800, label: id, date: DAY, at: '2026-10-20T13:00:00.000Z' }); h.persistState();
      }
      assert.equal(await first.synchronizeCloud(), false); assert.ok(first.runtime.walletConflict);
      assert.equal(cloud.requests.filter(request => request.action === 'push').length, 0);
      first.reviewWalletSync();
      for (let i = 0; i < 12 && first.runtime.inFlight; i++) await flush();
      assert.equal(first.confirms.length, 1); assert.equal(first.runtime.walletConflict, null);
      assert.equal(first.runtime.hasLocalChanges, false); assert.equal(first.readPendingSyncDrafts().length, 0);
      assert.deepEqual(eventIds(cloud.get().state), ['award-read', keepLocal ? 'local-spend' : 'other-spend'].sort());
      assert.equal(await first.synchronizeCloud(), true); assert.equal(first.runtime.walletConflict, null);
      assert.equal(first.confirms.length, 1);
    }
  });
  await test('a corrupt journal does not hide a later valid pending journal or prevent its recovery', async () => {
    const shared = new Map([['discipline_os_draft_v1_corrupt', '{']]);
    const editing = harness({ storage: shared }); const cloud = server(editing.buildCloudPayload()); connect(editing, cloud);
    award(editing); const reopened = harness({ storage: shared }); connect(reopened, cloud, { baseline: false });
    assert.equal(reopened.runtime.hasLocalChanges, true); assert.equal(reopened.readPendingSyncDrafts().length, 1);
    assert.equal(await reopened.synchronizeCloud(), true); assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    assert.equal(shared.get('discipline_os_draft_v1_corrupt'), '{'); assert.equal(reopened.runtime.hasLocalChanges, false);
  });
  await test('recovery backups are bounded, retain both copies, and omit authentication secrets', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    for (let i = 0; i < 5; i++) { note(h, `Local ${i}`, '2026-10-20'); const remote = cloud.get().state; remote.dayNotes['2026-10-21'] = `Phone ${i}`; cloud.replace(remote); assert.equal(await h.synchronizeCloud(), true); }
    const backups = JSON.parse(h.storage.get(RECOVERY)); assert.equal(backups.length, 3);
    assert.ok(backups.every(b => b.local && b.remote));
    assert.ok(backups.every(b => !JSON.stringify(b).includes('synthetic-private')));
  });
  console.log(`${count} automatic sync safety tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
