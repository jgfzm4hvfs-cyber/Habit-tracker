const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const configUrl = 'https://example.test/Habit-tracker/cloud-config.js?v=test';
const configRequest = new Request(configUrl);

function harness({ cached, network }) {
  const entries = new Map();
  if (cached !== undefined) entries.set(configUrl, new Response(cached));
  entries.set('./index.html', new Response('<html>App shell</html>'));
  const matches = [];
  const writes = [];
  const lifetimes = [];
  const listeners = new Map();
  let fetchCount = 0;
  const key = request => typeof request === 'string' ? request : request.url;
  const cache = {
    match: async request => entries.get(key(request))?.clone(),
    put: async (request, response) => {
      writes.push(key(request));
      entries.set(key(request), response.clone());
    },
  };
  const context = {
    URL,
    Request,
    Response,
    console,
    self: { addEventListener: (name, listener) => listeners.set(name, listener) },
    caches: {
      match: async request => {
        matches.push(key(request));
        return cache.match(request);
      },
      open: async () => cache,
    },
    fetch: request => {
      fetchCount += 1;
      return network(request);
    },
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  let responsePromise;
  listeners.get('fetch')({
    request: configRequest,
    respondWith: response => { responsePromise = Promise.resolve(response); },
    waitUntil: promise => { lifetimes.push(Promise.resolve(promise)); },
  });
  assert.ok(responsePromise, 'cloud-config fetch is handled');
  return {
    responsePromise,
    entries,
    matches,
    writes,
    lifetimes,
    get fetchCount() { return fetchCount; },
    async finishBackground() {
      // waitUntil may register another lifetime during its async work.
      for (let index = 0; index < lifetimes.length; index += 1) {
        await lifetimes[index];
      }
    },
  };
}

async function within(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Cached config waited for the network')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const stalled = harness({ cached: 'window.cached = true;', network: () => new Promise(() => {}) });
  const cachedResponse = await within(stalled.responsePromise, 50);
  assert.equal(await cachedResponse.text(), 'window.cached = true;');
  assert.equal(stalled.fetchCount, 1, 'cached requests also start a refresh');
  assert.ok(stalled.lifetimes.length > 0, 'background refresh has an event lifetime');
  console.log('PASS cached cloud config returns immediately while its network refresh is stalled');

  const refreshing = harness({ cached: 'old config', network: async () => new Response('new config') });
  assert.equal(await (await refreshing.responsePromise).text(), 'old config');
  await refreshing.finishBackground();
  assert.equal(await refreshing.entries.get(configUrl).text(), 'new config');
  assert.deepEqual(refreshing.writes, [configUrl]);

  const unavailable = harness({ cached: 'last good config', network: async () => new Response('Service unavailable', { status: 503 }) });
  assert.equal(await (await unavailable.responsePromise).text(), 'last good config');
  await unavailable.finishBackground();
  assert.deepEqual(unavailable.writes, [], 'HTTP failures must not replace working config');
  assert.equal(await unavailable.entries.get(configUrl).text(), 'last good config');
  console.log('PASS background refresh updates successful config and never caches failed HTTP responses');

  const offline = harness({ cached: 'offline config', network: async () => { throw new TypeError('Offline'); } });
  assert.equal(await (await offline.responsePromise).text(), 'offline config');
  await offline.finishBackground();
  assert.deepEqual(offline.writes, []);
  assert.ok(!offline.matches.includes('./index.html'), 'config never falls back to HTML');
  console.log('PASS offline cached config works without an app-shell fallback');

  const coldOnline = harness({ network: async () => new Response('first config') });
  assert.equal(await (await coldOnline.responsePromise).text(), 'first config');
  await coldOnline.finishBackground();
  assert.equal(await coldOnline.entries.get(configUrl).text(), 'first config');
  assert.equal(coldOnline.fetchCount, 1);
  console.log('PASS uncached config loads from the network and is cached for the next launch');

  const coldOffline = harness({ network: async () => { throw new TypeError('Offline'); } });
  const failed = await coldOffline.responsePromise;
  await coldOffline.finishBackground();
  assert.equal(failed.type, 'error', 'missing offline config returns Response.error()');
  assert.equal(failed.status, 0);
  assert.equal(await failed.text(), '');
  assert.ok(!coldOffline.matches.includes('./index.html'), 'missing config must not execute HTML as JavaScript');
  assert.deepEqual(coldOffline.writes, []);
  console.log('PASS missing offline config returns a network error instead of HTML');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
