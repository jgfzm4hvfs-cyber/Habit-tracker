const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.env.AMULET_TEST_ROOT || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(options = {}) {
  const events = [], listeners = new Map();
  const context = { URL, Promise, console, self: {
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: async () => { events.push(['skipWaiting']); },
    clients: {
      claim: () => { events.push(['claim']); return options.claim ? options.claim() : Promise.resolve(); },
      matchAll: async criteria => { events.push(['matchAll', copy(criteria)]); return options.pages || []; },
    },
  }, caches: {
    keys: async () => { events.push(['keys']); return options.keys || ['old-cache', 'unrelated-old-cache']; },
    delete: key => { events.push(['delete', key]); return options.remove ? options.remove(key) : Promise.resolve(true); },
    open: async key => { events.push(['open', key]); return {
      addAll: assets => { events.push(['addAll', copy(assets)]); return options.addAll ? options.addAll(assets) : Promise.resolve(); },
    }; },
  } };
  vm.createContext(context);
  vm.runInContext(source + '\nself.__testVersion = APP_VERSION; self.__testCache = CACHE_NAME; self.__testAssets = APP_ASSETS;', context);
  return { events, version: context.self.__testVersion, cache: context.self.__testCache, assets: copy(context.self.__testAssets),
    dispatch(name) {
      let lifetime;
      listeners.get(name)({ waitUntil: promise => { assert.equal(lifetime, undefined); lifetime = Promise.resolve(promise); } });
      assert.ok(lifetime, `${name} must keep its async work alive with waitUntil`);
      return lifetime;
    },
  };
}
let passed = 0;
async function test(name, run) { await run(); console.log(`ok ${++passed} - ${name}`); }
(async () => {
  await test('activation updates old and unversioned pages only after cleanup and claim finish', async () => {
    const cleanup = deferred(), claimed = deferred(), visits = [];
    const urls = [
      'https://example.test/Habit-tracker/',
      'https://example.test/Habit-tracker/?v=20261020a&view=amulet#today',
      'https://example.test/Habit-tracker/?v=20261024a',
    ];
    const h = harness({
      keys: ['old-cache', 'discipline-os-cache-v40'],
      remove: () => cleanup.promise,
      claim: () => claimed.promise,
      pages: urls.map(url => ({ url, navigate: async target => { visits.push(target); } })),
    });
    const activation = h.dispatch('activate');
    await flush();
    assert.deepEqual(h.events.filter(e => e[0] === 'delete'), [['delete', 'old-cache']]);
    assert.equal(h.events.some(e => e[0] === 'claim'), false);
    assert.equal(visits.length, 0);
    cleanup.resolve(true); await flush();
    assert.equal(h.events.some(e => e[0] === 'claim'), true);
    assert.equal(h.events.some(e => e[0] === 'matchAll'), false);
    claimed.resolve(); await activation;
    assert.deepEqual(h.events.filter(e => e[0] === 'matchAll'), [['matchAll', { type:'window' }]]);
    assert.deepEqual(visits, [
      'https://example.test/Habit-tracker/?v=20261024a',
      'https://example.test/Habit-tracker/?v=20261024a&view=amulet#today',
    ]);
  });
  await test('a closed old page cannot reject activation or block another page update', async () => {
    const visits = [];
    const h = harness({ pages: [
      {url:'https://example.test/Habit-tracker/?v=20261020a', navigate: async () => { throw new Error('Client closed'); }},
      {url:'https://example.test/Habit-tracker/', navigate: async url => { visits.push(url); }},
    ] });
    await h.dispatch('activate');
    assert.deepEqual(visits, ['https://example.test/Habit-tracker/?v=20261024a']);
  });
  await test('an already current page does not navigate or reload', async () => {
    let visits = 0;
    const h = harness({pages:[{url:'https://example.test/Habit-tracker/?v=20261024a&other=1#history',navigate:async()=>{visits++;}}]});
    await h.dispatch('activate'); assert.equal(visits,0);
  });
  await test('install waits for all current app and merge assets before skipping the old worker', async () => {
    const cached = deferred(); const h = harness({addAll:()=>cached.promise});
    const installation = h.dispatch('install'); await flush();
    assert.equal(h.events.some(e=>e[0]==='skipWaiting'),false);
    const assets = h.events.find(e=>e[0]==='addAll')[1];
    assert.ok(assets.includes('./index.html'));
    assert.ok(assets.includes(`./app.js?v=${h.version}`));
    assert.ok(assets.includes(`./sync-merge.js?v=${h.version}`));
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="(\.\/[^\"]+)"/g)) assert.ok(assets.includes(match[1]), `Missing precached script: ${match[1]}`);
    cached.resolve(); await installation;
    assert.equal(h.events.filter(e=>e[0]==='skipWaiting').length,1);
  });
  await test('a failed precache install keeps the existing worker active', async () => {
    const h = harness({addAll:async()=>{throw new Error('Offline asset');}});
    await assert.rejects(h.dispatch('install'), /Offline asset/);
    assert.equal(h.events.some(e=>e[0]==='skipWaiting'),false);
  });
  await test('worker update version matches page app asset and app startup marker', async () => {
    const h = harness();
    const appVersion = app.match(/const APP_VERSION\s*=\s*"([^\"]+)"/)[1];
    assert.equal(h.version, appVersion);
    assert.ok(html.includes(`./app.js?v=${h.version}`));
    assert.ok(html.includes(`./sync-merge.js?v=${h.version}`));
    assert.match(app, /url\.searchParams\.set\("v", APP_VERSION\)/);
    assert.match(app, /window\.history\.replaceState\(null, "", url\.href\)/);
    assert.match(app, /serviceWorker\.register\("\.\/sw\.js",\s*\{\s*updateViaCache:\s*"none"\s*\}\)/);
    assert.ok(app.indexOf('window.history.replaceState(null, "", url.href)') < app.indexOf('navigator.serviceWorker.register('));
  });
  console.log(`${passed} service worker update tests passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
