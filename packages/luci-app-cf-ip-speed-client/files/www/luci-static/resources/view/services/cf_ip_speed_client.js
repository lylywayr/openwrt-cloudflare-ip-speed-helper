'use strict';
'require view';
'require form';
'require fs';
'require ui';

var liveTimer = null;
var liveSeenRunning = false;
var liveAutoReloadDone = false;

function translateStatus(status) {
  var map = {
    idle: '空闲',
    running: '正在运行',
    ok: '已完成',
    error: '异常'
  };

  return map[status] || status || '空闲';
}

function textOf(result) {
  var stdout = result && result.stdout ? result.stdout.trim() : '';
  var stderr = result && result.stderr ? result.stderr.trim() : '';
  return [stdout, stderr].filter(Boolean).join('\n\n') || 'OK';
}

function execText(command, params) {
  return fs.exec(command, params || []).then(function(result) {
    return textOf(result) === 'OK' ? '' : textOf(result);
  }).catch(function() {
    return '';
  });
}

function readTextResult(result) {
  if (typeof result === 'string')
    return result;

  if (!result || typeof result !== 'object')
    return '';

  if (typeof result.data === 'string')
    return result.data;

  if (typeof result.content === 'string')
    return result.content;

  if (typeof result.stdout === 'string')
    return result.stdout;

  return '';
}

function compactLatencyProgress(segment) {
  var match = segment.match(/(\d+)\s*\/\s*(\d+)\s*\[([^\]]+)\]\s*可用:\s*(\d+)/);
  if (!match)
    return segment;

  var current = parseInt(match[1], 10) || 0;
  var total = parseInt(match[2], 10) || 0;
  var bar = match[3] || '';
  var available = match[4] || '0';
  var arrowMatch = bar.match(/[↗↘↙↖]/);
  var arrow = arrowMatch ? arrowMatch[0] : '';
  var percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return '延迟进度 ' + current + '/' + total + ' [' + percent + '%' + (arrow ? ' ' + arrow : '') + '] 可用: ' + available;
}

function sanitizeLogText(text) {
  var raw = String(text || '').replace(/\r/g, '\n');
  var progressPattern = /\d+\s*\/\s*\d+\s*\[[^\]]+\]\s*可用:\s*\d+/g;
  var result = [];

  raw.split(/\n+/).forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed)
      return;

    var matches = trimmed.match(progressPattern);
    if (matches && matches.length) {
      matches.forEach(function(segment) {
        result.push(compactLatencyProgress(segment));
      });
      return;
    }

    result.push(trimmed);
  });

  return result.join('\n');
}

function uciGet(map, section, key) {
  return map.data.get('cf_ip_speed_client', section, key) || '';
}

function normalizeGeoValue(value) {
  value = (value || '').trim();
  if (!value || value === 'N/A' || value === '-')
    return '';
  return value;
}

function displayCellValue(row, column) {
  if (column.key === 'country')
    return '';
  var value = row[column.key];
  return value || '-';
}

function parseTopN(raw) {
  if (!raw)
    return [];

  return raw.split('|').filter(Boolean).map(function(line) {
    var parts = line.split('~');
    return {
      ip: parts[0] || '-',
      port: parts[1] || '443',
      speed: parts[2] || '0.00',
      latency: parts[3] || '0.00',
      loss: parts[4] || '0.00',
      colo: parts[5] || 'N/A',
      country: normalizeGeoValue(parts[6]),
      updatedAt: parts[8] || '-'
    };
  });
}

var CACHE_COLUMNS = [
  { key: 'ip', label: 'IP', placeholder: 'IP 地址', width: '220px' },
  { key: 'port', label: '端口', placeholder: '443', width: '72px' },
  { key: 'colo', label: '机房', placeholder: 'HKG', width: '72px' },
  { key: 'country', label: '国家', placeholder: 'CN', width: '72px' },
  { key: 'city', label: '城市', placeholder: 'Zhengzhou', width: '110px' },
  { key: 'source', label: '来源', placeholder: 'manual', width: '82px' },
  { key: 'fail_count', label: '失败', placeholder: '0', width: '72px' },
  { key: 'last_speed', label: '速度', placeholder: '0.00', width: '86px' },
  { key: 'last_latency', label: '延迟', placeholder: '999999', width: '86px' },
  { key: 'last_updated', label: '更新时间', placeholder: '2026-07-14 00:00:00 CST', width: '168px' }
];

CACHE_COLUMNS = [
  { key: 'ip', label: 'IP', placeholder: 'IP \u5730\u5740', width: '220px' },
  { key: 'port', label: '\u7aef\u53e3', placeholder: '443', width: '72px' },
  { key: 'colo', label: '\u673a\u623f', placeholder: 'HKG', width: '72px' },
  { key: 'country', label: '\u56fd\u5bb6', placeholder: '', width: '72px' },
  { key: 'source', label: '\u6765\u6e90', placeholder: 'manual', width: '82px' },
  { key: 'fail_count', label: '\u5931\u8d25', placeholder: '0', width: '72px' },
  { key: 'last_speed', label: '\u901f\u5ea6', placeholder: '0.00', width: '86px' },
  { key: 'last_latency', label: '\u5ef6\u8fdf', placeholder: '999999', width: '86px' },
  { key: 'last_updated', label: '\u66f4\u65b0\u65f6\u95f4', placeholder: '2026-07-14 00:00:00 CST', width: '168px' }
];

var RESULT_COLUMNS = [
  { key: 'ip', label: 'IP', width: '220px' },
  { key: 'port', label: '端口', width: '72px' },
  { key: 'speed', label: '速度', width: '86px' },
  { key: 'latency', label: '延迟', width: '86px' },
  { key: 'loss', label: '丢包', width: '72px' },
  { key: 'colo', label: '机房', width: '72px' },
  { key: 'country', label: '国家', width: '72px' },
  { key: 'city', label: '城市', width: '110px' },
  { key: 'updatedAt', label: '更新时间', width: '168px' }
];

RESULT_COLUMNS = [
  { key: 'ip', label: 'IP', width: '220px' },
  { key: 'port', label: '\u7aef\u53e3', width: '72px' },
  { key: 'speed', label: '\u901f\u5ea6', width: '86px' },
  { key: 'latency', label: '\u5ef6\u8fdf', width: '86px' },
  { key: 'loss', label: '\u4e22\u5305', width: '72px' },
  { key: 'colo', label: '\u673a\u623f', width: '72px' },
  { key: 'country', label: '\u56fd\u5bb6', width: '72px' },
  { key: 'updatedAt', label: '\u66f4\u65b0\u65f6\u95f4', width: '168px' }
];

function parseCacheText(raw) {
  if (!raw)
    return [];

  return raw.split(/\r?\n/).map(function(line) {
    return line.trim();
  }).filter(Boolean).map(function(line, index) {
    var parts = line.split(',');
    while (parts.length < 11)
      parts.push('');

    return {
      _index: index,
      ip: parts[0] || '',
      port: parts[1] || '',
      colo: parts[2] || '',
      country: normalizeGeoValue(parts[3]),
      source: parts[5] || '',
      fail_count: parts[6] || '',
      last_loss: parts.length >= 11 ? (parts[7] || '') : '',
      last_speed: parts.length >= 11 ? (parts[8] || '') : (parts[7] || ''),
      last_latency: parts.length >= 11 ? (parts[9] || '') : (parts[8] || ''),
      last_updated: parts.length >= 11 ? (parts[10] || '') : (parts[9] || '')
    };
  });
}

function sortCacheRows(rows) {
  return rows.slice().sort(function(a, b) {
    var failA = parseInt(a.fail_count || '0', 10) || 0;
    var failB = parseInt(b.fail_count || '0', 10) || 0;
    var groupA = failA > 0 ? 1 : 0;
    var groupB = failB > 0 ? 1 : 0;

    if (groupA !== groupB)
      return groupA - groupB;

    return (a._index || 0) - (b._index || 0);
  });
}

function renderReadonlyTable(title, rows, columns, emptyText, maxHeight) {
  var countNode = E('span', { style: 'font-size:12px;color:#64748b' }, '共 ' + rows.length + ' 条');

  return E('div', { style: 'margin-top:18px' }, [
    E('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px'
    }, [
      E('div', { style: 'font-size:18px;font-weight:700;color:#1e293b' }, title),
      countNode
    ]),
    E('div', {
      style: 'max-height:' + (maxHeight || 300) + 'px;overflow:auto;border:1px solid #d6e0eb;border-radius:12px;background:#fff'
    }, [
      E('table', {
        style: 'border-collapse:collapse;min-width:1100px;width:max-content;font-size:11px;line-height:1.45'
      }, [
        E('thead', {}, [
          E('tr', {}, columns.map(function(column) {
            return E('th', {
              style: 'position:sticky;top:0;z-index:3;background:#e2e8f0;border:1px solid #cbd5e1;padding:8px 6px;text-align:left;font-size:11px;white-space:nowrap;color:#0f172a;min-width:' + column.width
            }, column.label);
          }))
        ]),
        E('tbody', {}, rows.length
          ? rows.map(function(row) {
              return E('tr', {}, columns.map(function(column) {
                return E('td', {
                  style: 'border:1px solid #e2e8f0;padding:7px 6px;white-space:nowrap;background:#fff;color:#0f172a;max-width:' + column.width + ';overflow:hidden;text-overflow:ellipsis'
                }, displayCellValue(row, column));
              }));
            })
          : [
              E('tr', {}, [
                E('td', {
                  colspan: String(columns.length),
                  style: 'border:1px solid #e2e8f0;padding:20px 12px;text-align:center;color:#94a3b8;background:#fff'
                }, emptyText || '暂无记录')
              ])
            ])
      ])
    ])
  ]);
}

function showSimpleModal(title, body, reload) {
  ui.showModal(title, [
    E('pre', {
      style: 'white-space:pre-wrap;word-break:break-word;max-height:360px;overflow:auto'
    }, body),
    E('div', { class: 'right' }, [
      E('button', {
        class: 'btn cbi-button',
        click: function() {
          ui.hideModal();
          if (reload)
            window.location.reload();
        }
      }, '关闭')
    ])
  ]);
}

function saveAndCron(map) {
  return map.save().then(function() {
    return fs.exec('/usr/bin/cf-ip-speed-client', ['cron']).catch(function() {});
  });
}

function encodeUtf8Base64(value) {
  return btoa(unescape(encodeURIComponent(value || '')));
}

function resolveRunState(status, message) {
  var text = '空闲';
  var color = '#334155';
  var detail = '等待开始';
  var normalizedMessage = (message || '').trim();

  if (status === 'running' && /停止/.test(normalizedMessage)) {
    text = '停止中';
    color = '#ef4444';
    detail = '正在停止任务';
  }
  else if (status === 'running') {
    text = '运行中';
    color = '#16a34a';
    detail = '正在执行任务';
  }
  else if (/停止/.test(normalizedMessage))
    detail = '任务已停止';

  return {
    text: text,
    color: color,
    detail: detail
  };
}

function setActionState(status, message) {
  var state = resolveRunState(status, message);
  var stateTextNode = document.getElementById('cf-action-state-text');
  var stateDetailNode = document.getElementById('cf-action-state-detail');

  if (stateTextNode) {
    stateTextNode.textContent = state.text;
    stateTextNode.style.color = state.color;
  }

  if (stateDetailNode)
    stateDetailNode.textContent = state.detail;
}

function setLivePanel(status, message, logText) {
  var statusNode = document.getElementById('cf-live-status');
  var logNode = document.getElementById('cf-live-log');
  var state = resolveRunState(status, message);

  if (status === 'running')
    liveSeenRunning = true;

  if (statusNode)
    statusNode.textContent = '状态：' + state.text + ' | ' + state.detail;

  setActionState(status, message);

  if (logNode && typeof logText === 'string') {
    logNode.textContent = sanitizeLogText(logText) || '暂无日志输出';
    logNode.scrollTop = logNode.scrollHeight;
  }
}

function updateLiveArea() {
  var statusNode = document.getElementById('cf-live-status');
  var logNode = document.getElementById('cf-live-log');
  var actionStateNode = document.getElementById('cf-action-state-text');
  if (!statusNode && !logNode && !actionStateNode)
    return Promise.resolve();

  var logRequest = (statusNode || logNode)
    ? fs.exec('/usr/bin/cf-ip-speed-client', ['show-log']).catch(function() { return { stdout: '', stderr: '' }; })
    : Promise.resolve({ stdout: '', stderr: '' });

  return Promise.all([
    logRequest,
    fs.exec('/usr/bin/cf-ip-speed-client', ['show-status']).catch(function() { return { stdout: '' }; })
  ]).then(function(results) {
    var lines = (results[1].stdout || '').split(/\r?\n/);
    var status = (lines[0] || '').trim() || 'idle';
    var message = lines.slice(1).join(' ').trim();
    setLivePanel(status, message, textOf(results[0]) || '暂无日志输出');
  });
}

function checkLiveAutoReload() {
  if (!liveSeenRunning || liveAutoReloadDone)
    return;

  var stateNode = document.getElementById('cf-action-state-text');
  var text = stateNode && stateNode.textContent ? stateNode.textContent : '';
  if (!text)
    return;

  if (text.indexOf('运行') !== -1 || text.indexOf('停止') !== -1)
    return;

  liveAutoReloadDone = true;
  window.setTimeout(function() {
    window.location.reload();
  }, 1200);
}

function startLiveTimer() {
  if (liveTimer !== null)
    window.clearInterval(liveTimer);
  liveTimer = window.setInterval(function() {
    updateLiveArea();
    checkLiveAutoReload();
  }, 2000);
  updateLiveArea();
}

function startLiveRun() {
  liveSeenRunning = true;
  liveAutoReloadDone = false;
  setLivePanel('running', '本轮任务已启动，正在准备环境', '本轮日志初始化中...');
  startLiveTimer();
}

function stopLiveRun() {
  liveSeenRunning = true;
  liveAutoReloadDone = false;
  setLivePanel('running', '正在停止本轮优选任务', '正在停止本轮优选任务，请稍候...');
  startLiveTimer();
}

function renderActionBar(map, initialStatus, initialMessage) {
  var initialState = resolveRunState(initialStatus || 'idle', initialMessage || '');
  var actionButtonStyle = 'flex:0 0 84px;min-height:40px;border-radius:12px;font-weight:700;font-size:13px;line-height:1;padding:0 6px;display:flex;align-items:center;justify-content:center;box-shadow:none';
  var statePanelStyle = 'flex:1 1 auto;min-width:0;border:1px solid #dbe4f0;border-radius:12px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);padding:6px 10px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;box-shadow:0 2px 8px rgba(15,23,42,0.04)';
  if (initialStatus === 'running')
    liveSeenRunning = true;

  return E('div', {
    style: 'display:flex;align-items:stretch;justify-content:space-between;gap:10px;margin:14px 0 12px 0;flex-wrap:nowrap'
  }, [
    E('button', {
      type: 'button',
      class: 'btn cbi-button cbi-button-action',
      style: actionButtonStyle + ';background:#4f6cf6;border:1px solid #4862df;color:#fff',
      click: function(ev) {
        ev.preventDefault();
        return saveAndCron(map).then(function() {
          return fs.exec('/usr/bin/cf-ip-speed-client', ['run-background']);
        }).then(function() {
          startLiveRun();
        }).catch(function(error) {
          showSimpleModal('执行失败', String(error && error.message ? error.message : error), false);
        });
      }
    }, '开始优选'),
    E('div', {
      style: statePanelStyle
    }, [
      E('div', { style: 'font-size:10px;color:#64748b;line-height:1.2;letter-spacing:0.2px' }, '运行状态'),
      E('div', {
        id: 'cf-action-state-text',
        style: 'font-size:16px;font-weight:800;line-height:1.25;color:' + initialState.color + ';margin-top:1px'
      }, initialState.text),
      E('div', {
        id: 'cf-action-state-detail',
        style: 'font-size:10px;line-height:1.2;color:#94a3b8;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px'
      }, initialState.detail)
    ]),
    E('button', {
      type: 'button',
      class: 'btn cbi-button cbi-button-remove',
      style: actionButtonStyle + ';background:#ff4d73;border:1px solid #ec4267;color:#fff',
      click: function(ev) {
        ev.preventDefault();
        stopLiveRun();
        return fs.exec('/usr/bin/cf-ip-speed-client', ['stop-background']).then(function() {
          window.setTimeout(updateLiveArea, 800);
          return null;
        }).catch(function(error) {
          showSimpleModal('停止失败', String(error && error.message ? error.message : error), false);
        });
      }
    }, '停止优选')
  ]);
}

function renderCacheTable(title, rawText) {
  var rows = sortCacheRows(parseCacheText(rawText));
  return renderReadonlyTable(title, rows, CACHE_COLUMNS, '暂无缓存记录', 300);
}

function renderResultTable(title, items) {
  var rows = items.map(function(item) {
    return {
      ip: item.ip,
      port: item.port,
      speed: item.speed + ' MB/s',
      latency: item.latency + ' ms',
      loss: item.loss,
      colo: item.colo,
      country: normalizeGeoValue(item.country),
      updatedAt: item.updatedAt
    };
  });

  return renderReadonlyTable(title, rows, RESULT_COLUMNS, '暂无结果', 220);
}

function formatManualToken(ip, port) {
  ip = (ip || '').trim();
  port = (port || '').trim() || '443';
  if (!ip)
    return '';

  if (ip.indexOf(':') !== -1 && ip.charAt(0) !== '[')
    return port === '443' ? ip : ('[' + ip + ']:' + port);

  return port === '443' ? ip : (ip + ':' + port);
}

function buildManualText(v4Raw, v6Raw) {
  var tokens = [];

  function appendTokens(raw) {
    (raw || '').split(/\r?\n/).map(function(line) {
      return line.trim();
    }).filter(Boolean).forEach(function(line) {
      var parts = line.split(',');
      var token = formatManualToken(parts[0] || '', parts[1] || '443');
      if (token)
        tokens.push(token);
    });
  }

  appendTokens(v4Raw);
  appendTokens(v6Raw);
  return tokens.join(', ');
}

function renderManualSection(manualText) {
  return E('div', {
    style: 'margin-top:22px;border:1px solid #d6e0eb;border-radius:12px;background:#fff;padding:14px'
  }, [
    E('div', { style: 'font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px' }, '手动添加 IP'),
    E('div', { style: 'font-size:12px;color:#475569;line-height:1.8;margin-bottom:10px' },
      'IPv4 和 IPv6 共用一栏，使用英文逗号分隔。支持 1.1.1.1、1.1.1.1:2053、2606:4700::1111、[2606:4700::1111]:2053。'),
    E('div', { style: 'font-size:12px;color:#475569;line-height:1.8;margin-bottom:10px' },
      '不带端口默认使用 443；保存后会参与下次优选，若未进入自动缓存会在这里同步移除。'),
    E('textarea', {
      id: 'cf-manual-input',
      placeholder: '例如：162.159.153.10, 162.159.153.10:2053, 2606:4700::6810:85e5, [2606:4700::6810:85e5]:2053',
      style: 'width:100%;min-height:100px;border:1px solid #d6e0eb;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.7;color:#0f172a;box-sizing:border-box;resize:vertical'
    }, manualText || ''),
    E('div', { style: 'margin-top:10px;text-align:right' }, [
      E('button', {
        type: 'button',
        class: 'btn cbi-button cbi-button-action',
        click: function(ev) {
          ev.preventDefault();
          var node = document.getElementById('cf-manual-input');
          var value = node ? node.value.trim() : '';
          return fs.exec('/usr/bin/cf-ip-speed-client', ['import-manual-base64', encodeUtf8Base64(value)]).then(function(result) {
            showSimpleModal('手动添加已保存', textOf(result), true);
          }).catch(function(error) {
            showSimpleModal('保存失败', String(error && error.message ? error.message : error), false);
          });
        }
      }, '保存手动添加')
    ])
  ]);
}

return view.extend({
  load: function() {
    return Promise.all([
      fs.read('/etc/cf-ip-speed-client/cache-v4.txt').catch(function() { return ''; }),
      fs.read('/etc/cf-ip-speed-client/cache-v6.txt').catch(function() { return ''; }),
      fs.read('/etc/cf-ip-speed-client/manual-v4.txt').catch(function() { return ''; }),
      fs.read('/etc/cf-ip-speed-client/manual-v6.txt').catch(function() { return ''; }),
      execText('/usr/bin/cf-ip-speed-client', ['show-status'])
    ]);
  },

  handleSave: function(ev) {
    return this.super('handleSave', [ev]).then(function() {
      return fs.exec('/usr/bin/cf-ip-speed-client', ['cron']).catch(function() {});
    });
  },

  handleSaveApply: function(ev, mode) {
    return this.super('handleSaveApply', [ev, mode]).then(function() {
      return fs.exec('/usr/bin/cf-ip-speed-client', ['cron']).catch(function() {});
    });
  },

  render: function(loadResults) {
    var cacheV4Text = readTextResult(loadResults[0]).trim();
    var cacheV6Text = readTextResult(loadResults[1]).trim();
    var manualText = buildManualText(readTextResult(loadResults[2]), readTextResult(loadResults[3]));
    var stateLines = (loadResults[4] || '').split(/\r?\n/);
    var initialStatus = (stateLines[0] || '').trim() || 'idle';
    var initialMessage = stateLines.slice(1).join(' ').trim();
    var initialState = resolveRunState(initialStatus, initialMessage);

    var m = new form.Map(
      'cf_ip_speed_client',
      'Cloudflare IP 优选助手',
      'cfst 负责候选初筛和延迟排序，自定义逻辑负责测速、地区信息、缓存评分与替换。'
    );

    var s = m.section(form.NamedSection, 'main', 'client');
    s.anonymous = true;
    s.tab('basic', '基本设置');
    s.tab('cache', '缓存管理');
    s.tab('log', '实时日志');

    var o = s.taboption('basic', form.Flag, 'enabled', '启用');
    o.default = '1';
    o.rmempty = false;

    var actionBar = s.taboption('basic', form.DummyValue, '_action_bar', '');
    actionBar.rawhtml = true;
    actionBar.cfgvalue = function() {
      window.setTimeout(updateLiveArea, 100);
      return renderActionBar(m, initialStatus, initialMessage);
    };

    o = s.taboption('basic', form.ListValue, 'ip_mode', 'IP 模式');
    o.value('v4', '仅 IPv4');
    o.value('v6', '仅 IPv6');
    o.value('dual', 'IPv4 + IPv6');
    o.default = 'dual';
    o.rmempty = false;

    o = s.taboption('basic', form.Flag, 'include_443', '始终包含 443 端口');
    o.default = '1';
    o.rmempty = false;

    o = s.taboption('basic', form.Value, 'custom_ports', '自定义端口');
    o.placeholder = '8443, 2053, 2083';
    o.description = '多个端口请用英文逗号分隔；不填写时仅使用 443。';
    o.rmempty = true;

    o = s.taboption('basic', form.Flag, 'edgetunnel_sync_enabled', '同步到 edgetunnel');
    o.default = '0';
    o.rmempty = false;

    o = s.taboption('basic', form.Value, 'edgetunnel_sync_url', 'edgetunnel 面板地址');
    o.placeholder = 'https://cfyx.lylywayr.asia';
    o.rmempty = true;
    o.depends('edgetunnel_sync_enabled', '1');

    o = s.taboption('basic', form.Value, 'edgetunnel_sync_password', 'edgetunnel 面板密码');
    o.password = true;
    o.rmempty = true;
    o.depends('edgetunnel_sync_enabled', '1');

    o = s.taboption('basic', form.Value, 'edgetunnel_sync_v4_count', '同步 IPv4 数量');
    o.default = '20';
    o.datatype = 'range(0,100)';
    o.rmempty = false;
    o.depends('edgetunnel_sync_enabled', '1');

    o = s.taboption('basic', form.Value, 'edgetunnel_sync_v6_count', '同步 IPv6 数量');
    o.default = '10';
    o.datatype = 'range(0,100)';
    o.rmempty = false;
    o.depends('edgetunnel_sync_enabled', '1');

    o = s.taboption('basic', form.Value, 'test_url', '测速地址');
    o.placeholder = 'https://cfspeed.example.com/__down?bytes=10485760';
    o.rmempty = true;

    o = s.taboption('basic', form.ListValue, 'schedule_mode', '执行计划');
    o.value('daily', '每天定时');
    o.value('interval', '按间隔执行');
    o.default = 'daily';
    o.rmempty = false;

    o = s.taboption('basic', form.Value, 'interval_hours', '间隔小时');
    o.default = '6';
    o.datatype = 'range(1,168)';
    o.rmempty = false;
    o.depends('schedule_mode', 'interval');

    o = s.taboption('basic', form.ListValue, 'daily_hour', '每天执行小时');
    for (var h = 0; h < 24; h++)
      o.value(String(h), String(h).padStart(2, '0'));
    o.default = '3';
    o.rmempty = false;
    o.depends('schedule_mode', 'daily');

    o = s.taboption('basic', form.ListValue, 'daily_minute', '每天执行分钟');
    ['0', '15', '30', '45'].forEach(function(v) { o.value(v, v.padStart(2, '0')); });
    o.default = '0';
    o.rmempty = false;
    o.depends('schedule_mode', 'daily');

    o = s.taboption('basic', form.ListValue, 'log_clear_interval', '日志清理');
    o.value('never', '从不');
    o.value('daily', '每天');
    o.value('weekly', '每周');
    o.value('monthly', '每月');
    o.default = 'weekly';
    o.rmempty = false;

    var resultView = s.taboption('basic', form.DummyValue, '_results', '');
    resultView.rawhtml = true;
    resultView.cfgvalue = function(sectionId) {
      var top4 = parseTopN(uciGet(this.map, sectionId, 'last_result_v4_topn'));
      var top6 = parseTopN(uciGet(this.map, sectionId, 'last_result_v6_topn'));

      return E('div', {}, [
        E('div', { style: 'font-size:18px;font-weight:700;color:#1e293b;margin-bottom:10px' }, '结果展示'),
        renderResultTable('IPv4 前 5', top4),
        renderResultTable('IPv6 前 5', top6)
      ]);
    };

    var rules = s.taboption('basic', form.DummyValue, '_logic', '当前逻辑');
    rules.rawhtml = true;
    rules.cfgvalue = function() {
      return E('div', {
        style: 'border:1px solid #d6e0eb;border-radius:10px;padding:10px;background:#fff'
      }, [
        E('div', {}, '1. cfst 仅负责候选初筛与延迟排序。'),
        E('div', {}, '2. 每个协议族会对前 50 个候选做自定义测速。'),
        E('div', {}, '3. 每个候选测速 3 次，取平均速度。'),
        E('div', {}, '4. 测速地址建议使用你自己的 Cloudflare 专用测速域名。'),
        E('div', {}, '5. 前端仅展示每个协议族最终前 5 个。'),
        E('div', {}, '6. 缓存保存 IP、端口、地区信息、失败次数、上次速度与延迟。'),
        E('div', {}, '7. 缓存上限 100 条。'),
        E('div', {}, '8. 连续 10 次未达标才会移除缓存。'),
        E('div', {}, '9. 缓存已满时，只有更优 IP 才会替换最低分记录。')
      ]);
    };

    var cacheInfo = s.taboption('cache', form.DummyValue, '_cache_info', '');
    cacheInfo.rawhtml = true;
    cacheInfo.cfgvalue = function() {
      return E('div', {
        style: 'border:1px solid #d6e0eb;border-radius:10px;padding:14px;background:#fff'
      }, [
        E('div', { style: 'font-weight:700;margin-bottom:8px' }, '缓存格式'),
        E('div', { style: 'margin-bottom:8px' }, '缓存区为只读展示，手动添加请使用下方单独区域。'),
        E('div', {
          style: 'overflow:auto;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,Monaco,monospace;font-size:12px;line-height:1.6;background:#f8fafc;border-radius:8px;padding:10px;margin-bottom:8px;color:#334155'
        }, 'ip,port,colo,country,source,fail_count,last_loss,last_speed,last_latency,last_updated'),
        E('div', { style: 'font-size:12px;color:#475569;line-height:1.8' }, '仅填写 IP 时，端口默认使用 443。'),
        E('div', { style: 'font-size:12px;color:#475569;line-height:1.8' }, '地区信息为空时，保存时会自动补全。')
      ]);
    };

    var cacheTables = s.taboption('cache', form.DummyValue, '_cache_tables', '');
    cacheTables.rawhtml = true;
    cacheTables.cfgvalue = function() {
      return E('div', {}, [
        renderCacheTable('IPv4 缓存', cacheV4Text),
        renderCacheTable('IPv6 缓存', cacheV6Text),
        renderManualSection(manualText)
      ]);
    };

    var liveArea = s.taboption('log', form.DummyValue, '_live_log', '');
    liveArea.rawhtml = true;
    liveArea.cfgvalue = function() {
      window.setTimeout(startLiveTimer, 100);
      return E('div', {
        style: 'border:1px solid #d6e0eb;border-radius:10px;padding:14px;background:#fff'
      }, [
        E('div', { style: 'font-weight:700;font-size:14px;margin-bottom:6px' }, '实时运行日志'),
        E('div', {
          id: 'cf-live-status',
          style: 'font-weight:700;font-size:12px;line-height:1.35;margin-bottom:6px;color:#1e293b'
        }, '状态：' + initialState.text + ' | ' + initialState.detail),
        E('pre', {
          id: 'cf-live-log',
          style: 'white-space:pre;overflow:auto;margin:0;padding:8px 9px;border-radius:10px;background:#111827;color:#e5e7eb;font-size:11px;line-height:1.32;letter-spacing:-0.1px;height:72vh;min-height:520px;max-height:820px;font-family:ui-monospace,SFMono-Regular,Consolas,Monaco,monospace'
        }, '正在加载...')
      ]);
    };

    var refreshLog = s.taboption('log', form.Button, '_refresh_log', '刷新日志');
    refreshLog.inputstyle = 'action';
    refreshLog.onclick = function() {
      return updateLiveArea();
    };

    var clearLog = s.taboption('log', form.Button, '_clear_log', '清空日志');
    clearLog.inputstyle = 'remove';
    clearLog.onclick = function() {
      return fs.exec('/usr/bin/cf-ip-speed-client', ['clear-log']).then(function(result) {
        startLiveTimer();
        showSimpleModal('日志已清空', textOf(result), true);
      }).catch(function(error) {
        showSimpleModal('清空失败', String(error && error.message ? error.message : error), false);
      });
    };

    return m.render();
  }
});
