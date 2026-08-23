// ============================================================
// runtime/expr.js — WXML {{}} 表达式求值
// 用 with + new Function 直接复用 JS 表达式语义（小程序表达式
// 本身就是 JS 子集），求值失败静默返回 undefined（贴近小程序容错）。
// ============================================================
window.WMP = window.WMP || {};

WMP.expr = (function () {
  var cache = {};

  function compile(src) {
    if (cache[src] !== undefined) return cache[src];
    var fn;
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function('scope', 'with (scope) { return (' + src + '); }');
    } catch (e) {
      fn = function () { throw e; };
    }
    cache[src] = fn;
    return fn;
  }

  function safeEval(src, scope) {
    try {
      return compile(src)(scope);
    } catch (e) {
      return undefined;
    }
  }

  // 是否为「单一表达式」绑定（如 disabled="{{submitting}}"）→ 保留原始类型
  function singleExpr(raw) {
    var m = /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(raw);
    return m ? m[1] : null;
  }

  // 求值并保留类型（boolean/number 不被字符串化）
  function evalTyped(raw, scope) {
    var single = singleExpr(raw);
    if (single !== null) return safeEval(single, scope);
    return evalText(raw, scope);
  }

  // 混合文本绑定："a{{x}} · {{y}}" → 逐段替换
  function evalText(raw, scope) {
    if (raw.indexOf('{{') === -1) return raw;
    return String(raw).replace(/\{\{([\s\S]*?)\}\}/g, function (all, inner) {
      var v = safeEval(inner, scope);
      return v === undefined || v === null ? '' : String(v);
    });
  }

  return { safeEval: safeEval, evalTyped: evalTyped, evalText: evalText };
})();
