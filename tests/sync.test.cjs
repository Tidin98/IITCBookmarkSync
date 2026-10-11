const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function backend(initial = '') {
  const cells = [['timestamp', 'data'], ['', initial]];
  let rows = 1000;
  let locked = false;
  const sheet = {
    getLastRow() {
      let count = cells.length;
      while (count && cells[count - 1].every(v => !v)) count--;
      return count;
    },
    getMaxRows: () => rows,
    insertRowsAfter(_, count) { rows += count; },
    setColumnWidth() {},
    getRange(row, col, height = 1, width = 1) {
      const range = {
        setNumberFormat() { return range; },
        setValues(values) {
          for (const r of values) for (const value of r) {
            if (String(value).length > 50000) throw new Error('50000 character cell limit');
          }
          values.forEach((r, i) => r.forEach((v, j) => {
            cells[row - 1 + i] ||= ['', ''];
            cells[row - 1 + i][col - 1 + j] = v;
          }));
          return range;
        },
        setValue(value) { return range.setValues([[value]]); },
        getValues() {
          return Array.from({ length: height }, (_, i) =>
            Array.from({ length: width }, (_, j) => cells[row - 1 + i]?.[col - 1 + j] ?? ''));
        },
        clearContent() { return range.setValues(Array.from({ length: height }, () => Array(width).fill(''))); }
      };
      return range;
    }
  };
  const properties = {};
  const spreadsheet = { getId: () => 'sheet-id', getSheetByName: () => sheet };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties[key], setProperty: (key, value) => properties[key] = value
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, flush() {} },
    LockService: { getScriptLock: () => ({
      waitLock() { assert.equal(locked, false); locked = true; },
      hasLock: () => locked, releaseLock() { locked = false; }
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({
      text, setMimeType() { return this; }
    }) }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'Code.gs'), 'utf8'), context);
  return { context, cells, read: () => JSON.parse(context.doGet({}).text),
    write: data => JSON.parse(context.doPost({ parameter: { data } }).text) };
}

function bookmarks(count) {
  const bkmrk = {};
  for (let i = 0; i < count; i++) bkmrk['id' + i] = {
    guid: 'portal-' + i, label: '测试门户' + 'a'.repeat(80), latlng: '30,103'
  };
  return { maps: {}, portals: { idOthers: { label: 'Others', state: 1, bkmrk } } };
}

function client(responder) {
  const page = { plugin: function () {}, document: {}, bootPlugins: [],
    $: () => ({ text() {} }) };
  const calls = [];
  const context = vm.createContext({
    unsafeWindow: page, window: page, localStorage: {}, URL, setTimeout, clearTimeout,
    GM_xmlhttpRequest(options) {
      calls.push(options);
      queueMicrotask(() => {
        const response = responder(options, calls.length);
        options[response.event || 'onload'](response);
      });
      return { abort() {} };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'bookmark-sync.user.js'), 'utf8'), context);
  page.plugin.bookmarkSync.settings.scriptURL = 'https://script.google.com/macros/s/test/exec';
  return { plugin: page.plugin.bookmarkSync, calls };
}

function upload(plugin, data) {
  return new Promise(resolve => plugin.uploadToCloud(data,
    () => resolve({ ok: true }), error => resolve({ ok: false, error })));
}

test('stores JSON above the Sheets cell limit without losing portal records', () => {
  const b = backend();
  const data = bookmarks(435);
  const json = JSON.stringify(data);
  assert.ok(json.length > 50000);
  assert.equal(b.write(json).status, 'ok');
  assert.deepEqual(b.read(), data);
  assert.ok(b.cells.slice(1).every(r => String(r[1]).length <= 30000));
});

test('deleting a portal applies, and smaller uploads clear obsolete chunks', () => {
  const b = backend();
  const data = bookmarks(435);
  b.write(JSON.stringify(data));
  delete data.portals.idOthers.bkmrk.id434;
  assert.equal(b.write(JSON.stringify(data)).status, 'ok');
  assert.equal(Object.keys(b.read().portals.idOthers.bkmrk).length, 434);
  const small = bookmarks(1);
  b.write(JSON.stringify(small));
  assert.deepEqual(b.read(), small);
  assert.equal(b.cells[2][1], '');
});

test('reads existing single-cell JSON and initialization preserves it', () => {
  const data = bookmarks(2);
  const b = backend(JSON.stringify(data));
  b.context.initialSetup();
  assert.deepEqual(b.read(), data);
});

test('invalid uploads preserve data; invalid stored JSON returns an error', () => {
  const data = bookmarks(2);
  const b = backend(JSON.stringify(data));
  assert.equal(b.write('{').status, 'error');
  assert.deepEqual(b.read(), data);
  b.cells[1][1] = '{';
  assert.equal(b.read().status, 'error');
});

test('splits emoji safely at chunk boundaries', () => {
  const b = backend();
  const data = { maps: {}, portals: {}, text: 'a'.repeat(29958) + '😀'.repeat(20000) };
  assert.equal(b.write(JSON.stringify(data)).status, 'ok');
  assert.deepEqual(b.read(), data);
  for (const row of b.cells.slice(1)) {
    assert.ok(!/[\uD800-\uDBFF]$/.test(row[1]));
    assert.ok(!/^[\uDC00-\uDFFF]/.test(row[1]));
  }
});

test('POST confirmation plus fresh matching GET completes upload', async () => {
  const b = backend();
  const { plugin, calls } = client(request => {
    const data = request.method === 'POST'
      ? b.write(new URLSearchParams(request.data).get('data')) : b.read();
    return { status: 200, responseText: JSON.stringify(data) };
  });
  assert.deepEqual(await upload(plugin, JSON.stringify(bookmarks(435))), { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].fetch, true);
  assert.equal(calls[0].redirect, undefined);
  assert.equal(calls[1].nocache, true);
  assert.notEqual(calls[0].url, calls[1].url);
});

test('empty POST response never reports success', async () => {
  const { plugin, calls } = client(() => ({ status: 200, responseText: '' }));
  const result = await upload(plugin, JSON.stringify(bookmarks(1)));
  assert.equal(result.ok, false);
  assert.match(result.error, /did not confirm/);
  assert.equal(calls.length, 1);
});

test('explicit server rejection is displayed and does not read stale bookmarks', async () => {
  const { plugin, calls } = client(() => ({ status: 200,
    responseText: JSON.stringify({ status: 'error', message: 'write failed' }) }));
  const result = await upload(plugin, JSON.stringify(bookmarks(1)));
  assert.equal(result.ok, false);
  assert.match(result.error, /write failed/);
  assert.equal(calls.length, 1);
});

test('a POST ok followed by unchanged cloud data fails verification', async () => {
  const old = bookmarks(2);
  const { plugin } = client(request => ({ status: 200, responseText: JSON.stringify(
    request.method === 'POST' ? { status: 'ok' } : old) }));
  const result = await upload(plugin, JSON.stringify(bookmarks(1)));
  assert.equal(result.ok, false);
  assert.match(result.error, /extra portal GUID: portal-1/);
});

test('405 on echo retrieves the POST result with GET without repeating POST', async () => {
  const data = bookmarks(1);
  const { plugin, calls } = client(request => {
    if (request.method === 'POST') return { status: 405,
      finalUrl: 'https://script.googleusercontent.com/macros/echo?user_content_key=test' };
    return { status: 200, responseText: JSON.stringify(
      request.url.includes('/macros/echo') ? { status: 'ok' } : data) };
  });
  assert.equal((await upload(plugin, JSON.stringify(data))).ok, true);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].data, undefined);
});

test('404 on GET is retried once from a different exec URL', async () => {
  const data = bookmarks(1);
  let reads = 0;
  const { plugin, calls } = client(request => {
    if (request.method === 'POST') return { status: 200, responseText: '{"status":"ok"}' };
    if (reads++ === 0) return { status: 404, finalUrl: 'https://script.googleusercontent.com/macros/echo?key=expired' };
    return { status: 200, responseText: JSON.stringify(data) };
  });
  assert.equal((await upload(plugin, JSON.stringify(data))).ok, true);
  assert.equal(calls.length, 3);
  assert.notEqual(calls[1].url, calls[2].url);
});

test('an invalid configured URL becomes a visible failure', async () => {
  const { plugin } = client(() => ({}));
  plugin.settings.scriptURL = 'bad URL';
  assert.equal((await upload(plugin, JSON.stringify(bookmarks(1)))).ok, false);
});
