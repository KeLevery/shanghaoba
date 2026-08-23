// ============================================================
// runtime/wxapi.js — 微信 wx API 浏览器模拟
// 覆盖项目实际用到的 API 子集：
//   UI：showToast / showModal / showLoading / hideLoading / setNavigationBarTitle
//   导航：navigateTo / redirectTo / navigateBack / reLaunch / switchTab / stopPullDownRefresh
//   存储：*StorageSync 系列
//   云：cloud.callFunction（→本地 Node 服务）/ cloud.database（查询 + 轮询 watch）
// ============================================================
window.WMP = window.WMP || {};

WMP.wxapi = (function () {
  var UID = localStorage.getItem('shb-uid') || 'u-kele';

  // ---------- UI 层容器 ----------
  var uiRoot = null;
  function ensureUI() {
    if (uiRoot) return uiRoot;
    uiRoot = document.createElement('div');
    uiRoot.className = 'wx-ui-root';
    uiRoot.innerHTML =
      '<div class="wx-loading-mask" style="display:none"><div class="wx-loading-box"><div class="wx-loading-spin"></div><div class="wx-loading-text"></div></div></div>' +
      '<div class="wx-toast" style="display:none"><div class="wx-toast__icon"></div><div class="wx-toast-title"></div></div>' +
      '<div class="wx-modal-mask" style="display:none"><div class="wx-modal"></div></div>';
    document.getElementById('wxApp').appendChild(uiRoot);
    return uiRoot;
  }

  var toastTimer = null;
  function showToast(opts) {
    ensureUI();
    var el = uiRoot.querySelector('.wx-toast');
    var icon = uiRoot.querySelector('.wx-toast__icon');
    var title = uiRoot.querySelector('.wx-toast-title');
    el.style.display = 'flex';
    el.classList.toggle('wx-toast--plain', !opts.icon || opts.icon === 'none');
    if (opts.icon === 'success') {
      icon.textContent = '✓';
    } else if (opts.icon === 'error') {
      icon.textContent = '✕';
    } else {
      icon.textContent = '';
    }
    title.textContent = opts.title || '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, opts.duration || 1800);
  }

  function showLoading(opts) {
    ensureUI();
    var mask = uiRoot.querySelector('.wx-loading-mask');
    uiRoot.querySelector('.wx-loading-text').textContent = (opts && opts.title) || '加载中';
    mask.style.display = 'flex';
  }

  function hideLoading() {
    if (!uiRoot) return;
    uiRoot.querySelector('.wx-loading-mask').style.display = 'none';
  }

  var modalQueue = [];
  var modalActive = false;
  function showModal(opts) {
    modalQueue.push(opts || {});
    runModalQueue();
  }
  function runModalQueue() {
    if (modalActive || !modalQueue.length) return;
    modalActive = true;
    var opts = modalQueue.shift();
    ensureUI();
    var mask = uiRoot.querySelector('.wx-modal-mask');
    var box = uiRoot.querySelector('.wx-modal');
    var showCancel = opts.showCancel !== false;
    box.innerHTML =
      '<div class="wx-modal__title">' + esc(opts.title || '提示') + '</div>' +
      '<div class="wx-modal__content">' + esc(opts.content || '') + '</div>' +
      '<div class="wx-modal__btns">' +
      (showCancel ? '<div class="wx-modal__btn" data-r="cancel">' + esc(opts.cancelText || '取消') + '</div>' : '') +
      '<div class="wx-modal__btn wx-modal__btn--confirm" data-r="confirm" style="color:' + (opts.confirmColor || '#07c160') + '">' + esc(opts.confirmText || '确定') + '</div>' +
      '</div>';
    mask.style.display = 'flex';
    box.querySelectorAll('.wx-modal__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mask.style.display = 'none';
        modalActive = false;
        var confirmed = btn.getAttribute('data-r') === 'confirm';
        if (opts.success) opts.success({ confirm: confirmed, cancel: !confirmed });
        runModalQueue();
      });
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 云函数 ----------
  function callFunction(opts) {
    return fetch('/api/cloud/' + encodeURIComponent(opts.name), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-uid': UID },
      body: JSON.stringify({ data: opts.data || {} })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.error) {
          var err = new Error(json.error);
          if (opts.fail) opts.fail(err);
          throw err;
        }
        if (opts.success) opts.success({ result: json.result });
        return { result: json.result };
      });
  }

  // ---------- 数据库（查询 + 轮询 watch） ----------
  function dbPost(query) {
    return fetch('/api/db', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-uid': UID },
      body: JSON.stringify(query)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.error) throw new Error(json.error);
        return json.data || [];
      });
  }

  var WATCH_INTERVAL = 1200;

  function makeChainable(state) {
    // 不可变链式构建：每次调用返回携带独立 state 的新链，
    // 避免同一 database() 派生的多个查询/watch 相互覆盖
    var api = {
      collection: function (name) { return makeChainable(Object.assign({}, state, { collection: name })); },
      doc: function (id) { return makeChainable(Object.assign({}, state, { docId: id })); },
      where: function (cond) { return makeChainable(Object.assign({}, state, { where: cond })); },
      orderBy: function (field, dir) { return makeChainable(Object.assign({}, state, { orderBy: field, orderDir: dir })); },
      limit: function (n) { return makeChainable(Object.assign({}, state, { limit: n })); },
      get: function () {
        return dbPost(state).then(function (data) { return { data: data }; });
      },
      watch: function (handlers) {
        var last = null;
        var closed = false;
        var timer = null;
        var poll = function () {
          if (closed) return;
          dbPost(state)
            .then(function (data) {
              if (closed) return;
              var sig;
              try { sig = JSON.stringify(data); } catch (e) { sig = String(Date.now()); }
              if (sig !== last) {
                last = sig;
                if (handlers.onChange) handlers.onChange({ docs: data, type: 'init' });
              }
            })
            .catch(function (err) {
              if (handlers.onError && !closed) handlers.onError(err);
            });
        };
        poll();
        timer = setInterval(poll, WATCH_INTERVAL);
        return {
          close: function () {
            closed = true;
            if (timer) clearInterval(timer);
          }
        };
      }
    };
    return api;
  }

  // ---------- 存储 ----------
  var KEY_PREFIX = 'shb:storage:';
  function getStorageSync(key) {
    var raw = localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return '';
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }
  function setStorageSync(key, value) {
    try {
      localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value === undefined ? '' : value));
    } catch (e) { /* 满 quota 忽略 */ }
  }
  function clearStorageSync() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(KEY_PREFIX) === 0) keys.push(k);
    }
    keys.forEach(function (k) { localStorage.removeItem(k); });
  }
  function getStorageInfoSync() {
    var keys = [];
    var bytes = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(KEY_PREFIX) === 0) {
        keys.push(k.slice(KEY_PREFIX.length));
        bytes += (localStorage.getItem(k) || '').length;
      }
    }
    return { keys: keys, currentSize: Math.max(0.1, Math.round(bytes / 102.4) / 10) };
  }

  // ---------- 组装全局 wx ----------
  var wx = {
    // UI
    showToast: showToast,
    hideToast: function () { if (uiRoot) uiRoot.querySelector('.wx-toast').style.display = 'none'; },
    showLoading: showLoading,
    hideLoading: hideLoading,
    showModal: showModal,
    setNavigationBarTitle: function (opts) {
      if (WMP.nav && WMP.nav.setNavigationBarTitle) WMP.nav.setNavigationBarTitle(opts || {});
    },

    // 导航（core.js 注入实现）
    navigateTo: function (opts) { WMP.nav.navigateTo(opts.url, opts); },
    redirectTo: function (opts) { WMP.nav.redirectTo(opts.url, opts); },
    navigateBack: function (opts) { WMP.nav.navigateBack(opts || {}); },
    reLaunch: function (opts) { WMP.nav.reLaunch(opts.url); },
    switchTab: function (opts) { WMP.nav.switchTab(opts.url); },
    stopPullDownRefresh: function () {
      if (WMP.nav && WMP.nav.stopPullDownRefresh) WMP.nav.stopPullDownRefresh();
    },

    // 存储
    getStorageSync: getStorageSync,
    setStorageSync: setStorageSync,
    clearStorageSync: clearStorageSync,
    getStorageInfoSync: getStorageInfoSync,

    // 订阅消息：演示环境直接放行
    requestSubscribeMessage: function (opts) {
      setTimeout(function () {
        if (opts && opts.success) opts.success({});
      }, 50);
    },

    // 云开发
    cloud: {
      init: function () {},
      callFunction: callFunction,
      database: function () { return makeChainable({}); }
    }
  };

  return { wx: wx, UID: UID };
})();
