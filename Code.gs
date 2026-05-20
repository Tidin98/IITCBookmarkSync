// Bookmark Sync - Google Apps Script Backend
// Deploy as Web App with access "Anyone" to get the script URL.
// Run initialSetup() once manually from the Apps Script editor.

function initialSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bookmarks');
  if (sheet) {
    ss.deleteSheet(sheet);
  }
  sheet = ss.insertSheet('Bookmarks');
  sheet.appendRow(['timestamp', 'data']);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 800);
}

function doGet(e) {
  var sheet = getOrCreateSheet_();
  var lastRow = sheet.getLastRow();
  var result;
  if (lastRow < 2) {
    result = { maps: {}, portals: {} };
  } else {
    var data = sheet.getRange(2, 2).getValue();
    try {
      result = JSON.parse(data);
    } catch (err) {
      result = { maps: {}, portals: {} };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var data = e.parameter.data;
  if (!data) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'missing data parameter' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    JSON.parse(data);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'invalid JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = getOrCreateSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow([new Date().toISOString(), data]);
  } else {
    sheet.getRange(2, 1, 1, 2).setValues([[new Date().toISOString(), data]]);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bookmarks');
  if (!sheet) {
    sheet = ss.insertSheet('Bookmarks');
    sheet.appendRow(['timestamp', 'data']);
  }
  return sheet;
}
