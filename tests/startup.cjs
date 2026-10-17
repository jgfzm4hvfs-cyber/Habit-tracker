const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const BASE = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '..');

function startupHarness({ signedIn = true, cloudFails = false } = {}) {
  const calls = [];
  const timers = new Map();
  const storage = new Map();
  let timerId = 0;
  let finishCloud;
  const cloud = new Promise((resolve, reject) => { finishCloud = cloudFails ? reject : resolve; });
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  const setTimeout = (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const window = { localStorage, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    scrollTo: () => {}, matchMedia: () => ({ matches: true }) };
  const context = vm.createContext({ window, document, navigator: {}, Date, Intl, Map, Set, Math, Number, String, Boolean,
    Array, Object, JSON, Uint8Array, atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout, clearTimeout, clearInterval: () => {}, console });
  vm.runInContext(fs.readFileSync(path.join(BASE, 'amulet.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');
  source = source.replace(/  window\.Amulet\.mount\(\{[\s\S]*?\n  \}\);/, '');
  source = source.replace('  initialize();', '  // Run initialization explicitly in the test.');
  const cut = source.lastIndexOf('})();');
  source = source.slice(0, cut) + `
    const originalRenderAll = renderAll;
    window.__startup = {
      initialize,
      setTopTab,
      getState: () => state,
      setupRender: (record, drawerOpen) => {
        renderAll = originalRenderAll;
        renderHeader = () => record('header');
        renderSyncPanel = () => record('sync');
        renderSignInBanner = () => record('signIn');
        renderTopTabs = () => record('topTabs');
        renderExerciseDashboard = () => record('exercise');
        renderCaffeineDashboard = () => record('caffeine');
        renderProgressTop = () => record('progress');
        renderMainContent = () => record('habits');
        renderTodayPanel = () => record('todayDrawer');
        renderHabitEditor = () => record('habitEditor');
        window.Amulet.render = () => record('amulet');
        refs.sidebarDrawer = { hidden: !drawerOpen };
      },
      renderAll: () => renderAll(),
      setup: (hooks) => {
        bindEvents = hooks.bindEvents;
        initializeGoogleAuth = hooks.initializeGoogleAuth;
        renderAll = hooks.renderAll;
        initializeCloudSync = hooks.initializeCloudSync;
        canUseCloudSync = hooks.canUseCloudSync;
      },
    };
  ` + source.slice(cut);
  vm.runInContext(source, context);
  const api = window.__startup;
  api.getState().activeTopTab = 'amulet';
  api.getState().amulet.ledger.push({ id: 'cached-earning', type: 'earn', date: '2026-10-16', at: '2026-10-16T10:00:00.000Z', habitId: 'am_read', label: 'Read', amountOre: 1000 });
  api.setup({
    bindEvents: () => calls.push('listeners'),
    initializeGoogleAuth: () => calls.push('auth'),
    renderAll: () => calls.push({ type: 'render', activeTab: api.getState().activeTopTab, earnings: api.getState().amulet.ledger.length }),
    initializeCloudSync: () => { calls.push('cloud'); return cloud; },
    canUseCloudSync: () => signedIn,
  });
  return { ...api, calls, timers, storage, finishCloud, cloud };
}

async function checkStartup() {
  const h = startupHarness();
  h.initialize();
  assert.ok(h.calls.includes('listeners'), 'listeners are bound synchronously');
  const render = h.calls.find(value => value.type === 'render');
  assert.deepEqual(render, { type: 'render', activeTab: 'amulet', earnings: 1 }, 'cached Amulet state is rendered before cloud resolves');
  assert.ok(h.calls.indexOf(render) < h.calls.indexOf('cloud'), 'cached render precedes cloud startup');
  assert.equal([...h.timers.values()].some(timer => timer.ms >= 450), false, 'startup has no fixed cloud wait timer');
  assert.equal(fs.readFileSync(path.join(BASE, 'index.html'), 'utf8').includes('id="bootOverlay"'), false, 'blocking startup overlay is removed');
  assert.ok(h.storage.has('discipline_os_state_v2'), 'normalized cached data is persisted');
  h.finishCloud(false);
  await h.cloud;
  console.log('PASS signed-in startup shows cached data and binds controls without awaiting cloud');

  const signedOut = startupHarness({ signedIn: false });
  signedOut.initialize();
  assert.ok(signedOut.calls.find(value => value.type === 'render'), 'signed-out app renders synchronously too');
  assert.equal(signedOut.calls.some(value => value.type === 'overlay' && value.shown), false);
  signedOut.finishCloud(false);
  await signedOut.cloud;
  console.log('PASS signed-out startup remains immediate');

  const lazy = startupHarness();
  const rendered = [];
  lazy.setupRender(value => rendered.push(value), false);
  lazy.renderAll();
  assert.ok(rendered.includes('amulet'), 'active Amulet renders');
  for (const hiddenView of ['exercise', 'caffeine', 'progress', 'habits', 'todayDrawer', 'habitEditor']) {
    assert.equal(rendered.includes(hiddenView), false, hiddenView + ' is skipped while hidden');
  }
  console.log('PASS startup skips charts and editors in inactive folders');

  rendered.length = 0;
  lazy.setTopTab('habits');
  assert.ok(rendered.includes('progress'), 'switching back to Habits renders its chart');
  assert.ok(rendered.includes('habits'), 'switching back to Habits renders its checklist');
  assert.equal(rendered.includes('amulet'), false, 'switching folders does not redraw inactive Amulet');
  rendered.length = 0;
  lazy.setTopTab('exercise');
  assert.ok(rendered.includes('exercise'), 'Exercise renders on first activation');
  assert.equal(rendered.includes('progress'), false);
  assert.equal(rendered.includes('caffeine'), false);
  console.log('PASS switching folders renders the selected folder, including first Habits visit');

  rendered.length = 0;
  lazy.setupRender(value => rendered.push(value), true);
  lazy.renderAll();
  assert.ok(rendered.includes('todayDrawer'));
  assert.ok(rendered.includes('habitEditor'));
  lazy.finishCloud(false);
  await lazy.cloud;
  console.log('PASS open menu contents remain refreshed');
}

checkStartup().catch(error => { console.error(error); process.exitCode = 1; });
