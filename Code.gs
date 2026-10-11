// Bookmark Sync - Google Apps Script Backend
// Deploy as Web App: execute as Me, access Anyone.
// Run initialSetup() once from the bound spreadsheet's Apps Script editor.
var BOOKMARK_CHUNK_SIZE = 30000;

function initialSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run initialSetup from the spreadsheet-bound Apps Script editor.');
  PropertiesService.getScriptProperties().setProperty('BOOKMARK_SPREADSHEET_ID', ss.getId());
  var sheet = getOrCreateSheet_();
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 800);
}

function doGet(e) {
  return withBookmarkLock_(function () {
    var data = readBookmarkData_(getOrCreateSheet_());
    return data ? JSON.parse(data) : { maps: {}, portals: {} };
  });
}

function doPost(e) {
  return withBookmarkLock_(function () {
    var data = e && e.parameter && e.parameter.data;
    if (!data) throw new Error('missing data parameter');
    var parsed;
    try { parsed = JSON.parse(data); }
    catch (err) { throw new Error('invalid JSON'); }
    if (!parsed || !parsed.portals || !parsed.maps) throw new Error('invalid bookmark format');

    // Google Sheets permits 50,000 characters per cell. Split the JSON across
    // B2, B3, ...; doGet joins them and also reads the previous B2-only format.
    var chunks = [];
    for (var offset = 0; offset < data.length;) {
      var end = Math.min(offset + BOOKMARK_CHUNK_SIZE, data.length);
      var lastCode = data.charCodeAt(end - 1);
      if (end < data.length && lastCode >= 0xD800 && lastCode <= 0xDBFF) end--;
      chunks.push([data.slice(offset, end)]);
      offset = end;
    }
    var sheet = getOrCreateSheet_();
    var requiredRows = chunks.length + 1;
    if (sheet.getMaxRows() < requiredRows) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
    }
    var oldLastRow = sheet.getLastRow();
    sheet.getRange(2, 2, chunks.length, 1).setNumberFormat('@').setValues(chunks);
    if (oldLastRow > requiredRows) {
      sheet.getRange(requiredRows + 1, 2, oldLastRow - requiredRows, 1).clearContent();
    }
    sheet.getRange(2, 1).setValue(new Date().toISOString());
    SpreadsheetApp.flush();
    if (readBookmarkData_(sheet) !== data) throw new Error('stored data differs from uploaded data');
    return { status: 'ok', chunks: chunks.length, characters: data.length };
  });
}

function readBookmarkData_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  return sheet.getRange(2, 2, lastRow - 1, 1).getValues().map(function (row) {
    return String(row[0]);
  }).join('');
}

function withBookmarkLock_(operation) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return jsonOutput_(operation());
  } catch (err) {
    return jsonOutput_({ status: 'error', message: err.message || String(err) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOKMARK_SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run initialSetup once to bind the target spreadsheet.');
  var sheet = ss.getSheetByName('Bookmarks');
  if (!sheet) {
    sheet = ss.insertSheet('Bookmarks');
    sheet.appendRow(['timestamp', 'data']);
  }
  return sheet;
}
