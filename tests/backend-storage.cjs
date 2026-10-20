const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '..');

function harness() {
  const data = { rows: [], events: [], maxColumns: 26, failFlush: false };
  const sheet = {
    getLastRow: () => data.rows.length,
    getLastColumn: () => Math.max(0, ...data.rows.map(row => {
      let last = row.length;
      while (last && (row[last - 1] === '' || row[last - 1] == null)) last -= 1;
      return last;
    })),
    getMaxColumns: () => data.maxColumns,
    insertColumnsAfter: (after, count) => {
      assert.equal(after, data.maxColumns);
      data.maxColumns += count;
      data.events.push('expand');
    },
    getRange: (row, column, rowCount, columnCount) => {
      assert.ok(column + columnCount - 1 <= data.maxColumns, 'range stays within allocated columns');
      return {
        getValues: () => Array.from({ length: rowCount }, (_, r) =>
          Array.from({ length: columnCount }, (_, c) => data.rows[row - 1 + r]?.[column - 1 + c] ?? '')),
        setValues: values => {
          assert.equal(values.length, rowCount);
          for (let r = 0; r < rowCount; r += 1) {
            assert.equal(values[r].length, columnCount);
            for (let c = 0; c < columnCount; c += 1) {
              const value = values[r][c];
              if (typeof value === 'string' && value.length > 50000) throw Error('Cell exceeds 50000 characters');
              assert.ok(!(typeof value === 'string' && value.startsWith('=')), 'stored cells do not become formulas');
              if (!data.rows[row - 1 + r]) data.rows[row - 1 + r] = [];
              data.rows[row - 1 + r][column - 1 + c] = value;
            }
          }
          data.events.push('write');
        },
      };
    },
    appendRow: values => {
      sheet.getRange(data.rows.length + 1, 1, 1, values.length).setValues([values]);
    },
    clearContents: () => { throw Error('Destructive sheet clearing is forbidden'); },
  };
  const spreadsheet = { getSheetByName: () => sheet, insertSheet: () => sheet };
  const context = vm.createContext({
    console,
    Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {
        data.events.push('flush');
        if (data.failFlush) throw Error('Deferred write failed');
      },
    },
    LockService: { getScriptLock: () => ({
      waitLock: () => data.events.push('lock'),
      releaseLock: () => data.events.push('unlock'),
    }) },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      base64Encode: value => Buffer.from(value, 'utf8').toString('base64'),
      base64Decode: value => Array.from(Buffer.from(value, 'base64')),
      newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: value => ({ setMimeType() { return this; }, getContent: () => value }),
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'Code.gs'), 'utf8') + `
    assertAuthorized_ = () => {};
    this.__storage = { headers: HEADERS.slice(), encodeStoredState_, decodeStoredState_, findUserRow_, ensureSheet_, doPost };
  `, context);
  const api = context.__storage;
  const call = payload => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
  const seed = rows => { data.rows = [Array.from(api.headers), ...rows.map(row => row.slice())]; };
  const push = (state, extra = {}) => call({ action: 'push', userId: 'default', sessionToken: 'test.session', state, ...extra });
  const sync = () => call({ action: 'sync', userId: 'default', sessionToken: 'test.session' });
  return { ...api, data, seed, call, push, sync };
}

let count = 0;
function test(name, check) { check(); count += 1; console.log('PASS', name); }
const stamp = '2026-10-20T18:42:00.000Z';

test('legacy near-limit snapshots remain readable without migration', () => {
  const h = harness();
  const raw = JSON.stringify({ content: 'x'.repeat(49798) });
  assert.equal(raw.length, 49812);
  h.seed([['default', stamp, raw]]);
  assert.deepEqual(h.sync().state, JSON.parse(raw));
  assert.equal(h.data.events.length, 0);
});

test('small snapshots retain the legacy JSON cell format and flush before success', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  assert.equal(h.push({ reading: true }, { expectedUpdatedAt: stamp }).ok, true);
  assert.equal(h.data.rows[1][2], '{"reading":true}');
  assert.deepEqual(h.data.events, ['lock', 'write', 'flush', 'unlock']);
  assert.deepEqual(h.sync().state, { reading: true });
});

test('snapshots above the cell limit round-trip through safe bounded chunks', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  const state = { content: 'x'.repeat(120000), wallet: 540 };
  assert.equal(h.push(state).ok, true);
  assert.ok(h.data.rows[1][2].startsWith('HT_STATE_V1:'));
  assert.ok(h.data.rows[1].slice(3).every(cell => cell.startsWith('HT_CHUNK_V1:') && cell.length <= 44000 + 'HT_CHUNK_V1:'.length));
  assert.deepEqual(h.sync().state, state);
});

test('Norwegian text and emoji preserve UTF-8 content across chunk boundaries', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  const state = { content: 'æøå💜'.repeat(18000) };
  assert.equal(h.push(state).ok, true);
  assert.deepEqual(h.sync().state, state);
});

test('shrinking a snapshot removes obsolete chunks and preserves other users', () => {
  const h = harness(); h.seed([['default', stamp, '{}'], ['another', stamp, '{"kept":true}']]);
  h.push({ content: 'x'.repeat(180000) });
  const oldWidth = h.data.rows[1].length;
  const other = h.data.rows[2].slice();
  h.push({ small: true });
  assert.equal(h.data.rows[1].length, oldWidth);
  assert.ok(h.data.rows[1].slice(3).every(cell => cell === ''));
  assert.deepEqual(h.data.rows[2], other);
  assert.deepEqual(h.sync().state, { small: true });
});

test('new empty stores retain the existing three headers', () => {
  const h = harness();
  assert.equal(h.push({ content: 'x'.repeat(52000) }, { expectedUpdatedAt: '' }).ok, true);
  assert.deepEqual(h.data.rows[0], Array.from(h.headers));
  assert.deepEqual(h.sync().state, { content: 'x'.repeat(52000) });
});

test('large records allocate additional columns when needed', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  const state = { content: 'x'.repeat(900000) };
  assert.equal(h.push(state).ok, true);
  assert.ok(h.data.maxColumns > 26);
  assert.deepEqual(h.sync().state, state);
});

test('header mismatches return an error without clearing or rewriting data', () => {
  const h = harness(); h.seed([['default', stamp, '{"kept":true}']]);
  h.data.rows[0][2] = 'unexpected';
  const before = JSON.stringify(h.data.rows);
  const response = h.sync();
  assert.equal(response.ok, false); assert.match(response.error, /headers/);
  assert.equal(JSON.stringify(h.data.rows), before);
  assert.equal(h.data.events.length, 0);
});

test('missing chunks fail safely instead of appearing as an empty cloud record', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]); h.push({ content: 'x'.repeat(80000) });
  h.data.rows[1][4] = '';
  const before = JSON.stringify(h.data.rows); h.data.events.length = 0;
  assert.equal(h.sync().ok, false);
  assert.match(h.sync().error, /incomplete or damaged/);
  assert.equal(JSON.stringify(h.data.rows), before);
  assert.equal(h.data.events.length, 0);
});

test('malformed manifests and encoded chunks are rejected without writes', () => {
  for (const cells of [
    ['HT_STATE_V1:not-json'],
    ['HT_STATE_V1:{"encoding":"base64-utf8","chunks":999999,"length":5}'],
    ['HT_STATE_V1:{"encoding":"base64-utf8","chunks":1,"length":5}', 'HT_CHUNK_V1:####'],
    ['HT_STATE_V1:{"encoding":"base64-utf8","chunks":1,"length":5}', 'wrong-prefix'],
  ]) {
    const h = harness(); h.seed([['default', stamp, ...cells]]);
    assert.equal(h.sync().ok, false); assert.equal(h.data.events.length, 0);
  }
});

test('decoded damaged JSON is an error rather than an empty state', () => {
  const h = harness();
  const cells = Array.from(h.encodeStoredState_(JSON.stringify({ content: 'x'.repeat(60000) })));
  const damaged = '[' + JSON.stringify({ content: 'x'.repeat(60000) }).slice(1);
  const encoded = Buffer.from(damaged).toString('base64');
  for (let i = 1; i < cells.length; i += 1) cells[i] = 'HT_CHUNK_V1:' + encoded.slice((i - 1) * 44000, i * 44000);
  h.seed([['default', stamp, ...cells]]);
  assert.equal(h.sync().ok, false);
});

test('deferred write failures are reported before success and release the lock', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]); h.data.failFlush = true;
  const response = h.push({ reading: true });
  assert.equal(response.ok, false); assert.equal(response.error, 'Deferred write failed');
  assert.deepEqual(h.data.events, ['lock', 'write', 'flush', 'unlock']);
});

test('stale conditional pushes preserve cloud data and return a conflict code', () => {
  const h = harness(); h.seed([['default', stamp, '{"wallet":540}']]);
  const response = h.push({ wallet: 430 }, { expectedUpdatedAt: 'older' });
  assert.equal(response.ok, false); assert.equal(response.code, 'SYNC_CONFLICT');
  assert.equal(h.data.rows[1][2], '{"wallet":540}');
  assert.deepEqual(h.data.events, ['lock', 'unlock']);
});

test('a second conditional writer cannot overwrite the first writer', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  const first = h.push({ wallet: 540 }, { expectedUpdatedAt: stamp });
  assert.equal(first.ok, true);
  const second = h.push({ wallet: 430 }, { expectedUpdatedAt: stamp });
  assert.equal(second.code, 'SYNC_CONFLICT');
  assert.deepEqual(h.sync().state, { wallet: 540 });
});

test('legacy clients can still upload without a conditional version', () => {
  const h = harness(); h.seed([['default', stamp, '{}']]);
  assert.equal(h.push({ reading: true }).ok, true);
  assert.deepEqual(h.sync().state, { reading: true });
});

console.log(`${count}/${count} backend storage regressions passed`);
