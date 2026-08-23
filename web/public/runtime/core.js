// ============================================================
// runtime/core.js — 运行时总调度
//   App()/Page()/Component() 注册、页面栈与 Tab 管理、
//   组件实例化（properties/observers/lifetimes/triggerEvent）、
//   样式注入（rpx 换算 + @import 内联 + 页面样式作用域）、
//   下拉刷新手势、模拟分享。
// ============================================================
window.WMP = window.WMP || {};

WMP.core = (function () {
  var loader, wxml, expr;

  var pageDefs = {};    // route -> Page config
  var compDefs = {};    // 组件模块路径 -> Component config
  var appConfig = null;
  var app = null;
  var appJson = null;
  var pageSeq = 0;

  // ---------------- 全局注册器 ----------------
  window.App = function (config) { appConfig = config || {}; };
  window.getApp = function () { return app; };
  window.Page = function (config) {
    var key = WMP._currentModule;
    pageDefs[key] = config || {};
  };
  window.Component = function (config) {
    var key = WMP._currentModule;
    compDefs[key] = config || {};
  };
  window.wx = WMP.wxapi.wx;

  // ---------------- 运行时基础样式 ----------------
  var RUNTIME_CSS = [
    '.wx-ui-root { position: absolute; inset: 0; pointer-events: none; z-index: 9999; }',
    // translateZ 让页面里 position:fixed 的元素（自定义 tabBar 等）以手机框为定位基准，对齐微信端行为
    '.wx-app { font-size: 14px; color: #eef3f8; transform: translateZ(0); }',
    '.wx-navbar { height: 44px; display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0; background: #0b131b; color: #fff; font-size: 16px; }',
    '.wx-navbar__back { position: absolute; left: 10px; top: 0; bottom: 0; width: 44px; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #fff; cursor: pointer; }',
    '.wx-navbar__capsule { position: absolute; right: 10px; width: 72px; height: 26px; border: 1px solid rgba(255,255,255,.25); border-radius: 13px; opacity: .6; }',
    // min-width:0 掐断 min-content 撑宽链：横向 scroll-view（大厅页筛选 chips 等）不再把整页和 tabBar 撑出手机框
    '.wx-page-body { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }',
    '.wx-content { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; touch-action: pan-y; }',
    '.wx-tabhost { position: relative; flex: 1; min-height: 0; }',
    '.wx-tabpage { position: absolute; inset: 0; display: none; }',
    '.wx-tabpage--on { display: flex; }',
    '.wx-layer { position: absolute; inset: 0; z-index: 100; display: flex; flex-direction: column; animation: wx-slide-in .22s ease; background: #0b131b; }',
    '@keyframes wx-slide-in { from { transform: translateX(30%); opacity: .4; } to { transform: none; opacity: 1; } }',
    '.wx-tabbar-slot { position: relative; z-index: 50; flex-shrink: 0; }',
    '.wx-comp-host { display: block; }',
    // toast
    '.wx-toast { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); background: rgba(20,26,33,.95); color: #fff; border-radius: 12px; padding: 14px 18px; min-width: 90px; max-width: 240px; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: auto; box-shadow: 0 8px 30px rgba(0,0,0,.4); z-index: 10001; }',
    '.wx-toast__icon { width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,.12); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #b1e92c; font-weight: 700; }',
    '.wx-toast--plain .wx-toast__icon { display: none; }',
    '.wx-toast-title { font-size: 14px; line-height: 1.5; text-align: center; word-break: break-all; }',
    // loading
    '.wx-loading-mask { position: absolute; inset: 0; background: transparent; display: flex; align-items: center; justify-content: center; pointer-events: auto; z-index: 10000; }',
    '.wx-loading-box { background: rgba(20,26,33,.92); border-radius: 12px; padding: 18px 22px; display: flex; flex-direction: column; align-items: center; gap: 10px; }',
    '.wx-loading-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid rgba(255,255,255,.15); border-top-color: #b1e92c; animation: wx-spin .8s linear infinite; }',
    '@keyframes wx-spin { to { transform: rotate(360deg); } }',
    '.wx-loading-text { font-size: 12px; color: #cfd6de; }',
    // modal
    '.wx-modal-mask { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; pointer-events: auto; z-index: 10002; }',
    '.wx-modal { width: 78%; max-width: 300px; background: #1a222c; border-radius: 14px; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,.5); }',
    '.wx-modal__title { text-align: center; font-size: 16px; font-weight: 700; padding: 18px 20px 6px; color: #eef3f8; }',
    '.wx-modal__content { padding: 4px 22px 18px; font-size: 14px; line-height: 1.6; color: #aeb8c4; text-align: center; white-space: pre-wrap; word-break: break-all; }',
    '.wx-modal__btns { display: flex; border-top: 1px solid rgba(255,255,255,.08); }',
    '.wx-modal__btn { flex: 1; padding: 13px 0; text-align: center; font-size: 15px; color: #cfd6de; cursor: pointer; }',
    '.wx-modal__btn:active { background: rgba(255,255,255,.05); }',
    '.wx-modal__btns .wx-modal__btn + .wx-modal__btn { border-left: 1px solid rgba(255,255,255,.08); }',
    '.wx-modal__btn--confirm { font-weight: 700; }',
    // 下拉刷新
    '.wx-pulldown { position: absolute; top: 0; left: 0; right: 0; height: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; z-index: 60; }',
    '.wx-pulldown__inner { height: 44px; display: flex; align-items: center; gap: 8px; color: #8a94a0; font-size: 12px; }',
    '.wx-pulldown__spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); border-top-color: #b1e92c; animation: wx-spin .8s linear infinite; }',
    // 分享提示卡
    '.wx-share-mask { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; pointer-events: auto; z-index: 10002; }',
    '.wx-share-card { width: 82%; margin-bottom: 26px; background: #1a222c; border-radius: 16px; padding: 18px; box-shadow: 0 16px 48px rgba(0,0,0,.5); animation: wx-slide-up .25s ease; }',
    '@keyframes wx-slide-up { from { transform: translateY(40%); opacity: .3; } to { transform: none; opacity: 1; } }',
    '.wx-share-card__title { font-size: 15px; font-weight: 700; color: #eef3f8; margin-bottom: 6px; }',
    '.wx-share-card__path { font-size: 12px; color: #7f8a96; word-break: break-all; margin-bottom: 14px; font-family: Menlo, Consolas, monospace; }',
    '.wx-share-card__btn { height: 42px; border-radius: 12px; background: #b1e92c; color: #0c1403; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer; }',
    // 页面里的 position:fixed（如房间详情底部操作栏）改为随滚动吸底
    '.wx-page-body[data-page] .action-bar { position: sticky; bottom: 0; z-index: 40; }'
  ].join('\n');

  // ---------------- 样式处理 ----------------
  function rpxToPx(css) {
    return css.replace(/(\d*\.?\d+)rpx\b/g, function (all, n) {
      return (parseFloat(n) * 0.5) + 'px';
    });
  }

  function inlineImports(css, dir, seen) {
    seen = seen || {};
    return css.replace(/@import\s+['"]([^'"]+)['"]\s*;/g, function (all, name) {
      var target = loader.resolve(dir + '/x', name);
      if (seen[target]) return '';
      seen[target] = true;
      var text = loader.file(target) || '';
      return inlineImports(text, loaderDir(target), seen);
    });
  }
  function loaderDir(p) {
    var i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  }

  var injectedStyles = {};
  function injectGlobalStyles(id, css) {
    if (injectedStyles[id]) return;
    injectedStyles[id] = true;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function scopePageCSS(css, prefix) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    var out = '';
    var i = 0;
    while (i < css.length) {
      var brace = css.indexOf('{', i);
      if (brace === -1) { out += css.slice(i); break; }
      var head = css.slice(i, brace);
      var depth = 1;
      var j = brace + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      var body = css.slice(brace + 1, j - 1);
      var headTrim = head.trim();
      if (headTrim.charAt(0) === '@') {
        if (/^@keyframes/i.test(headTrim)) {
          out += headTrim + '{' + body + '}';
        } else if (/^@media/i.test(headTrim)) {
          out += headTrim + '{' + scopePageCSS(body, prefix) + '}';
        } else {
          out += headTrim + '{' + body + '}';
        }
      } else {
        var scoped = head.split(',').map(function (sel) {
          sel = sel.trim();
          if (!sel) return sel;
          if (sel === 'page' || sel === 'page body') return '.wx-app';
          return prefix + ' ' + sel;
        }).filter(Boolean).join(', ');
        if (scoped) out += scoped + ' {' + body + '}';
      }
      i = j;
    }
    return out;
  }

  function ensurePageStyles(route) {
    var id = 'pg:' + route;
    if (injectedStyles[id]) return;
    var raw = loader.file(route + '.wxss');
    if (raw) {
      var dir = loaderDir(route);
      var css = rpxToPx(inlineImports(raw, dir, {}));
      injectGlobalStyles(id, scopePageCSS(css, '[data-page="' + route + '"]'));
    } else {
      injectedStyles[id] = true;
    }
  }

  function ensureCompStyles(compPath) {
    var id = 'cp:' + compPath;
    if (injectedStyles[id]) return;
    var raw = loader.file(compPath + '.wxss');
    if (raw) injectGlobalStyles(id, rpxToPx(inlineImports(raw, compPath, {})));
    else injectedStyles[id] = true;
  }

  function ensureAppStyles() {
    var raw = loader.file('app.wxss') || '';
    var css = rpxToPx(inlineImports(raw, '', {}));
    injectGlobalStyles('app.wxss', scopePageCSS(css, ''));
  }

  // ---------------- 组件实例 ----------------
  function createComponent(hostVn) {
    var compPath = hostVn.usingComps[hostVn.compName];
    var def = compDefs[compPath];
    if (!def) throw new Error('组件未注册: ' + hostVn.compName + ' → ' + compPath);
    ensureCompStyles(compPath);

    var instance = Object.create(def.methods || {});
    instance.__isComp = true;
    instance.__def = def;
    instance.__path = hostVn.path;
    instance.__comps = new Map();
    instance.__compPath = compPath;
    instance.data = {};

    var propsDef = def.properties || {};
    for (var pk in propsDef) instance.data[pk] = propsDef[pk].value;
    for (var qk in hostVn.props) {
      if (hostVn.props[qk] !== undefined) instance.data[qk] = hostVn.props[qk];
    }

    instance.setData = function (patch) {
      if (!patch) return;
      Object.assign(this.data, patch);
      scheduleRender(this);
    };
    instance.triggerEvent = function (name, detail) {
      var host = this._hostVn;
      if (!host) return;
      var h = host.handlers && host.handlers[name];
      if (!h) return;
      var owner = host.owner;
      var method = owner && owner[h.name];
      if (typeof method === 'function') {
        method.call(owner, {
          detail: detail || {},
          currentTarget: { dataset: host.dataset || {}, id: host.id || '' },
          target: { dataset: host.dataset || {}, id: host.id || '' }
        });
      }
    };
    instance.selectComponent = function () { return null; };

    // 初次属性落地后触发全部 observers（与小程序首渲染语义一致）
    fireObservers(instance, Object.keys(instance.data));
    var lifetimes = def.lifetimes || {};
    if (lifetimes.attached) lifetimes.attached.call(instance);
    hostVn.comps.set(hostVn.path, instance);
    return instance;
  }

  function updateCompProps(instance, hostVn) {
    var changed = [];
    for (var k in hostVn.props) {
      var v = hostVn.props[k];
      if (instance.data[k] !== v) {
        instance.data[k] = v;
        changed.push(k);
      }
    }
    if (changed.length) {
      fireObservers(instance, changed);
      scheduleRender(instance);
    }
  }

  function fireObservers(instance, changedKeys) {
    var obs = instance.__def && instance.__def.observers;
    if (!obs) return;
    Object.keys(obs).forEach(function (fieldsStr) {
      var fields = fieldsStr.split(',').map(function (s) { return s.trim(); });
      var hit = fields.some(function (f) { return changedKeys.indexOf(f) > -1; });
      if (hit) obs[fieldsStr].apply(instance, fields.map(function (f) { return instance.data[f]; }));
    });
  }

  // ---------------- 渲染调度 ----------------
  var dirty = new Set();
  var flushScheduled = false;
  function scheduleRender(instance) {
    dirty.add(instance);
    if (flushScheduled) return;
    flushScheduled = true;
    Promise.resolve().then(function () {
      flushScheduled = false;
      var list = Array.from(dirty);
      dirty.clear();
      list.forEach(function (inst) {
        try { renderInstance(inst); } catch (e) {
          console.error('[渲染失败]', e);
          showRuntimeError(e);
        }
      });
    });
  }

  // 渲染期错误浮层（开发可见）
  function showRuntimeError(e) {
    var root = document.getElementById('wxApp');
    if (!root || root.querySelector('.wx-render-error')) return;
    var box = document.createElement('pre');
    box.className = 'wx-render-error';
    box.style.cssText = 'position:absolute;left:0;right:0;bottom:0;max-height:46%;overflow:auto;margin:0;padding:10px 12px;background:rgba(120,10,20,.94);color:#ffd9de;font-size:11px;line-height:1.5;z-index:20000;white-space:pre-wrap;pointer-events:auto;';
    box.textContent = '渲染错误：' + ((e && e.stack) || e);
    root.appendChild(box);
  }

  function usingCompsOf(basePath) {
    var map = {};
    var conf = loader.json(basePath + '.json');
    var uc = conf.usingComponents || {};
    // basePath 是「文件路径」，resolve 内部会取其目录；相对引用按 json 所在目录解析
    for (var name in uc) map[name] = loader.resolve(basePath, uc[name]);
    return map;
  }

  function renderInstance(instance) {
    if (instance.__isComp) {
      var ast = loader.ast(instance.__compPath + '.wxml');
      var using = usingCompsOf(instance.__compPath);
      var vnodes = wxml.renderTemplate(ast, instance.data, instance, instance.__compPath, using, instance.__comps);
      wxml.syncChildren(instance._hostEl, vnodes, null, null);
    } else {
      renderPage(instance);
    }
  }

  // ---------------- 页面实例 ----------------
  var nav = {
    tabRoutes: [],
    tabInstances: new Map(),
    activeTab: null,
    stack: [],
    current: function () {
      return this.stack.length ? this.stack[this.stack.length - 1].page : this.tabInstances.get(this.activeTab);
    }
  };

  function createPage(route, query) {
    var def = pageDefs[route];
    if (!def) throw new Error('页面未注册: ' + route);
    ensurePageStyles(route);

    var page = Object.create(def);
    var pId = ++pageSeq;
    page.__id = pId;
    page.__route = route;
    page.__options = query || {};
    page.data = JSON.parse(JSON.stringify(def.data || {}));
    page.__comps = new Map();

    page.setData = function (patch, cb) {
      if (!patch) { if (cb) cb(); return; }
      Object.assign(this.data, patch);
      scheduleRender(this);
      if (cb) cb();
    };
    page.getTabBar = function () { return this.__tabBar || null; };
    page.selectComponent = function () { return null; };
    page.onShareAppMessage = page.onShareAppMessage || null;
    WMP._lastPage = page; // 调试暴露（testdrive 用）

    // DOM 骨架
    var conf = loader.json(route + '.json');
    var body = document.createElement('div');
    body.className = 'wx-page-body';
    body.dataset.page = route;

    var bar = document.createElement('div');
    bar.className = 'wx-navbar';
    bar.style.background = conf.navigationBarBackgroundColor || '#0b131b';
    bar.innerHTML = '<div class="wx-navbar__capsule"></div><div class="wx-navbar__title"></div>';
    bar.querySelector('.wx-navbar__title').textContent = conf.navigationBarTitleText || '';
    page.__navbarTitle = bar.querySelector('.wx-navbar__title');

    var content = document.createElement('div');
    content.className = 'wx-content';
    body.appendChild(bar);
    body.appendChild(content);
    page.__body = body;
    page.__content = content;
    page.__conf = conf;

    if (conf.enablePullDownRefresh) attachPullDown(page);
    return page;
  }

  function renderPage(page) {
    var ast = loader.ast(page.__route + '.wxml');
    var using = usingCompsOf(page.__route);
    var vnodes = wxml.renderTemplate(ast, page.data, page, page.__route, using, page.__comps);
    wxml.syncChildren(page.__content, vnodes, null, null);
  }

  // ---------------- TabBar ----------------
  function ensureTabBar(page) {
    if (page.__tabBar) return;
    var slot = document.createElement('div');
    slot.className = 'wx-tabbar-slot';
    page.__body.appendChild(slot);
    var host = document.createElement('div');
    host.className = 'wx-comp-host';
    slot.appendChild(host);

    var defPath = 'custom-tab-bar/index';
    ensureCompStyles(defPath);
    var def = compDefs[defPath];
    if (!def) { page.__tabBar = null; return; }
    var instance = Object.create(def.methods || {});
    instance.__isComp = true;
    instance.__def = def;
    instance.__compPath = defPath;
    instance.__comps = new Map();
    instance.data = JSON.parse(JSON.stringify(def.data || {}));
    instance.setData = function (patch) {
      Object.assign(this.data, patch || {});
      scheduleRender(this);
    };
    instance.triggerEvent = function () {};
    instance._hostEl = host;
    instance._hostVn = { handlers: {}, dataset: {} };
    page.__tabBar = instance;
    page.__tabBarSlot = slot;

    var ast = loader.ast(defPath + '.wxml');
    var vnodes = wxml.renderTemplate(ast, instance.data, instance, defPath, {}, instance.__comps);
    wxml.syncChildren(host, vnodes, null, null);
  }

  // ---------------- 导航 ----------------
  function parseUrl(url) {
    var qIndex = url.indexOf('?');
    var route = (qIndex === -1 ? url : url.slice(0, qIndex)).replace(/^\//, '').replace(/\/$/, '');
    var query = {};
    if (qIndex > -1) {
      url.slice(qIndex + 1).split('&').forEach(function (kv) {
        var pair = kv.split('=');
        if (pair[0]) query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      });
    }
    return { route: route, query: query };
  }

  function isTabRoute(route) { return nav.tabRoutes.indexOf(route) > -1; }

  function showPage(page, isStack) {
    var host = isStack ? document.getElementById('wxStackHost') : document.getElementById('wxTabHost');
    var wrapper;
    if (isStack) {
      wrapper = document.createElement('div');
      wrapper.className = 'wx-layer';
      var back = document.createElement('div');
      back.className = 'wx-navbar__back';
      back.textContent = '‹';
      back.addEventListener('click', function () { navApi.navigateBack({}); });
      page.__body.querySelector('.wx-navbar').appendChild(back);
      wrapper.appendChild(page.__body);
      host.appendChild(wrapper);
      page.__wrapper = wrapper;
    } else {
      wrapper = document.createElement('div');
      wrapper.className = 'wx-tabpage';
      wrapper.dataset.tabroute = page.__route;
      ensureTabBar(page);
      wrapper.appendChild(page.__body);
      host.appendChild(wrapper);
      page.__wrapper = wrapper;
    }
  }

  function hidePage(page) { if (page.onHide) page.onHide.call(page); }
  function unloadPage(page) {
    if (page.onUnload) page.onUnload.call(page);
    page.__comps.forEach(function (inst) {
      var lifetimes = inst.__def && inst.__def.lifetimes;
      if (lifetimes && lifetimes.detached) lifetimes.detached.call(inst);
    });
    page.__comps.clear();
    if (page.__wrapper && page.__wrapper.parentNode) page.__wrapper.parentNode.removeChild(page.__wrapper);
  }

  var navApi = {
    switchTab: function (url) {
      var target = parseUrl(url);
      if (!isTabRoute(target.route)) return console.warn('switchTab 目标不是 tab 页: ' + url);
      // 关闭所有栈内页面
      while (nav.stack.length) {
        var top = nav.stack.pop();
        hidePage(top.page);
        unloadPage(top.page);
      }
      var current = nav.current();
      if (current && nav.activeTab !== target.route) hidePage(current);

      var page = nav.tabInstances.get(target.route);
      var fresh = !page;
      if (fresh) {
        page = createPage(target.route, target.query);
        nav.tabInstances.set(target.route, page);
        showPage(page, false);
      } else {
        page.__wrapper.classList.add('wx-tabpage--on');
      }
      // tab 页切换显示
      nav.tabInstances.forEach(function (p, route) {
        p.__wrapper.classList.toggle('wx-tabpage--on', route === target.route);
      });
      nav.activeTab = target.route;
      if (fresh && page.onLoad) page.onLoad.call(page, target.query);
      if (page.onShow) page.onShow.call(page);
      renderPage(page);
    },

    navigateTo: function (url) {
      var target = parseUrl(url);
      if (isTabRoute(target.route)) return this.switchTab(url);
      if (nav.stack.length >= 8) return console.warn('页面栈过深');
      var current = nav.current();
      if (current) hidePage(current);
      var page = createPage(target.route, target.query);
      nav.stack.push({ page: page, route: target.route });
      showPage(page, true);
      if (page.onLoad) page.onLoad.call(page, target.query);
      if (page.onShow) page.onShow.call(page);
      renderPage(page);
    },

    redirectTo: function (url) {
      var target = parseUrl(url);
      if (!nav.stack.length) return this.navigateTo(url);
      var top = nav.stack.pop();
      unloadPage(top.page);
      this.navigateTo(url);
    },

    navigateBack: function () {
      if (!nav.stack.length) return;
      var top = nav.stack.pop();
      unloadPage(top.page);
      var next = nav.current();
      if (next && next.onShow) next.onShow.call(next);
    },

    reLaunch: function (url) {
      var target = parseUrl(url);
      while (nav.stack.length) {
        var top = nav.stack.pop();
        unloadPage(top.page);
      }
      var routes = Array.from(nav.tabInstances.keys());
      routes.forEach(function (r) {
        unloadPage(nav.tabInstances.get(r));
      });
      nav.tabInstances.clear();
      nav.activeTab = null;
      if (isTabRoute(target.route)) this.switchTab(url);
      else this.navigateTo(url);
    },

    setNavigationBarTitle: function (opts) {
      var page = nav.current();
      if (page && page.__navbarTitle) page.__navbarTitle.textContent = opts.title || '';
    },

    stopPullDownRefresh: function () {
      var page = nav.current();
      if (page && page.__pulldown) finishPullDown(page);
    }
  };

  // ---------------- 下拉刷新 ----------------
  function attachPullDown(page) {
    var content = page.__content;
    var indicator = document.createElement('div');
    indicator.className = 'wx-pulldown';
    indicator.innerHTML = '<div class="wx-pulldown__inner"><div class="wx-pulldown__spin" style="display:none"></div><span class="wx-pulldown__text">下拉刷新</span></div>';
    content.appendChild(indicator);
    var spin = indicator.querySelector('.wx-pulldown__spin');
    var text = indicator.querySelector('.wx-pulldown__text');

    var startY = null;
    var pulling = false;
    var refreshing = false;

    content.addEventListener('pointerdown', function (e) {
      if (refreshing || content.scrollTop > 0) return;
      startY = e.clientY;
      pulling = true;
    });
    content.addEventListener('pointermove', function (e) {
      if (!pulling || startY === null || refreshing) return;
      var dy = e.clientY - startY;
      if (dy <= 0) return;
      var dist = Math.min(dy * 0.45, 64);
      indicator.style.height = dist + 'px';
      text.textContent = dist >= 52 ? '松开刷新' : '下拉刷新';
    });
    function end() {
      if (!pulling) return;
      pulling = false;
      var dist = parseFloat(indicator.style.height) || 0;
      startY = null;
      if (dist >= 52) {
        refreshing = true;
        indicator.style.height = '44px';
        spin.style.display = 'block';
        text.textContent = '刷新中…';
        if (page.onPullDownRefresh) page.onPullDownRefresh.call(page);
        setTimeout(function () { if (refreshing) finishPullDown(page); }, 6000);
      } else {
        indicator.style.height = '0';
      }
    }
    content.addEventListener('pointerup', end);
    content.addEventListener('pointercancel', end);

    page.__pulldown = { finish: function () {
      refreshing = false;
      spin.style.display = 'none';
      text.textContent = '刷新完成';
      setTimeout(function () { indicator.style.height = '0'; }, 250);
    } };
  }
  function finishPullDown(page) {
    if (page.__pulldown) page.__pulldown.finish();
  }

  // ---------------- 模拟分享 ----------------
  function handleShareButton(vn) {
    var page = nav.current();
    var payload = page && page.onShareAppMessage ? page.onShareAppMessage() : {
      title: '上号吧 · 组队上号',
      path: '/' + (page ? page.__route : 'pages/index/index')
    };
    var mask = document.createElement('div');
    mask.className = 'wx-share-mask';
    mask.innerHTML =
      '<div class="wx-share-card">' +
      '<div class="wx-share-card__title"></div>' +
      '<div class="wx-share-card__path"></div>' +
      '<div class="wx-share-card__btn">复制分享路径</div>' +
      '</div>';
    mask.querySelector('.wx-share-card__title').textContent = payload.title || '';
    mask.querySelector('.wx-share-card__path').textContent = payload.path || '';
    var uiRoot = document.querySelector('.wx-ui-root');
    var target = uiRoot || document.getElementById('wxApp');
    target.appendChild(mask);
    mask.addEventListener('click', function (e) {
      if (e.target === mask) mask.remove();
    });
    mask.querySelector('.wx-share-card__btn').addEventListener('click', function () {
      var u = new URL(location.href);
      u.searchParams.delete('route');
      var route = (payload.path || '/pages/index/index').replace(/^\//, '');
      u.searchParams.set('route', route.split('?')[0]);
      (payload.path || '').split('?')[1] && payload.path.split('?')[1].split('&').forEach(function (kv) {
        var pair = kv.split('=');
        if (pair[0]) u.searchParams.set(pair[0], pair[1] || '');
      });
      var link = u.toString();
      if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
      mask.remove();
      wx.showToast({ title: '链接已复制，可发给第二玩家', icon: 'none', duration: 2200 });
    });
  }

  // ---------------- 启动 ----------------
  async function boot() {
    loader = WMP.loader;
    wxml = WMP.wxml;
    expr = WMP.expr;

    var list = await loader.init();
    appJson = loader.json('app.json');

    injectGlobalStyles('runtime-base', RUNTIME_CSS);
    ensureAppStyles();

    // 模块求值顺序：组件 → 自定义 tabBar → app → 页面
    list.filter(function (f) { return f.indexOf('components/') === 0 && /\.js$/.test(f); })
      .forEach(function (f) { loader.requireModule(f); });
    if (loader.has('custom-tab-bar/index.js')) loader.requireModule('custom-tab-bar/index.js');
    if (loader.has('app.js')) loader.requireModule('app.js');

    app = Object.create(appConfig);
    app.globalData = JSON.parse(JSON.stringify(appConfig.globalData || {}));
    if (appConfig.onLaunch) appConfig.onLaunch.call(app);

    list.filter(function (f) { return f.indexOf('pages/') === 0 && /\.js$/.test(f); })
      .forEach(function (f) { loader.requireModule(f); });

    WMP.nav = navApi;

    // 宿器结构
    var appRoot = document.getElementById('wxApp');
    appRoot.innerHTML = '';
    var tabHost = document.createElement('div');
    tabHost.id = 'wxTabHost';
    tabHost.className = 'wx-tabhost';
    var stackHost = document.createElement('div');
    stackHost.id = 'wxStackHost';
    appRoot.appendChild(tabHost);
    appRoot.appendChild(stackHost);

    // UI 层（toast/modal 等由 wxapi 懒创建，这里先清干净）
    nav.tabRoutes = ((appJson.tabBar && appJson.tabBar.list) || []).map(function (t) { return t.pagePath; });

    // 首个页面：?route= 直达（可带额外 query），否则首页 tab
    var params = new URLSearchParams(location.search);
    var bootRoute = params.get('route');
    var bootQuery = {};
    params.forEach(function (v, k) {
      if (k !== 'route' && k !== 'uid' && k !== 'v') bootQuery[k] = v;
    });
    if (bootRoute && !isTabRoute(bootRoute) && pageDefs[bootRoute]) {
      navApi.switchTab('/' + nav.tabRoutes[0]);
      navApi.navigateTo('/' + bootRoute + '?' + Object.keys(bootQuery).map(function (k) {
        return k + '=' + bootQuery[k];
      }).join('&'));
    } else if (bootRoute && isTabRoute(bootRoute)) {
      navApi.switchTab('/' + bootRoute);
    } else {
      navApi.switchTab('/' + nav.tabRoutes[0]);
    }
  }

  return {
    boot: boot,
    createComponent: createComponent,
    updateCompProps: updateCompProps,
    renderInstanceInto: function (instance, el) {
      instance._hostEl = el;
      renderInstance(instance);
    },
    handleShareButton: handleShareButton
  };
})();

// 自动启动
(function () {
  var root = document.getElementById('wxApp');
  WMP.core.boot().catch(function (error) {
    console.error(error);
    root.innerHTML = '';
    root.className = 'wx-app wx-app--error';
    root.textContent = '小程序加载失败：\n' + ((error && error.stack) || error);
  });
})();
