// ============================================================
// runtime/loader.js — 小程序文件加载与 CommonJS 模块系统
// 启动时一次性拉取 /mp/manifest.json 里的全部源文件，
// 按需以 new Function 执行模块（require 相对路径解析）。
// ============================================================
window.WMP = window.WMP || {};

WMP.loader = (function () {
  var files = {};        // path -> text（不带根斜杠）
  var jsonCache = {};
  var astCache = {};
  var moduleCache = {};  // path(无.js) -> module

  async function init() {
    // 启动时间戳破缓存：避免浏览器残留的旧强缓存（历史响应曾带 max-age=3600）
    var bust = '?t=' + Date.now();
    var man = await fetch('/mp/manifest.json' + bust).then(function (r) { return r.json(); });
    var list = man.files || [];
    await Promise.all(list.map(function (f) {
      return fetch('/mp/' + encodeURI(f) + bust).then(function (r) { return r.text(); }).then(function (t) {
        files[f] = t;
      });
    }));
    return list;
  }

  function dirname(p) {
    var i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  }

  function normalize(p) {
    var parts = p.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (s === '' || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return out.join('/');
  }

  // from：模块路径（可带 .js）；name：相对/根绝对路径
  function resolve(from, name) {
    if (name.charAt(0) === '/') return normalize(name);
    return normalize(dirname(from) + '/' + name);
  }

  function json(path) {
    if (!(path in jsonCache)) {
      try { jsonCache[path] = JSON.parse(files[path] || '{}'); }
      catch (e) { jsonCache[path] = {}; }
    }
    return jsonCache[path];
  }

  function ast(path) {
    if (!astCache[path]) astCache[path] = WMP.wxml.parse(files[path] || '');
    return astCache[path];
  }

  function requireModule(path) {
    var key = normalize(path).replace(/\.js$/, '');
    if (moduleCache[key]) return moduleCache[key].exports;
    var src = files[key + '.js'];
    if (src === undefined) throw new Error('模块不存在: ' + key);
    var mod = { exports: {} };
    moduleCache[key] = mod;
    var prev = WMP._currentModule;
    WMP._currentModule = key;
    var fn = new Function('require', 'module', 'exports', src + '\n//# sourceURL=mp/' + key + '.js');
    fn(function (name) {
      if (name.charAt(0) === '.') {
        return requireModule(resolve(key + '.js', name));
      }
      return requireModule(name); // 项目内无裸包依赖
    }, mod, mod);
    WMP._currentModule = prev;
    return mod.exports;
  }

  return {
    init: init,
    file: function (p) { return files[p]; },
    has: function (p) { return p in files; },
    json: json,
    ast: ast,
    resolve: resolve,
    normalize: normalize,
    requireModule: requireModule
  };
})();
