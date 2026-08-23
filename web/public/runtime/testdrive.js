// ============================================================
// runtime/testdrive.js — 页面内自动化驱动（仅 ?scenario= 时激活）
// 用真实 DOM 事件（click/input）驱动运行时，验证交互链路：
//   元素监听 → 页面方法 → wx API → 本地云函数 → setData → 重渲染
// 结果写入页面顶部状态条，供外部只读检查。
// ============================================================
window.WMP = window.WMP || {};

(function () {
  var params = new URLSearchParams(location.search);
  var scenario = params.get('scenario');
  if (!scenario) return;

  function q(sel, text) {
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!els.length) return null;
    if (!text) return els[0];
    for (var i = 0; i < els.length; i++) {
      if ((els[i].textContent || '').indexOf(text) > -1) return els[i];
    }
    return null;
  }

  function click(sel, text) {
    var el = q(sel, text);
    if (!el) throw new Error('点击目标不存在: ' + sel + (text ? ' 含「' + text + '」' : ''));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  function setInput(sel, value) {
    var el = q(sel);
    if (!el) throw new Error('输入目标不存在: ' + sel);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var logEl = null;
  function log(msg) {
    console.log('[testdrive] ' + msg);
    if (!logEl) {
      logEl = document.createElement('div');
      logEl.className = 'testdrive-status';
      logEl.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:30000;background:rgba(8,36,18,.94);color:#9fe8a0;font:11px/1.6 Menlo,Consolas,monospace;padding:6px 10px;white-space:pre-wrap;pointer-events:none;';
      document.getElementById('wxApp').appendChild(logEl);
    }
    logEl.textContent += msg + '\n';
  }

  window.__testdrive = { click: click, setInput: setInput, q: q, log: log };

  // 页面级异常进入状态条，便于外部排查
  window.addEventListener('error', function (e) {
    log('页面异常: ' + (e.message || e.error));
  });
  window.addEventListener('unhandledrejection', function (e) {
    log('未处理拒绝: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  function dumpPageState(tag) {
    var p = window.WMP && WMP._lastPage;
    if (!p) { log(tag + ': 无页面实例'); return; }
    log(tag + ': route=' + p.__route
      + ' roomId=' + (p.data && p.data.roomId)
      + ' myReady=' + (p.data && p.data.myReady)
      + ' roomWatcher=' + !!p._roomWatcher
      + ' participantWatcher=' + !!p._participantWatcher
      + ' messageWatcher=' + !!p._messageWatcher
      + ' msgs=' + (p.data && p.data.messages ? p.data.messages.length : '-'));
  }

  async function run() {
    await sleep(400);
    log('场景启动: ' + scenario);
    try {
      if (scenario === 'room-flow') {
        // 房间详情：准备 → 发消息（消息经 watcher 轮询回显）
        await sleep(3500);
        dumpPageState('进入后');
        var readyBtn = q('.btn', '我准备好了');
        if (readyBtn) {
          var vn = readyBtn.__vn;
          log('按钮 __vn=' + !!vn
            + ' handlers=' + (vn && vn.handlers ? JSON.stringify(vn.handlers) : '无')
            + ' ownerKeys=' + (vn && vn.owner ? typeof vn.owner.toggleReady : '无owner'));
          readyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          log('已点击「我准备好了」');
          await sleep(1800);
        } else {
          log('已处于准备态（按钮为取消准备）');
        }
        dumpPageState('准备后');
        setInput('.chat__input', '来自网页运行时的测试消息');
        await sleep(200);
        click('.chat__send');
        log('已点击发送');
        await sleep(4200); // 等 watcher 轮询回显
        dumpPageState('发送后');
        var after = document.getElementById('wxApp').innerText;
        var ready = after.indexOf('取消准备') > -1;
        var sent = after.indexOf('来自网页运行时的测试消息') > -1;
        log('准备按钮已切换: ' + ready);
        log('消息经 watcher 回显: ' + sent);
        log('RESULT ' + (ready && sent ? 'PASS' : 'FAIL'));
      } else if (scenario === 'create-room') {
        // 发起上号：先经 TabBar 切页 → 默认表单直接提交 → 应跳到房间详情
        await sleep(3000);
        click('.tabbar__item', '发起上号');
        log('已点击 TabBar「发起上号」');
        await sleep(1500);
        click('.submitbar__btn');
        log('已点击「发起上号」提交按钮');
        await sleep(3500);
        var txt = document.getElementById('wxApp').innerText;
        var ok = txt.indexOf('房间详情') > -1 && txt.indexOf('我准备好了') > -1;
        log('已进入房间详情: ' + ok);
        log('RESULT ' + (ok ? 'PASS' : 'FAIL'));
      } else if (scenario === 'dual-user') {
        // 双用户联动：Kele 停留在房间页，阿伟（另一身份）发消息 → watcher 应同步回显
        await sleep(5000);
        var roomId2 = new URLSearchParams(location.search).get('roomId') || 'rooms_5';
        var resp = await fetch('/api/cloud/sendMessage', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-uid': 'u-awei' },
          body: JSON.stringify({ data: { roomId: roomId2, content: '阿伟从另一个窗口发来的消息' } })
        }).then(function (r) { return r.json(); });
        log('阿伟发消息结果: ' + JSON.stringify(resp.result || resp.error));
        await sleep(4200); // 等 watcher 轮询
        var txt2 = document.getElementById('wxApp').innerText;
        var synced = txt2.indexOf('阿伟从另一个窗口发来的消息') > -1;
        log('Kele 页面同步到阿伟消息: ' + synced);
        log('RESULT ' + (synced ? 'PASS' : 'FAIL'));
      } else {
        log('未知场景');
        log('RESULT FAIL');
      }
    } catch (e) {
      log('异常: ' + ((e && e.message) || e));
      log('RESULT FAIL');
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 等 core.js boot 完成后再跑
    setTimeout(run, 1800);
  }
})();
