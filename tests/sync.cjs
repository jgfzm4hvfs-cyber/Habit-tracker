const assert = require('node:assert/strict');
const { harness, server, connect, award, note, eventIds, copy, KEY, PENDING, PRIOR } = require('./helpers/sync-harness.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
(async () => {
  await test('offline habit changes survive reopening and retain the pending marker', async () => {
    const h = harness({ online: false }); award(h);
    assert.equal(h.storage.get(PENDING), '1'); assert.equal(h.runtime.hasLocalChanges, true); assert.equal(h.timers.size, 0);
    const reopened = harness({ seed: Object.fromEntries(h.storage), online: false });
    assert.equal(reopened.runtime.hasLocalChanges, true); assert.deepEqual(eventIds(reopened.getState()), ['award-read']);
  });
  await test('navigation saves remain local and do not create a pending upload', async () => {
    const h = harness(); h.getState().activeTopTab = 'amulet'; h.persistState({ skipCloud: true });
    assert.equal(h.runtime.hasLocalChanges, false); assert.equal(h.storage.has(PENDING), false);
  });
  await test('newer cloud data downloads automatically without a manual pull', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud);
    const remote = copy(cloud.get().state); remote.dayNotes['2026-10-21'] = 'From phone'; cloud.replace(remote);
    assert.equal(await h.synchronizeCloud(), true); assert.equal(h.getState().dayNotes['2026-10-21'], 'From phone');
    assert.deepEqual(cloud.requests.map(r => r.action), ['sync']); assert.equal(h.runtime.hasLocalChanges, false);
  });
  await test('an ordinary local habit change uploads and clears its pending marker', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    assert.equal(await h.pushToCloud(), true); assert.deepEqual(eventIds(cloud.get().state), ['award-read']);
    assert.equal(h.runtime.hasLocalChanges, false); assert.equal(h.storage.has(PENDING), false);
  });
  await test('two devices can make different habit awards offline and both keep the combined result', async () => {
    const first = harness(); const initial = first.buildCloudPayload(); const second = harness({ state: initial });
    const cloud = server(initial); connect(first, cloud); connect(second, cloud);
    award(first); award(second, { id: 'award-run', habit: 'am_run', amount: 3000 });
    assert.equal(await first.synchronizeCloud(), true); assert.equal(await second.synchronizeCloud(), true);
    assert.equal(await first.synchronizeCloud(), true);
    for (const snapshot of [first.getState(), second.getState(), cloud.get().state]) assert.deepEqual(eventIds(snapshot), ['award-read', 'award-run']);
  });
  await test('first sync combines existing local data with an existing cloud copy automatically', async () => {
    const local = harness(); const remote = harness();
    local.getState().cloud.lastSyncedAt = ''; award(local);
    award(remote, { id: 'award-run', habit: 'am_run', amount: 3000 });
    const cloud = server(remote.buildCloudPayload()); connect(local, cloud, { baseline: false });
    assert.equal(await local.bootstrapCloudSyncNow(), true);
    assert.deepEqual(eventIds(cloud.get().state), ['award-read', 'award-run']); assert.equal(local.runtime.hasLocalChanges, false);
  });
  await test('empty cloud is initialized automatically on the first save', async () => {
    const h = harness(); h.getState().cloud.lastSyncedAt = ''; award(h); const cloud = server(null); connect(h, cloud);
    assert.equal(await h.bootstrapCloudSyncNow(), true); assert.deepEqual(cloud.requests.map(r => r.action), ['sync', 'push']);
    assert.equal(h.runtime.hasLocalChanges, false); assert.equal(h.storage.has(PENDING), false);
  });
  await test('a pending local edit is merged instead of replaced by a newer remote note', async () => {
    const h = harness(); const cloud = server(h.buildCloudPayload()); connect(h, cloud); award(h);
    const remote = copy(cloud.get().state); remote.dayNotes['2026-10-21'] = 'New phone note'; cloud.replace(remote);
    assert.equal(await h.pullFromCloud({ interactive: true, force: true }), true);
    assert.deepEqual(eventIds(h.getState()), ['award-read']); assert.equal(h.getState().dayNotes['2026-10-21'], 'New phone note');
    assert.equal(cloud.get().state.dayNotes['2026-10-21'], 'New phone note');
  });
  await test('network failure keeps local records and schedules a background retry', async () => {
    const h = harness(); award(h); h.setRequest(async () => { throw Error('offline'); });
    assert.equal(await h.synchronizeCloud(), false); assert.equal(h.storage.get(PENDING), '1');
    assert.deepEqual(eventIds(JSON.parse(h.storage.get(KEY))), ['award-read']);
    assert.ok([...h.timers.values()].some(t => t.ms === 15000));
  });
  await test('legacy first-sync Exercise and Caffeine data are retained without an old pending marker', async () => {
    for (const kind of ['exercise', 'caffeine']) {
      const h = harness(); h.getState().cloud.lastSyncedAt = '';
      if (kind === 'exercise') h.getState().exercise.weights['2026-10-20'] = { kg: 80, createdAt: '2026-10-20T12:00:00.000Z' };
      else h.getState().caffeine.entries['2026-10-20'] = [{ id: 'coffee-one', cups: 1, createdAt: '2026-10-20T12:00:00.000Z' }];
      h.persistState({ skipCloud: true });
      const phone = harness(); phone.getState().dayNotes['2026-10-21'] = 'Phone';
      const cloud = server(phone.buildCloudPayload()); connect(h, cloud, { baseline: false });
      assert.equal(await h.synchronizeCloud(), true);
      if (kind === 'exercise') assert.equal(h.getState().exercise.weights['2026-10-20']?.kg, 80);
      else assert.equal(h.getState().caffeine.entries['2026-10-20']?.[0]?.cups, 1);
      assert.equal(h.getState().dayNotes['2026-10-21'], 'Phone');
    }
  });
  await test('orphan pending marker without saved records is ignored', async () => {
    assert.equal(harness({ seed: { [PENDING]: '1' } }).runtime.hasLocalChanges, false);
  });
  console.log(`${count} automatic sync tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
