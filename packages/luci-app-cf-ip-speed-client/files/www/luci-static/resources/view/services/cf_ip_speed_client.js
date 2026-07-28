'use strict';
'require view';
'require form';
'require fs';
'require ui';

var liveTimer = null;
var liveSeenRunning = false;
var liveAutoReloadDone = false;
var liveFollowOutput = true;

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
  var match = segment.match(/(\d+)\s*\/\s*(\d+)\s*\[([^\]]+)\](?:\s*可用:\s*(\d+))?/);
  if (!match)
    return segment;

  var current = parseInt(match[1], 10) || 0;
  var total = parseInt(match[2], 10) || 0;
  var bar = match[3] || '';
  var available = match[4] || '';
  var arrowMatch = bar.match(/[↗↘↙↖]/);
  var arrow = arrowMatch ? arrowMatch[0] : '';
  var percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (match[4] ? '延迟' : '测速') + '进度 ' + current + '/' + total + ' [' + percent + '%' + (arrow ? ' ' + arrow : '') + ']' + (match[4] ? ' 可用: ' + available : '');
}

function sanitizeLogText(text) {
  var raw = String(text || '').replace(/\r/g, '\n');
  var progressPattern = /\d+\s*\/\s*\d+\s*\[[^\]]+\](?:\s*可用:\s*\d+)?/g;
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
      source: parts[4] || '',
      fail_count: parts[5] || '',
      last_loss: parts[6] || '',
      last_speed: parts[7] || '',
      last_latency: parts[8] || '',
      last_updated: parts[9] || '' 
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
  var c = E('div', { class: 'cf-glass', style: 'padding:16px;margin-top:14px' }, [
    E('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, [
      E('div', { style: 'font-size:14px;font-weight:600;color:#0f172a' }, title),
      E('span', { style: 'font-size:11px;color:#94a3b8;font-weight:500' }, '共 ' + rows.length + ' 条')
    ]),
    E('div', { style: 'max-height:' + (maxHeight||300) + 'px;overflow:auto;border-radius:12px;background:rgba(255,255,255,.5)' }, [
      E('table', { style: 'border-collapse:collapse;min-width:800px;width:100%;font-size:11px;line-height:1.45' }, [
        E('thead', {}, [E('tr', {}, columns.map(function(col) { return E('th', { style: 'position:sticky;top:0;z-index:2;background:rgba(226,232,240,.6);backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0;padding:9px 8px;text-align:left;font-size:10px;font-weight:600;color:#475569;letter-spacing:.3px;white-space:nowrap;min-width:'+col.width }, col.label); }))]),
        E('tbody', {}, rows.length ? rows.map(function(r){return E('tr',{},columns.map(function(col){return E('td',{style:'border-bottom:1px solid #f1f5f9;padding:8px;white-space:nowrap;color:#334155;max-width:'+col.width+';overflow:hidden;text-overflow:ellipsis'},displayCellValue(r,col));}));}) : [E('tr',{},[E('td',{colspan:String(columns.length),style:'padding:24px 12px;text-align:center;color:#cbd5e1;font-size:12px'},emptyText||'暂无记录')])])
      ])
    ])
  ]);
  return c;
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
    var wasNearBottom = (logNode.scrollHeight - logNode.scrollTop - logNode.clientHeight) < 36;
    logNode.textContent = sanitizeLogText(logText) || '暂无日志输出';
    // Manual upward scrolling pauses follow mode. It resumes only through the ↓ button.
    if (liveFollowOutput && wasNearBottom)
      logNode.scrollTop = logNode.scrollHeight;
    var followBtn = document.getElementById('cf-live-follow-btn');
    if (followBtn) followBtn.style.display = liveFollowOutput ? 'none' : '';
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
  var sln = document.getElementById('cf-live-status');
  if (sln) setLivePanel('running', '本轮任务已启动', '本轮日志初始化中...');
  startLiveTimer();
}

function stopLiveRun() {
  liveSeenRunning = true;
  liveAutoReloadDone = false;
  var sln = document.getElementById('cf-live-status');
  if (sln) setLivePanel('running', '正在停止本轮优选任务', '正在停止本轮优选任务，请稍候...');
  startLiveTimer();
}

function renderActionBar(map, initialStatus, initialMessage) {
  var state = resolveRunState(initialStatus || 'idle', initialMessage || '');
  if (initialStatus === 'running') liveSeenRunning = true;
  return E('div', { style: 'background:linear-gradient(135deg,#667eea,#764ba2);border-radius:20px;padding:20px;color:#fff;margin:14px 0 12px' }, [
    E('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap' }, [
      E('div', { style: 'flex:1;min-width:120px' }, [
        E('div', { style: 'font-size:11px;opacity:.8;letter-spacing:.5px' }, '运行状态'),
        E('div', { id: 'cf-action-state-text', style: 'font-size:28px;font-weight:700;margin:4px 0 2px;color:' + (state.text==='运行中'?'#bbf7d0':state.text==='停止中'?'#fecaca':'#fff') }, state.text),
        E('div', { id: 'cf-action-state-detail', style: 'font-size:11px;opacity:.6' }, state.detail)
      ]),
      E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
        E('button', { type: 'button', class: 'cf-btn', style: 'background:rgba(255,255,255,.2);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);border-radius:14px;padding:10px 22px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px',
          click: function(ev) {
            ev.preventDefault();
            return fs.exec('/usr/bin/cf-ip-speed-client',['run-background']).then(function(r){startLiveRun();}).catch(function(e){showSimpleModal('执行失败',JSON.stringify(e));});
          }
        }, [E('span', {}, '▶'), '开始优选']),
        E('button', { type: 'button', class: 'cf-btn', style: 'background:rgba(255,255,255,.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:10px 22px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px',
          click: function(ev) {
            ev.preventDefault();
            stopLiveRun();
            return fs.exec('/usr/bin/cf-ip-speed-client',['stop-background']).then(function(){window.setTimeout(updateLiveArea,800);return null;}).catch(function(e){showSimpleModal('停止失败',String(e&&e.message?e.message:e),false);});
          }
        }, [E('span', {}, '■'), '停止优选'])
      ])
    ])
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


/* ====== 毛玻璃风格 ====== */
(function(){
  var s=document.createElement('style');
  s.textContent='.cf-glass{background:rgba(255,255,255,.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:16px;box-shadow:0 4px 20px rgba(15,23,42,.04);transition:all .2s}.cf-glass:hover{box-shadow:0 8px 30px rgba(15,23,42,.08)}.cf-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 18px;border-radius:12px;font-size:12px;font-weight:600;line-height:1;border:none;cursor:pointer;transition:all .2s cubic-bezier(.4,0,.2,1)}.cf-btn-primary{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;box-shadow:0 2px 8px rgba(102,126,234,.3)}.cf-btn-primary:hover{box-shadow:0 4px 16px rgba(102,126,234,.4);transform:translateY(-1px)}.cf-btn-outline{background:#fff;color:#475569;border:1px solid #e2e8f0}.cf-btn-outline:hover{background:#f8fafc;border-color:#cbd5e1}.cf-input{width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:12px;line-height:1.5;color:#1e293b;background:rgba(255,255,255,.5);transition:border-color .2s}.cf-input:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,.12);background:#fff}.cf-select{width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:12px;color:#1e293b;background:rgba(255,255,255,.5)}.cf-select:focus{outline:none;border-color:#667eea}.cf-label{display:block;margin-bottom:4px;font-size:11px;font-weight:600;color:#64748b;letter-spacing:.3px}';
  document.head.appendChild(s);
})();

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
    	o.onchange = function(s) { this.map.save(function() { fs.exec('/usr/bin/cf-ip-speed-uci', ['commit', 'cf_ip_speed_client']).catch(function() {}); }); };
o.rmempty = false;

    o = s.taboption('basic', form.Flag, 'include_443', '始终包含 443 端口');
    o.default = '1';
    	o.onchange = function(s) { this.map.save(function() { fs.exec('/usr/bin/cf-ip-speed-uci', ['commit', 'cf_ip_speed_client']).catch(function() {}); }); };
o.rmempty = false;

    o = s.taboption('basic', form.Value, 'custom_ports', '自定义端口');
    o.placeholder = '8443, 2053, 2083';
    o.description = '多个端口请用英文逗号分隔；不填写时仅使用 443。';
    	o.onchange = function(s) { this.map.save(function() { fs.exec('/usr/bin/cf-ip-speed-uci', ['commit', 'cf_ip_speed_client']).catch(function() {}); }); };
o.rmempty = true;

    o = s.taboption('basic', form.Value, 'test_url', '自定义测速地址');
    o.placeholder = 'https://speed.example.com/__down';
    o.description = '可手动填写测速下载地址；<a href="/luci-static/resources/cf-ip-speed-client/custom-speed-test-tutorial.html" target="_blank">如何创建自定义测速地址？</a>';
    o.rmempty = true;

    var speedWorker = s.taboption('basic', form.DummyValue, '_speed_worker', '自动创建测速地址');
    speedWorker.rawhtml = true;
    speedWorker.cfgvalue = function(sectionId) { return renderSpeedWorkerWidget(this.map, sectionId); };

    o = s.taboption('basic', form.Flag, 'edgetunnel_sync_enabled', '同步到 edgetunnel');
    o.default = '0';
    o.rmempty = false;

    o = s.taboption('basic', form.Value, 'edgetunnel_sync_url', 'edgetunnel 面板地址');
    o.placeholder = 'https://your-edgetunnel.example.com';
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

    var deployArea = s.taboption('basic', form.DummyValue, '_deploy_area', '\u7ed3\u679c\u90e8\u7f72');
    deployArea.rawhtml = true;
    deployArea.cfgvalue = function(sectionId) {
      var enabled = uciGet(this.map, sectionId, 'deploy_enabled');
      var platform = uciGet(this.map, sectionId, 'deploy_platform') || 'github';
      var githubToken = uciGet(this.map, sectionId, 'github_token');
      var cfKey = uciGet(this.map, sectionId, 'cloudflare_global_api_key');
      var cfEmail = uciGet(this.map, sectionId, 'cloudflare_email');
      var repo = uciGet(this.map, sectionId, 'deploy_repo') || 'cloudflare-ip-speed-results';
      var ghBranch = uciGet(this.map, sectionId, 'deploy_branch') || 'main';
      var cfProject = uciGet(this.map, sectionId, 'cf_pages_project') || 'cloudflare-ip-speed-results';
      var cfDomainMode = uciGet(this.map, sectionId, 'cf_pages_domain_mode') || 'pages';
      var cfZone = uciGet(this.map, sectionId, 'cf_pages_zone') || '';
      var cfSubdomain = uciGet(this.map, sectionId, 'cf_pages_subdomain') || 'cfip';
      var cfPagesToken = uciGet(this.map, sectionId, 'cf_pages_api_token');
      var cfPagesConsent = uciGet(this.map, sectionId, 'cf_pages_token_consent') === '1';
      var ghDeployConsent = uciGet(this.map, sectionId, 'github_deploy_consent') === '1';

      var lastStatus = uciGet(this.map, sectionId, 'last_status') || 'idle';

      function inp(id, label, val, type, ph, onChange) {
        var w = E('div', {style:'margin:10px 0'});
        w.appendChild(E('label', {class:'cf-label'}, label));
        var r = E('div', {style:'display:flex;gap:6px;align-items:center'});
        var i = E('input', {id:id, type:type||'text', value:val, placeholder:ph||'', class:'cbi-input-text', style:'flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
        if (onChange) i.onchange = onChange;
        i.onblur = function() { if (this.dataset && this.dataset.uciKey) sv(this.dataset.uciKey, this.value); };
        r.appendChild(i);
        if(type==='password'){var e=E('button',{type:'button',class:'cf-btn cf-btn-outline',style:'min-width:36px;height:40px;padding:0 12px'},'👁');e.onclick=function(){i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈';};r.appendChild(e);}
        w.appendChild(r); return w;
      }
      function sv(key, value) {
        return fs.exec('/usr/bin/cf-ip-speed-uci', ['set', 'cf_ip_speed_client.main.' + key + '=' + value]).then(function() {
          return fs.exec('/usr/bin/cf-ip-speed-uci', ['commit', 'cf_ip_speed_client']);
        }).catch(function() {});
      }
      function renderDeployLinks(out) {
        var box = document.getElementById('cf-deploy-links');
        if (!box) return;
        var urls = String(out || '').match(/https?:\/\/[^\s]+\/ADD(?:-[0-9]+)?\.txt/g) || [];
        urls = urls.filter(function(v, i, a) { return a.indexOf(v) === i; });
        if (!urls.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        box.style.display = ''; box.innerHTML = '';
        urls.forEach(function(url) {
          var name = url.split('/').pop();
          var row = E('div', {style:'display:flex;gap:6px;align-items:center;margin:6px 0'});
          row.appendChild(E('span', {style:'width:105px;font-weight:600;font-size:12px;color:#334155'}, name === 'ADD.txt' ? '全部结果' : name));
          row.appendChild(E('a', {href:url,target:'_blank',style:'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2563eb;font-size:12px'}, url));
          var cp = E('button', {type:'button',class:'cf-btn cf-btn-outline',style:'height:30px;padding:0 9px'}, '复制');
          cp.onclick = function() { navigator.clipboard.writeText(url).then(function(){ ui.addNotification(null,E('p','已复制 '+name)); }); };
          row.appendChild(cp); box.appendChild(row);
        });
      }
      function deployNow() {
        var db = document.getElementById('cf-deploy-btn');
        if (!db || db.disabled) return;
        var kind=document.getElementById('cf-deploy-kind'); var selected=kind?kind.value:'github';
        if ((selected==='github'&&!ghDeployConsent)||(selected==='cloudflare'&&!cfPagesConsent)){ var msg='请先勾选当前部署平台的授权确认框。'; var el0=document.getElementById('cf-deploy-result');if(el0)el0.value=msg;updateStatusHint('error');return; }
        db.disabled = true; db.textContent = '部署中...'; updateStatusHint('deploying');
        fs.exec('/usr/bin/cf-ip-speed-deploy').then(function(r) {
          var out = textOf(r), el = document.getElementById('cf-deploy-result');
          if (el) el.value = out;
          db.disabled = false; db.textContent = '立即部署';
          if (/https?:\/\/[^\s]+\/ADD(?:-[0-9]+)?\.txt/.test(out)) { renderDeployLinks(out); updateStatusHint('deployed'); }
          else { updateStatusHint('error'); }
        }).catch(function(e) {
          var el = document.getElementById('cf-deploy-result'); if (el) el.value = String(e);
          db.disabled = false; db.textContent = '立即部署'; updateStatusHint('error');
        });
      }
      function updateStatusHint(state) {
        var el = document.getElementById('cf-deploy-status-hint');
        if (!el) return;
        if (state === 'deployed') {
          el.innerHTML = '<span style="color:#059669;font-weight:600">✓ 部署已完成</span>';
        } else if (state === 'error') {
          el.innerHTML = '<span style="color:#dc2626;font-weight:600">✗ 部署失败，请检查配置</span>';
        } else if (state === 'noresult') {
          el.innerHTML = '<span style="color:#d97706;font-weight:600">⏳ 暂无优选结果，请先执行优选</span>';
        } else if (state === 'deploying') {
          el.innerHTML = '<span style="color:#2563eb;font-weight:600">⟳ 部署中...</span>';
        } else {
          el.innerHTML = '<span style="color:#64748b">配置后自动部署</span>';
        }
      }
      function computeDeployUrl() {
        var kind = document.getElementById('cf-deploy-kind') ? document.getElementById('cf-deploy-kind').value : 'github';
        var url = '';
        if (kind === 'github') {
          var repoEl = document.getElementById('cf-deploy-gh-repo');
          var repoName = repoEl ? repoEl.value.trim() : '';
          var branchEl = document.getElementById('cf-deploy-gh-branch');
          var branch = branchEl && branchEl.value.trim() ? branchEl.value.trim() : 'main';
          url = repoName.indexOf('/') > 0 ? 'https://raw.githubusercontent.com/' + repoName + '/' + branch + '/ADD.txt' : '配置 owner/repository 后生成';
        } else {
          var mode = document.getElementById('cf-deploy-cf-domain') ? document.getElementById('cf-deploy-cf-domain').value : 'pages';
          var proj = document.getElementById('cf-deploy-cf-project') ? document.getElementById('cf-deploy-cf-project').value : 'cloudflare-ip-speed-results';
          var sub = document.getElementById('cf-deploy-cf-subdomain') ? document.getElementById('cf-deploy-cf-subdomain').value : 'cfip';
          var zone = document.getElementById('cf-deploy-cf-zone') ? document.getElementById('cf-deploy-cf-zone').value : '';
          url = (mode === 'pages' || !zone) ? 'https://' + proj + '.pages.dev/ADD.txt' : 'https://' + sub + '.' + zone + '/ADD.txt';
        }
        var el = document.getElementById('cf-deploy-url-display');
        if (el) {
          el.textContent = url;
          el.href = url;
        }
        return url;
      }
      function configChanged() {
        computeDeployUrl();
        // 有缓存结果直接部署，否则提示
        var hasResult = (uciGet(this.map, 'main', 'last_status') === 'ok');
        if (hasResult) {
          deployNow();
        } else {
          updateStatusHint('noresult');
        }
      }

      var c = E('div', {style:'border:1px solid #e8edf5;border-radius:16px;padding:16px;background:#fff;margin-top:4px'});
      var h = E('div', {style:'display:flex;align-items:center;gap:10px;margin-bottom:6px'});
      var chk = E('input', {type:'checkbox',id:'cf-deploy-enable',class:'cbi-input-checkbox'});
      if(enabled==='1')chk.checked=true;
      chk.onchange=function(){
        var d=document.getElementById('cf-deploy-config');
        if(d)d.style.display=this.checked?'':'none';
        sv('deploy_enabled', this.checked?'1':'0');
        if (this.checked) {
          // 首次启用：有结果就部署，否则提示
          if (lastStatus === 'ok') { deployNow(); }
          else { updateStatusHint('noresult'); }
        }
      };
      h.appendChild(chk); h.appendChild(E('label',{style:'font-weight:600;font-size:14px;color:#1e293b;cursor:pointer',onclick:function(){chk.click();}},'启用结果部署'));
      c.appendChild(h);

      // 状态提示
      var hintBar = E('div',{id:'cf-deploy-status-hint',style:'margin:6px 0 10px;padding:8px 12px;border-radius:10px;font-size:12px'});
      if (enabled === '1' && lastStatus === 'ok') {
        hintBar.innerHTML = '<span style="color:#059669;font-weight:600">✓ 已有优选结果，配置后自动部署</span>';
      } else if (enabled === '1' && lastStatus !== 'ok') {
        hintBar.innerHTML = '<span style="color:#d97706;font-weight:600">⏳ 暂无优选结果，请先执行优选</span>';
      }
      c.appendChild(hintBar);

      var cd = E('div',{id:'cf-deploy-config'}); if(enabled!=='1')cd.style.display='none';
      cd.appendChild(E('div',{class:'cf-label'},'部署平台'));
      var ks=E('select',{id:'cf-deploy-kind',class:'cbi-input-select',style:'width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
      ks.innerHTML='<option value="github">GitHub</option><option value="cloudflare">Cloudflare Pages</option>';ks.value=platform;
      ks.onchange=function(){ togglePlatform(this.value); sv('deploy_platform',this.value); window.setTimeout(computeDeployUrl,100); };
      cd.appendChild(ks);
      var gd=E('div',{id:'cf-deploy-github-fields'});if(platform!=='github')gd.style.display='none';
      gd.appendChild(inp('cf-deploy-gh-token','GitHub Token',githubToken,'password','Personal Access Token'));
      gd.appendChild(E('div', {style:'display:flex;gap:8px;margin:6px 0 14px'}, [
        E('button',{type:'button',class:'cf-btn cf-btn-primary',onclick:function(){saveToken('github');window.setTimeout(configChanged,500);}},'保存'),
        E('button',{type:'button',class:'cf-btn cf-btn-outline',onclick:function(){var v=document.getElementById('cf-deploy-gh-token');if(v&&v.value)fs.exec('/usr/bin/cf-ip-speed-token-check',['github',v.value]).then(function(r){showSimpleModal('检查结果',textOf(r));});}},'检查')
      ]));
      var ghAuth=E('label',{style:'display:flex;gap:12px;align-items:flex-start;margin:14px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;font-size:13px;line-height:1.65;color:#475569;cursor:pointer'});var ghAuthCheck=E('input',{type:'checkbox',checked:ghDeployConsent,class:'cbi-input-checkbox',style:'width:22px;height:22px;min-width:22px;margin:0;accent-color:#667eea;cursor:pointer'});ghAuthCheck.onchange=function(){ghDeployConsent=this.checked;sv('github_deploy_consent',this.checked?'1':'0');};ghAuth.appendChild(ghAuthCheck);ghAuth.appendChild(E('span',{},'我同意本路由器使用上述 GitHub Token 向所填仓库写入优选结果文件。未勾选时禁止 GitHub 部署。'));gd.appendChild(ghAuth);
      gd.appendChild(inp('cf-deploy-gh-repo','仓库名称',repo,'text','owner/repository',function(){sv('deploy_repo',this.value);window.setTimeout(computeDeployUrl,100);}));
      gd.appendChild(inp('cf-deploy-gh-branch','分支',ghBranch,'text','main',function(){sv('deploy_branch',this.value);window.setTimeout(computeDeployUrl,100);}));
      cd.appendChild(gd);

      var cfd=E('div',{id:'cf-deploy-cf-fields'});if(platform!=='cloudflare')cfd.style.display='none';
      cfd.appendChild(inp('cf-deploy-cf-key','Cloudflare Global API Key',cfKey,'password','Global API Key'));
      cfd.appendChild(inp('cf-deploy-cf-email','Cloudflare 账户邮箱',cfEmail,'email','your@email.com'));
      cfd.appendChild(E('div', {style:'display:flex;gap:8px;margin:6px 0 14px'}, [
        E('button',{type:'button',class:'cf-btn cf-btn-primary',onclick:function(){saveToken('cloudflare');window.setTimeout(configChanged,500);}},'保存'),
        E('button',{type:'button',class:'cf-btn cf-btn-outline',onclick:function(){var k=document.getElementById('cf-deploy-cf-key'),e=document.getElementById('cf-deploy-cf-email');if(k&&e&&k.value&&e.value)fs.exec('/usr/bin/cf-ip-speed-token-check',['cloudflare',k.value,e.value]).then(function(r){showSimpleModal('检查结果',textOf(r));});}},'检查')
      ]));
      cfd.appendChild(inp('cf-deploy-pages-token','Pages 发布 API Token（可选）',cfPagesToken,'password','可自行创建并粘贴；留空则按授权在首次发布时创建'));
      cfd.appendChild(E('div',{style:'font-size:12px;line-height:1.55;color:#64748b;margin:-4px 0 12px'},cfPagesToken ? '已保存 Pages 发布 Token（为安全起见不会显示内容）。' : '未保存 Pages 发布 Token：勾选授权后，系统仅在首次实际发布时自动创建。'));
      cfd.appendChild(E('button',{type:'button',class:'cf-btn cf-btn-outline',onclick:function(){var v=document.getElementById('cf-deploy-pages-token');if(v&&v.value){sv('cf_pages_api_token',v.value).then(function(){ui.addNotification(null,E('p','Pages 发布 Token 已安全保存，不会显示。'));});}}},'保存自定义 Pages Token'));

      var cfAuth=E('label',{style:'display:flex;gap:12px;align-items:flex-start;margin:14px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;font-size:13px;line-height:1.65;color:#475569;cursor:pointer'});var cfAuthCheck=E('input',{type:'checkbox',checked:cfPagesConsent,class:'cbi-input-checkbox',style:'width:22px;height:22px;min-width:22px;margin:0;accent-color:#667eea;cursor:pointer'});cfAuthCheck.onchange=function(){cfPagesConsent=this.checked;sv('cf_pages_token_consent',this.checked?'1':'0');};cfAuth.appendChild(cfAuthCheck);cfAuth.appendChild(E('span',{},'我同意本路由器使用 Cloudflare 凭据或 Pages Token 创建/更新 Pages 发布内容。未勾选时禁止 Cloudflare Pages 部署；首次实际发布才会按需创建 Token。'));cfd.appendChild(cfAuth);

      var pp=E('input',{id:'cf-deploy-cf-project',type:'text',value:cfProject,placeholder:'cloudflare-ip-speed-results',class:'cf-input',style:'flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
      pp.onchange=function(){sv('cf_pages_project',this.value);window.setTimeout(configChanged,300);};
      var ppw=E('div',{style:'margin:8px 0'});ppw.appendChild(E('div',{class:'cf-label'},'Pages 项目名'));ppw.appendChild(E('div',{style:'display:flex;gap:6px;align-items:center'},[pp]));cfd.appendChild(ppw);

      var dms=E('select',{id:'cf-deploy-cf-domain',class:'cbi-input-select',style:'width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
      dms.innerHTML='<option value="pages">使用 pages.dev 域名</option><option value="custom">使用已有顶级域名</option>';dms.value=cfDomainMode;
      dms.onchange=function(){var w=document.getElementById('cf-deploy-cf-zone-wrap');if(w)w.style.display=this.value==='custom'?'':'none';sv('cf_pages_domain_mode',this.value);window.setTimeout(configChanged,300);};
      cfd.appendChild(E('div',{class:'cf-label'},'域名方式')); cfd.appendChild(dms);

      var zw=E('div',{id:'cf-deploy-cf-zone-wrap'});if(cfDomainMode!=='custom')zw.style.display='none';
      zw.appendChild(E('div',{class:'cf-label'},'已有顶级域名（自动读取）'));
      var zs=E('select',{id:'cf-deploy-cf-zone',class:'cbi-input-select',style:'width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
      zs.dataset.savedZone=cfZone;
      zs.onchange=function(){sv('cf_pages_zone',this.value);window.setTimeout(computeDeployUrl,100);};
      zs.innerHTML='<option value="">正在读取已有域名…</option>';zw.appendChild(zs);cfd.appendChild(zw);

      var sd=E('input',{id:'cf-deploy-cf-subdomain',type:'text',value:cfSubdomain,placeholder:'cfip',class:'cf-input',style:'flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#fafbfc'});
      sd.onchange=function(){sv('cf_pages_subdomain',this.value);window.setTimeout(configChanged,300);};
      var sdw=E('div',{style:'margin:8px 0'});sdw.appendChild(E('div',{class:'cf-label'},'自定义二级域名'));sdw.appendChild(E('div',{style:'display:flex;gap:6px;align-items:center'},[sd]));cfd.appendChild(sdw);
      cd.appendChild(cfd);

      // 预先计算的部署地址（可点击访问）
      cd.appendChild(E('div',{style:'margin-top:12px'}));
      cd.appendChild(E('div',{class:'cf-label'},'部署地址'));
      var urlWrap = E('div',{style:'display:flex;gap:6px;align-items:center'});
      var urlLink = E('a',{id:'cf-deploy-url-display',href:'#',target:'_blank',style:'flex:1;display:block;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;background:#f0f4ff;color:#2563eb;font-weight:600;text-decoration:none;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'},'配置后自动生成');
      urlLink.onclick = function() {
        var url = this.textContent;
        if (url && url !== '配置后自动生成' && url.startsWith('http')) {
          window.open(url, '_blank');
        }
        return false;
      };
      urlWrap.appendChild(urlLink);
      var cb2=E('button',{type:'button',class:'cf-btn cf-btn-outline',style:'min-width:44px;padding:0 12px;height:42px'},'复制');
      cb2.onclick=function(){var t=document.getElementById('cf-deploy-url-display');if(t){var url=t.textContent;if(url&&url!=='配置后自动生成'){navigator.clipboard.writeText(url).then(function(){ui.addNotification(null,E('p','已复制'));}).catch(function(){});}}};
      urlWrap.appendChild(cb2);
      cd.appendChild(urlWrap);
      var linkBox = E('div',{id:'cf-deploy-links',style:'display:none;margin-top:10px;padding:8px 10px;border:1px solid #dbeafe;border-radius:10px;background:#f8fbff'});
      cd.appendChild(linkBox);

      // 部署按钮
      cd.appendChild(E('div',{style:'display:flex;gap:8px;margin:12px 0'}));
      var db=E('button',{type:'button',id:'cf-deploy-btn',class:'cf-btn cf-btn-primary',style:'flex:1'},'立即部署');
      db.onclick=deployNow;
      cd.appendChild(db);
      cd.appendChild(E('textarea',{id:'cf-deploy-result',class:'cbi-input-textarea',style:'width:100%;min-height:80px;margin-top:10px;font-size:11px;font-family:monospace;border-radius:12px;padding:10px 12px;box-sizing:border-box',readonly:true,placeholder:'部署结果'}));

      c.appendChild(cd);
      window.setTimeout(function(){
        var map = {'cf-deploy-gh-token':'github_token','cf-deploy-gh-repo':'deploy_repo','cf-deploy-gh-branch':'deploy_branch','cf-deploy-cf-key':'cloudflare_global_api_key','cf-deploy-cf-email':'cloudflare_email','cf-deploy-pages-token':'cf_pages_api_token','cf-deploy-cf-project':'cf_pages_project','cf-deploy-cf-subdomain':'cf_pages_subdomain'};
        Object.keys(map).forEach(function(id){var el=document.getElementById(id);if(el){el.dataset.uciKey=map[id];el.onchange=(function(old,key){return function(){sv(key,this.value);if(old)old.call(this);};})(el.onchange,map[id]);}});
        computeDeployUrl();loadCfZones();
      }, 200);
      return c;
    }
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
          style: 'white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;overflow-x:hidden;margin:0;padding:8px 9px;border-radius:10px;background:#111827;color:#e5e7eb;font-size:10px;line-height:1.42;height:52vh;min-height:360px;max-height:560px;font-family:ui-monospace,SFMono-Regular,Consolas,Monaco,monospace',
          scroll: function(ev) {
            var el = ev.currentTarget;
            if ((el.scrollHeight - el.scrollTop - el.clientHeight) > 40) {
              liveFollowOutput = false;
              var b = document.getElementById('cf-live-follow-btn'); if (b) b.style.display = '';
            }
          }
        }, '正在加载...'),
        E('button', {
          id: 'cf-live-follow-btn', type: 'button', class: 'cf-btn cf-btn-primary',
          style: 'display:none;position:sticky;bottom:12px;float:right;margin:-48px 14px 14px 0;z-index:3;padding:9px 14px;font-size:13px',
          click: function() { var el=document.getElementById('cf-live-log'); liveFollowOutput=true; if(el)el.scrollTop=el.scrollHeight; this.style.display='none'; }
        }, '↓ 跳到最新'),
        E('div', {style:'display:flex;gap:10px;margin-top:12px'}, [
          E('button', {type:'button',class:'cf-btn cf-btn-primary',click:function(){return updateLiveArea();}}, '刷新日志'),
          E('button', {type:'button',class:'cf-btn',style:'background:#ef4444;color:#fff',click:function(){return fs.exec('/usr/bin/cf-ip-speed-client',['clear-log']).then(function(r){startLiveTimer();showSimpleModal('日志已清空',textOf(r),true);}).catch(function(e){showSimpleModal('清空失败',String(e&&e.message?e.message:e),false);});}}, '清空日志')
        ])
      ]);
    };

    // Actions live inside the log card so they do not leave an empty LuCI form row.
    var refreshLog = s.taboption('log', form.DummyValue, '_refresh_log', '');
    refreshLog.rawhtml = true;
    refreshLog.cfgvalue = function() { return E('span', {style:'display:none'}); };

    var clearLog = s.taboption('log', form.DummyValue, '_clear_log', '');
    clearLog.rawhtml = true;
    clearLog.cfgvalue = function() { return E('span', {style:'display:none'}); };

    return m.render().then(function(node) {
      // Persist every normal form input/select immediately. Deployment widgets
      // use their explicit UCI binding above.
      var timer = null;
      function persist() {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function() {
          m.save().then(function(){ return fs.exec('/usr/bin/cf-ip-speed-uci',['commit','cf_ip_speed_client']); }).catch(function(){});
        }, 180);
      }
      node.addEventListener('change', function(ev) { var e=ev.target; if (e && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== 'button') persist(); }, true);
      node.addEventListener('blur', function(ev) { var e=ev.target; if (e && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== 'button') persist(); }, true);
      return node;
    });
  }
});

function renderSpeedWorkerWidget(map, sectionId) {
  var consent = uciGet(map, sectionId, 'cf_speed_worker_consent') === '1';
  var mode = uciGet(map, sectionId, 'cf_speed_worker_domain_mode') || 'workers';
  var zone = uciGet(map, sectionId, 'cf_speed_worker_zone') || '';
  var sub = uciGet(map, sectionId, 'cf_speed_worker_subdomain') || 'speed';
  var name = uciGet(map, sectionId, 'cf_speed_worker_name') || 'cf-speed-test';
  function sv(k,v) { return fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.'+k+'='+v]).then(function(){return fs.exec('/usr/bin/cf-ip-speed-uci',['commit','cf_ip_speed_client']);}); }
  function input(label,id,value,placeholder) { var w=E('div',{style:'margin:9px 0'});w.appendChild(E('div',{class:'cf-label'},label));var x=E('input',{id:id,type:'text',value:value,placeholder:placeholder||'',class:'cf-input'});w.appendChild(x);return {w:w,x:x}; }
  var box=E('div',{style:'margin:8px 0 16px;padding:14px;border:1px solid #dbe3f0;border-radius:14px;background:#fbfcff'});
  box.appendChild(E('div',{style:'font-size:12px;color:#64748b;line-height:1.6;margin-bottom:10px'},'自动创建一个仅用于测速的 Cloudflare Worker。域名为可选：留空即可使用 workers.dev。'));
  var auth=E('label',{style:'display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:12px;line-height:1.6;cursor:pointer'});
  var ac=E('input',{type:'checkbox',checked:consent,class:'cbi-input-checkbox',style:'width:21px;height:21px;min-width:21px;margin:0;accent-color:#667eea'});
  ac.onchange=function(){ if(!this.checked){sv('cf_speed_worker_consent','0');return;} fs.exec('/usr/bin/cf-ip-speed-worker-auth-check',[]).then(function(r){var t=textOf(r);if(/可用|success|有效|ok/i.test(t)){sv('cf_speed_worker_consent','1');}else{this.checked=false;showSimpleModal('无法授权','Cloudflare 凭据无效或尚未保存。请先在“结果部署 → Cloudflare Pages”保存账户邮箱和 Global API Key，再勾选。');}}.bind(this)).catch(function(){this.checked=false;showSimpleModal('无法授权','请先保存并检查 Cloudflare 凭据。');}.bind(this)); };
  auth.appendChild(ac);auth.appendChild(E('span',{},'我同意本路由器使用已保存的 Cloudflare 凭据创建或更新测速 Worker。未授权时不能创建。'));box.appendChild(auth);
  var ms=E('select',{class:'cf-select',style:'margin-top:10px'});ms.innerHTML='<option value="workers">使用自动 workers.dev 地址（无需填写域名）</option><option value="custom">使用自己的 Cloudflare 域名</option>';ms.value=mode;box.appendChild(ms);
  var zw=E('div',{});var ziw=E('div',{style:'margin:9px 0'});ziw.appendChild(E('div',{class:'cf-label'},'已有顶级域名（自动读取）'));var zix=E('select',{id:'cf-speed-worker-zone',class:'cf-select'});zix.dataset.savedZone=zone;zix.innerHTML='<option value="">正在读取已有域名…</option>';ziw.appendChild(zix);var zi={w:ziw,x:zix};var si=input('二级域名前缀','cf-speed-worker-subdomain',sub,'speed');zw.appendChild(zi.w);zw.appendChild(si.w);if(mode!=='custom')zw.style.display='none';box.appendChild(zw);
  var ni=input('Worker 名称', 'cf-speed-worker-name', name, 'cf-speed-test');box.appendChild(ni.w);
  ms.onchange=function(){zw.style.display=this.value==='custom'?'':'none';sv('cf_speed_worker_domain_mode',this.value);if(this.value==='custom')loadCfZones();};zi.x.onchange=function(){sv('cf_speed_worker_zone',this.value);};si.x.onchange=function(){sv('cf_speed_worker_subdomain',this.value);};ni.x.onchange=function(){sv('cf_speed_worker_name',this.value);};window.setTimeout(loadCfZones,150);
  var progress=E('pre',{id:'cf-speed-worker-progress',style:'display:none;white-space:pre-wrap;margin:10px 0 0;padding:10px;border-radius:10px;background:#111827;color:#e5e7eb;font-size:11px;min-height:48px'});
  var btn=E('button',{type:'button',class:'cf-btn cf-btn-primary',style:'margin-top:11px'},'自动创建测速地址');
    btn.onclick=function(){if(!ac.checked){showSimpleModal('需要授权','请先勾选上方的 Worker 创建授权。');return;} if(ms.value==='custom'&&(!zi.x.value.trim()||!si.x.value.trim())){showSimpleModal('请完善域名','选择自定义域名时，需要填写顶级域名和二级域名前缀。');return;} btn.disabled=true;btn.textContent='正在检查…';progress.style.display='';progress.textContent='正在检查 Worker 名称、二级域名和路由占用情况…';Promise.all([sv('cf_speed_worker_consent','1'),sv('cf_speed_worker_domain_mode',ms.value),sv('cf_speed_worker_zone',zi.x.value.trim()),sv('cf_speed_worker_subdomain',si.x.value.trim()),sv('cf_speed_worker_name',ni.x.value.trim()||'cf-speed-test')]).then(function(){return fs.exec('/usr/bin/cf-ip-speed-worker-preflight');}).then(function(r){var out=textOf(r);progress.textContent=out;if(!/OK=/.test(out))throw new Error(out||'预检查未通过');btn.textContent='创建中…';return fs.exec('/usr/bin/cf-ip-speed-worker-create-background');}).then(function(){var n=0;var timer=window.setInterval(function(){fs.exec('/usr/bin/cf-ip-speed-worker-create',['status']).then(function(r){var out=textOf(r);progress.textContent=out||'正在连接 Cloudflare…';var m=out.match(/完成：(https?:\/\/[^\s]+)/);if(m||/错误：/.test(out)||n++>50){window.clearInterval(timer);btn.disabled=false;btn.textContent='自动创建测速地址';if(m){var field=document.querySelector('[id$="test_url"]');if(field){field.value=m[1];field.dispatchEvent(new Event('change',{bubbles:true}));}sv('test_url',m[1]);showSimpleModal('测速地址创建完成','已自动填写并保存：\n'+m[1]);}else if(/错误：/.test(out)){showSimpleModal('创建失败',out);}else{showSimpleModal('创建超时','请稍后查看测速地址和创建日志。');}}}).catch(function(){});},1000);}).catch(function(e){btn.disabled=false;btn.textContent='自动创建测速地址';var msg=String(e&&e.message?e.message:e);progress.textContent=msg;showSimpleModal('预检查未通过',msg);});};box.appendChild(btn);box.appendChild(progress);return box;
}

function saveToken(kind) {
  if (kind === 'github') {
    var v = document.getElementById('cf-deploy-gh-token').value;
    Promise.all([fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.github_token='+v]),fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.deploy_platform=github'])]).then(function(){return fs.exec('/usr/bin/cf-ip-speed-uci',['commit','cf_ip_speed_client']);}).then(function(){ui.addNotification(null,E('p','GitHub Token \u5df2\u4fdd\u5b58'));}).catch(function(e){showSimpleModal('\u4fdd\u5b58\u5931\u8d25',String(e));});
  } else {
    var k=document.getElementById('cf-deploy-cf-key').value;var e=document.getElementById('cf-deploy-cf-email').value;
    Promise.all([fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.cloudflare_global_api_key='+k]),fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.cloudflare_email='+e]),fs.exec('/usr/bin/cf-ip-speed-uci',['set','cf_ip_speed_client.main.deploy_platform=cloudflare'])]).then(function(){return fs.exec('/usr/bin/cf-ip-speed-uci',['commit','cf_ip_speed_client']);}).then(function(){ui.addNotification(null,E('p','Cloudflare \u51ed\u636e\u5df2\u4fdd\u5b58'));}).catch(function(e){showSimpleModal('\u4fdd\u5b58\u5931\u8d25',String(e));});
  }
}
function loadCfZones() {
  var targets = [document.getElementById('cf-deploy-cf-zone'), document.getElementById('cf-speed-worker-zone')].filter(Boolean);
  if (!targets.length) return;
  var keyEl=document.getElementById('cf-deploy-cf-key'), emailEl=document.getElementById('cf-deploy-cf-email');
  var key=keyEl&&keyEl.value||'', email=emailEl&&emailEl.value||'';
  function populate(zones) {
    targets.forEach(function(sel) {
      var saved=sel.dataset.savedZone || sel.value || '';
      sel.innerHTML='';
      var first=E('option',{value:''}, zones.length?'请选择已有域名（'+zones.length+'个）':'没有找到域名');sel.appendChild(first);
      zones.forEach(function(z){sel.appendChild(E('option',{value:z},z));});
      // Crucial: async loading must restore the UCI selection instead of returning to placeholder.
      if (saved && zones.indexOf(saved)>=0) sel.value=saved;
    });
  }
  function load(k,e) { fs.exec('/usr/bin/cf-ip-speed-token-check',['zone',k,e]).then(function(r){ var zones=String(r.stdout||'').split(/[\r\n]+/).map(function(x){return x.trim();}).filter(function(x){return x.indexOf('.')>0;});populate(zones); }).catch(function(){populate([]);}); }
  if(key&&email) load(key,email);
  else Promise.all([fs.exec('/usr/bin/cf-ip-speed-uci',['get','cf_ip_speed_client.main.cloudflare_global_api_key']),fs.exec('/usr/bin/cf-ip-speed-uci',['get','cf_ip_speed_client.main.cloudflare_email'])]).then(function(r){key=(r[0].stdout||'').trim();email=(r[1].stdout||'').trim();if(key&&email)load(key,email);else populate([]);}).catch(function(){populate([]);});
}

function togglePlatform(value) {
  var gh = document.getElementById('cf-deploy-github-fields');
  var cf = document.getElementById('cf-deploy-cf-fields');
  if (gh) gh.style.display = value === 'github' ? '' : 'none';
  if (cf) cf.style.display = value === 'cloudflare' ? '' : 'none';
}
