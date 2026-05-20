// ==UserScript==
// @name           IITC plugin: Bookmark Sync
// @category       Controls
// @version        0.1.0
// @description    Sync IITC portal/map bookmarks to/from a Google Sheet
// @id             bookmark-sync@Tidin98
// @namespace      https://github.com/Tidin98/IITCBookmarkSync
// @updateURL      https://raw.githubusercontent.com/Tidin98/IITCBookmarkSync/main/bookmark-sync.user.js
// @downloadURL    https://raw.githubusercontent.com/Tidin98/IITCBookmarkSync/main/bookmark-sync.user.js
// @homepageURL    https://github.com/Tidin98/IITCBookmarkSync
// @depends        bookmarks@ZasoGD
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  var self = window.plugin.bookmarkSync = function () {};
  self.id = 'bookmarkSync';
  self.title = 'Bookmark Sync';

  // --- Constants ---
  var KEY_SETTINGS = 'plugin-bookmark-sync-settings';
  var KEY_BOOKMARKS = 'plugin-bookmarks';

  // --- Settings ---
  self.settings = { scriptURL: '' };

  self.loadSettings = function () {
    try {
      var raw = localStorage[KEY_SETTINGS];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.scriptURL !== undefined) {
          self.settings = parsed;
        }
      }
    } catch (e) { /* ignore parse errors */ }
  };

  self.saveSettings = function () {
    localStorage[KEY_SETTINGS] = JSON.stringify(self.settings);
  };

  // --- URL Validation (mirrors Wayfarer Planner) ---
  self.validateURL = function (url) {
    if (!url) return false;
    if (!url.startsWith('https://script.google.com/macros/')) return false;
    if (url.indexOf('echo') !== -1) return false;
    if (!url.endsWith('exec')) return false;
    if (url.indexOf(' ') !== -1) return false;
    return true;
  };

  // --- Dependency Check ---
  self.checkDependency = function () {
    if (!window.plugin || !window.plugin.bookmarks || !window.plugin.bookmarks.bkmrksObj) {
      window.alert('Bookmark Sync requires the Bookmarks plugin to be installed and loaded.');
      return false;
    }
    return true;
  };

  // --- Cloud Communication ---
  self.getCloudData = function (callback, errorCallback) {
    $.ajax({
      url: self.settings.scriptURL,
      type: 'GET',
      dataType: 'text',
      success: function (data) {
        try {
          var parsed = JSON.parse(data);
          callback(parsed);
        } catch (e) {
          errorCallback('Failed to parse cloud data.');
        }
      },
      error: function () {
        errorCallback(
          'Bookmark Sync: Failed to retrieve data from the script URL.\n' +
          'Verify that you are using the right URL and that no extension is blocking access to Google.'
        );
      }
    });
  };

  self.uploadToCloud = function (data, callback, errorCallback) {
    var formData = new FormData();
    formData.append('data', data);
    $.ajax({
      url: self.settings.scriptURL,
      type: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function (response) {
        try {
          var result = JSON.parse(response);
          if (result.status === 'ok') {
            callback();
          } else {
            errorCallback('Server error: ' + (result.message || 'unknown'));
          }
        } catch (e) {
          // Some deployments return non-JSON on success
          callback();
        }
      },
      error: function () {
        errorCallback(
          'Bookmark Sync: Failed to send data to the script URL.\n' +
          'Verify that you are using the right URL and that no extension is blocking access to Google.'
        );
      }
    });
  };

  // --- Diff Computation ---
  self.flattenPortals = function (bkmrksObj) {
    // Returns a map: guid -> {guid, label, latlng}
    var map = {};
    if (!bkmrksObj || !bkmrksObj.portals) return map;
    var folders = bkmrksObj.portals;
    for (var fid in folders) {
      var bkmrks = folders[fid].bkmrk;
      if (!bkmrks) continue;
      for (var bid in bkmrks) {
        var b = bkmrks[bid];
        if (b.guid) {
          map[b.guid] = { guid: b.guid, label: b.label, latlng: b.latlng };
        }
      }
    }
    return map;
  };

  self.flattenMaps = function (bkmrksObj) {
    // Returns a map: latlng -> {label, latlng, z}
    var map = {};
    if (!bkmrksObj || !bkmrksObj.maps) return map;
    var folders = bkmrksObj.maps;
    for (var fid in folders) {
      var bkmrks = folders[fid].bkmrk;
      if (!bkmrks) continue;
      for (var bid in bkmrks) {
        var b = bkmrks[bid];
        if (b.latlng) {
          map[b.latlng] = { label: b.label, latlng: b.latlng, z: b.z };
        }
      }
    }
    return map;
  };

  self.computeDiff = function (localData, cloudData) {
    var localPortals = self.flattenPortals(localData);
    var cloudPortals = self.flattenPortals(cloudData);
    var localMaps = self.flattenMaps(localData);
    var cloudMaps = self.flattenMaps(cloudData);

    var portalsAdded = 0, portalsRemoved = 0, portalsUnchanged = 0;
    for (var g in cloudPortals) {
      if (!localPortals[g]) portalsAdded++;
      else portalsUnchanged++;
    }
    for (var g in localPortals) {
      if (!cloudPortals[g]) portalsRemoved++;
    }

    var mapsAdded = 0, mapsRemoved = 0, mapsUnchanged = 0;
    for (var k in cloudMaps) {
      if (!localMaps[k]) mapsAdded++;
      else mapsUnchanged++;
    }
    for (var k in localMaps) {
      if (!cloudMaps[k]) mapsRemoved++;
    }

    return {
      portals: { added: portalsAdded, removed: portalsRemoved, unchanged: portalsUnchanged },
      maps: { added: mapsAdded, removed: mapsRemoved, unchanged: mapsUnchanged }
    };
  };

  self.countItems = function (bkmrksObj) {
    var portals = 0, maps = 0;
    if (bkmrksObj) {
      if (bkmrksObj.portals) {
        for (var fid in bkmrksObj.portals) {
          var b = bkmrksObj.portals[fid].bkmrk;
          if (b) portals += Object.keys(b).length;
        }
      }
      if (bkmrksObj.maps) {
        for (var fid in bkmrksObj.maps) {
          var b = bkmrksObj.maps[fid].bkmrk;
          if (b) maps += Object.keys(b).length;
        }
      }
    }
    return { portals: portals, maps: maps };
  };

  self.escapeHtml = function (text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  };

  self.buildDiffReportHtml = function (diff, localCount, cloudCount, direction) {
    var directionText = direction === 'upload'
      ? '上传将用本地书签覆盖云端数据。'
      : '下载将用云端数据覆盖本地书签。';

    return '<div id="bookmark-sync-report">'
      + '<p>' + directionText + '</p>'
      + '<table>'
      + '<tr><th></th><th class="unchanged">不变</th><th class="added">+新增</th><th class="removed">-移除</th></tr>'
      + '<tr><td>Portal 书签</td>'
      + '<td>' + diff.portals.unchanged + '</td>'
      + '<td class="added">' + diff.portals.added + '</td>'
      + '<td class="removed">' + diff.portals.removed + '</td></tr>'
      + '<tr><td>Map 书签</td>'
      + '<td>' + diff.maps.unchanged + '</td>'
      + '<td class="added">' + diff.maps.added + '</td>'
      + '<td class="removed">' + diff.maps.removed + '</td></tr>'
      + '</table>'
      + '<p>本地总计: ' + (localCount.portals + localCount.maps) + ' 条'
      + ' | 云端总计: ' + (cloudCount.portals + cloudCount.maps) + ' 条</p>'
      + '</div>';
  };

  self.formatResultReport = function (diff, direction) {
    var actionText = direction === 'upload' ? '上传' : '下载';
    return '<div id="bookmark-sync-report">'
      + '<p><b>同步完成 (' + actionText + ')</b></p>'
      + '<table>'
      + '<tr><th></th><th class="unchanged">不变</th><th class="added">+新增</th><th class="removed">-移除</th></tr>'
      + '<tr><td>Portal 书签</td>'
      + '<td>' + diff.portals.unchanged + '</td>'
      + '<td class="added">' + diff.portals.added + '</td>'
      + '<td class="removed">' + diff.portals.removed + '</td></tr>'
      + '<tr><td>Map 书签</td>'
      + '<td>' + diff.maps.unchanged + '</td>'
      + '<td class="added">' + diff.maps.added + '</td>'
      + '<td class="removed">' + diff.maps.removed + '</td></tr>'
      + '</table></div>';
  };

  // --- Sync Operations ---
  self.doUpload = function () {
    if (!self.checkDependency()) return;
    if (!self.settings.scriptURL) {
      window.alert('请先在设置中配置 Google Apps Script URL。');
      return;
    }

    var localData = window.plugin.bookmarks.bkmrksObj;
    var localCount = self.countItems(localData);

    self.getCloudData(function (cloudData) {
      var cloudCount = self.countItems(cloudData);
      var diff = self.computeDiff(cloudData, localData);
      var reportHtml = self.buildDiffReportHtml(diff, localCount, cloudCount, 'upload');

      window.dialog({
        title: '确认上传',
        html: reportHtml,
        id: 'bookmark-sync-confirm',
        width: 380,
        modal: true,
        buttons: {
          '取消': function () { $(this).dialog('close'); },
          '确认上传': function () {
            $(this).dialog('close');
            self.uploadToCloud(JSON.stringify(localData), function () {
              window.dialog({
                title: '上传完成',
                html: self.formatResultReport(diff, 'upload'),
                id: 'bookmark-sync-result',
                width: 350,
                modal: true
              });
            }, function (errMsg) {
              window.alert(errMsg);
            });
          }
        }
      });

    }, function (errMsg) {
      window.alert(errMsg);
    });
  };

  self.doDownload = function () {
    if (!self.checkDependency()) return;
    if (!self.settings.scriptURL) {
      window.alert('请先在设置中配置 Google Apps Script URL。');
      return;
    }

    var localData = window.plugin.bookmarks.bkmrksObj;
    var localCount = self.countItems(localData);

    self.getCloudData(function (cloudData) {
      var cloudCount = self.countItems(cloudData);
      var diff = self.computeDiff(localData, cloudData);
      var reportHtml = self.buildDiffReportHtml(diff, localCount, cloudCount, 'download');

      window.dialog({
        title: '确认下载',
        html: reportHtml,
        id: 'bookmark-sync-confirm',
        width: 380,
        modal: true,
        buttons: {
          '取消': function () { $(this).dialog('close'); },
          '确认下载': function () {
            $(this).dialog('close');
            // Overwrite local data following Bookmarks plugin import pattern
            localStorage[KEY_BOOKMARKS] = JSON.stringify(cloudData);
            window.plugin.bookmarks.loadStorage();
            window.plugin.bookmarks.refreshBkmrks();
            window.runHooks('pluginBkmrksEdit', { target: 'all', action: 'import' });

            window.dialog({
              title: '下载完成',
              html: self.formatResultReport(diff, 'download'),
              id: 'bookmark-sync-result',
              width: 350,
              modal: true
            });
          }
        }
      });

    }, function (errMsg) {
      window.alert(errMsg);
    });
  };

  // --- Main Dialog ---
  self.showSyncDialog = function () {
    var html = '<div id="bookmark-sync-dialog">'
      + '<label style="display:block;margin-bottom:4px;">Google Apps Script URL:</label>'
      + '<input type="url" id="bookmark-sync-url" value="' + self.escapeHtml(self.settings.scriptURL || '') + '" '
      + 'placeholder="https://script.google.com/macros/.../exec" '
      + 'style="width:100%;box-sizing:border-box;padding:4px;" />'
      + '<div style="margin-top:12px;">'
      + '<button id="bookmark-sync-save" style="margin-right:8px;">保存 URL</button>'
      + '</div>'
      + '<hr style="border-color:#444;margin:12px 0;" />'
      + '<div style="margin-top:8px;">'
      + '<button id="bookmark-sync-upload" style="margin-right:8px;padding:6px 12px;">上传到云端（覆盖）</button>'
      + '<button id="bookmark-sync-download" style="padding:6px 12px;">从云端下载（覆盖）</button>'
      + '</div>'
      + '</div>';

    window.dialog({
      title: 'Bookmark Sync',
      html: html,
      id: 'bookmark-sync-dialog-main',
      width: 420
    });

    // Bind events after dialog is in the DOM
    setTimeout(function () {
      $('#bookmark-sync-save').on('click', function () {
        var url = $('#bookmark-sync-url').val().trim();
        if (!url) {
          window.alert('URL 不能为空。');
          return;
        }
        if (!self.validateURL(url)) {
          window.alert(
            '无效的 URL。\n' +
            'URL 必须以 https://script.google.com/macros/ 开头并以 exec 结尾。'
          );
          return;
        }
        self.settings.scriptURL = url;
        self.saveSettings();
        window.alert('URL 已保存。');
      });

      $('#bookmark-sync-upload').on('click', function () {
        // Re-read URL from input in case user changed it but didn't save
        var url = $('#bookmark-sync-url').val().trim();
        if (url && self.validateURL(url) && url !== self.settings.scriptURL) {
          self.settings.scriptURL = url;
          self.saveSettings();
        }
        $('#bookmark-sync-dialog-main').dialog('close');
        self.doUpload();
      });

      $('#bookmark-sync-download').on('click', function () {
        var url = $('#bookmark-sync-url').val().trim();
        if (url && self.validateURL(url) && url !== self.settings.scriptURL) {
          self.settings.scriptURL = url;
          self.saveSettings();
        }
        $('#bookmark-sync-dialog-main').dialog('close');
        self.doDownload();
      });
    }, 100);
  };

  // --- CSS ---
  var css = ''
    + '#bookmark-sync-report table { width:100%; border-collapse:collapse; margin:8px 0; }'
    + '#bookmark-sync-report td, #bookmark-sync-report th { padding:4px 8px; border:1px solid #444; text-align:center; }'
    + '#bookmark-sync-report th { background:#222; }'
    + '#bookmark-sync-report .added { color:#5f5; }'
    + '#bookmark-sync-report .removed { color:#f55; }'
    + '#bookmark-sync-report .unchanged { color:#888; }';

  // --- Setup ---
  var setup = function () {
    self.loadSettings();

    $('<style>').text(css).appendTo('head');

    IITC.toolbox.addButton({
      label: 'Bookmark Sync',
      title: 'Sync bookmarks to/from Google Sheet',
      action: self.showSyncDialog
    });
  };

  setup.info = plugin_info;
  window.bootPlugins.push(setup);
}

// --- Script Injection ---
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
  };
}
var script = document.createElement('script');
script.appendChild(
  document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');')
);
(document.body || document.head || document.documentElement).appendChild(script);
