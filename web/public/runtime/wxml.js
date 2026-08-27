// ============================================================
// runtime/wxml.js — WXML 解析 + 渲染引擎
//   parse(src)     → AST（含 wx:if 链分组）
//   build(ast,...) → vnode 树（表达式按当前 data 求值）
//   sync(container)→ vnode ↔ DOM 增量 patch（保焦点、保滚动）
// 自定义组件实例由 core.js 提供（WMP.core.createComponent）。
// ============================================================
window.WMP = window.WMP || {};

WMP.wxml = (function () {
  var expr = WMP.expr;

  // ---------- 解析 ----------
  function parse(src) {
    src = String(src).replace(/<!--[\s\S]*?-->/g, '');
    var root = { tag: '#root', attrs: {}, children: [] };
    var stack = [root];
    var i = 0;
    var len = src.length;

    while (i < len) {
      var lt = src.indexOf('<', i);
      if (lt === -1) {
        pushText(stack[stack.length - 1], src.slice(i));
        break;
      }
      if (lt > i) pushText(stack[stack.length - 1], src.slice(i, lt));
      if (src[lt + 1] === '/') {
        var closeEnd = src.indexOf('>', lt);
        stack.pop();
        i = closeEnd + 1;
        continue;
      }
      // 开始标签
      var m = /^<([a-zA-Z][\w-]*)((?:\s+[\w-:.]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)|\s+[\w-:.]+)*)\s*(\/?)>/.exec(src.slice(lt));
      if (!m) {
        // 无法识别的片段按文本吞掉，避免死循环
        pushText(stack[stack.length - 1], '<');
        i = lt + 1;
        continue;
      }
      var node = { tag: m[1], attrs: {}, children: [] };
      var attrSrc = m[2];
      var attrRe = /([\w-:.]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|([\w-:.]+)/g;
      var am;
      while ((am = attrRe.exec(attrSrc))) {
        var name = am[1] || am[5];
        var value = am[1] !== undefined ? (am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : am[4])) : '';
        node.attrs[name] = value;
      }
      stack[stack.length - 1].children.push(node);
      if (!m[3]) stack.push(node); // 非自闭合才入栈
      i = lt + m[0].length;
    }
    groupIfs(root);
    return root;
  }

  function pushText(parent, raw) {
    if (!raw || !raw.trim()) return; // 纯空白文本丢弃（与小程序一致）
    parent.children.push({ tag: '#text', text: raw });
  }

  function isBlankTextNode(c) {
    if (!c || c.tag !== '#text') return false;
    var t = (c.attrs && c.attrs.text) || '';
    return /^\s*$/.test(t);
  }

  // 把 wx:if / wx:elif / wx:else 兄弟节点折叠成条件组
  function groupIfs(node) {
    var children = node.children;
    var out = [];
    for (var idx = 0; idx < children.length; idx++) {
      var child = children[idx];
      if (child.tag !== '#text' && child.attrs && 'wx:if' in child.attrs) {
        var group = { tag: '#if', branches: [{ cond: child.attrs['wx:if'], node: stripIf(child) }], elseNode: null };
        out.push(group);
        while (idx + 1 < children.length) {
          var nextNode = children[idx + 1];
          if (isBlankTextNode(nextNode)) {
            idx++; // 忽略中间空行与空白
            continue;
          }
          if (nextNode.attrs && ('wx:elif' in nextNode.attrs)) {
            idx++;
            group.branches.push({ cond: nextNode.attrs['wx:elif'], node: stripIf(nextNode) });
            continue;
          }
          break;
        }
        while (idx + 1 < children.length && !group.elseNode) {
          var nextNode2 = children[idx + 1];
          if (isBlankTextNode(nextNode2)) {
            idx++;
            continue;
          }
          if (nextNode2.attrs && ('wx:else' in nextNode2.attrs)) {
            idx++;
            group.elseNode = stripIf(nextNode2);
            break;
          }
          break;
        }
        // 关键：递归处理各分支内部的条件指令
        group.branches.forEach(function (b) { groupIfs(b.node); });
        if (group.elseNode) groupIfs(group.elseNode);
        continue;
      }
      if (child.children) groupIfs(child);
      out.push(child);
    }
    node.children = out;
  }

  function stripIf(node) {
    var copy = { tag: node.tag, attrs: {}, children: node.children };
    for (var k in node.attrs) {
      if (k !== 'wx:if' && k !== 'wx:elif' && k !== 'wx:else') copy.attrs[k] = node.attrs[k];
    }
    return copy;
  }

  // "{{expr}}" → "expr"；非绑定原样返回 null
  function stripMustache(raw) {
    var m = /^\s*\{\{([\s\S]+)\}\}\s*$/.exec(raw);
    return m ? m[1] : null;
  }

  // ---------- vnode 构建 ----------
  // image 必须映射为原生 img，否则渲染成自定义 <image> 标签，图片完全不显示
  var TAG_MAP = { view: 'div', 'scroll-view': 'div', block: 'div', slot: 'div', button: 'button', image: 'img' };

  // ctx: { owner, tmplPath, usingComps, comps, visited }
  function buildChildren(astChildren, scope, ctx, parentPath) {
    var list = [];
    for (var i = 0; i < astChildren.length; i++) {
      var built = buildNode(astChildren[i], scope, ctx, parentPath, i);
      if (!built) continue;
      if (built.frag) {
        // block / slot 等透明节点：拍平到父级
        for (var j = 0; j < built.children.length; j++) list.push(built.children[j]);
      } else {
        list.push(built);
      }
    }
    return list;
  }

  function buildNode(node, scope, ctx, parentPath, idx) {
    if (node.tag === '#text') {
      return { k: 'text', key: '_t' + idx, text: expr.evalText(node.text, scope) };
    }
    if (node.tag === '#if') {
      for (var b = 0; b < node.branches.length; b++) {
        var condRaw = node.branches[b].cond;
        var condInner = stripMustache(condRaw);
        var pass = condInner !== null ? expr.safeEval(condInner, scope) : !!condRaw;
        if (pass) {
          return buildNode(node.branches[b].node, scope, ctx, parentPath, idx);
        }
      }
      if (node.elseNode) return buildNode(node.elseNode, scope, ctx, parentPath, idx);
      return null;
    }

    // wx:for 展开
    if ('wx:for' in node.attrs) {
      var listRaw = node.attrs['wx:for'];
      var listInner = stripMustache(listRaw);
      var arr = listInner !== null ? expr.safeEval(listInner, scope) : [listRaw];
      var itemName = node.attrs['wx:for-item'] || 'item';
      var indexName = node.attrs['wx:for-index'] || 'index';
      var keyField = node.attrs['wx:key'] || '';
      var inner = stripFor(node);
      var out = { tag: '#list', children: [] };
      var array = Array.isArray(arr) ? arr : [];
      var built = [];
      for (var n = 0; n < array.length; n++) {
        var childScope = Object.create(scope);
        childScope[itemName] = array[n];
        childScope[indexName] = n;
        var key;
        if (keyField === '*this') key = String(array[n]);
        else if (keyField) key = String((array[n] && array[n][keyField]) != null ? array[n][keyField] : n);
        else key = String(n);
        var vnode = buildNode(inner, childScope, ctx, parentPath, n);
        if (vnode) {
          vnode.key = key;
          built.push(vnode);
        }
      }
      return { tag: '#frag', key: '_f' + idx, frag: true, children: built };
    }

    // block / slot：透明包装，仅透传子节点
    if (node.tag === 'block' || node.tag === 'slot') {
      return { tag: '#frag', frag: true, children: buildChildren(node.children, scope, ctx, parentPath) };
    }

    var path = parentPath + '/' + node.tag + '@' + idx;
    var isComp = ctx.usingComps && ctx.usingComps[node.tag];
    if (isComp) return buildCompNode(node, scope, ctx, path);
    return buildElemNode(node, scope, ctx, path, idx);
  }

  function stripFor(node) {
    var copy = { tag: node.tag, attrs: {}, children: node.children };
    for (var k in node.attrs) {
      if (k !== 'wx:for' && k !== 'wx:for-item' && k !== 'wx:for-index' && k !== 'wx:key') {
        copy.attrs[k] = node.attrs[k];
      }
    }
    return copy;
  }

  // 通用属性拆解：class/style/id/dataset/事件/其余透传
  function splitAttrs(node, scope) {
    var out = { className: '', style: '', id: '', dataset: {}, handlers: {}, hover: '', misc: {} };
    for (var name in node.attrs) {
      var raw = node.attrs[name];
      if (name === 'class') {
        out.className = expr.evalText(raw, scope);
      } else if (name === 'style') {
        out.style = expr.evalText(raw, scope);
      } else if (name === 'id') {
        out.id = expr.evalText(raw, scope);
      } else if (name.indexOf('data-') === 0) {
        var dkey = camelize(name.slice(5));
        out.dataset[dkey] = expr.evalTyped(raw, scope);
      } else if (name === 'hover-class') {
        out.hover = expr.evalText(raw, scope);
      } else if (/^bind:?/.test(name)) {
        var colon = name.indexOf(':');
        var evt = colon > -1 ? name.slice(colon + 1) : name.slice(4);
        out.handlers[evt] = { name: raw, catch: false };
      } else if (/^catch:?/.test(name)) {
        var colon2 = name.indexOf(':');
        var evt2 = colon2 > -1 ? name.slice(colon2 + 1) : name.slice(5);
        out.handlers[evt2] = { name: raw, catch: true };
      } else if (name === 'wx:key' || name.slice(0, 3) === 'wx:') {
        // 已在别处处理
      } else {
        out.misc[name] = expr.evalTyped(raw, scope);
      }
    }
    return out;
  }

  function camelize(s) {
    return s.replace(/-([a-z])/g, function (all, c) { return c.toUpperCase(); });
  }

  // 图片地址：/开头 → 小程序根；./ ../ → 相对模板目录
  function resolveSrc(tmplPath, src) {
    if (!src || /^(https?:|data:)/.test(src)) return src;
    if (src.charAt(0) === '/') return '/mp' + src;
    var dir = tmplPath.slice(0, tmplPath.lastIndexOf('/'));
    var merged = dir ? dir + '/' + src : src;
    var parts = merged.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (!s || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return '/mp/' + out.join('/');
  }

  function buildElemNode(node, scope, ctx, path, idx) {
    var a = splitAttrs(node, scope);
    if (node.tag === 'image' && a.misc['src']) {
      a.misc['src'] = resolveSrc(ctx.tmplPath, String(a.misc['src']));
    }
    var vnode = {
      k: 'elem',
      tag: mapTag(node.tag),
      origTag: node.tag,
      key: '_e' + idx,
      path: path,
      className: a.className,
      style: a.style,
      id: a.id,
      dataset: a.dataset,
      handlers: a.handlers,
      hover: a.hover,
      misc: a.misc,
      owner: ctx.owner,
      children: []
    };
    vnode.children = buildChildren(node.children, scope, ctx, path);
    return vnode;
  }

  function buildCompNode(node, scope, ctx, path) {
    var a = splitAttrs(node, scope);
    var props = {};
    for (var name in a.misc) props[name] = a.misc[name];
    var vnode = {
      k: 'comp',
      tag: 'div',
      origTag: node.tag,
      key: '_c' + path,
      path: path,
      className: a.className,
      style: a.style,
      id: a.id,
      dataset: a.dataset,
      handlers: a.handlers,
      hover: a.hover,
      compName: node.tag,
      props: props,
      owner: ctx.owner,
      usingComps: ctx.usingComps,
      comps: ctx.comps,
      visited: ctx.visited
    };
    return vnode;
  }

  function mapTag(tag) {
    return TAG_MAP[tag] || tag;
  }

  // ---------- DOM 同步 ----------
  function createEl(vnode) {
    var el;
    if (vnode.k === 'text') {
      el = document.createTextNode(vnode.text);
      el.__vn = vnode;
      vnode.__el = el;
      return el;
    }
    el = document.createElement(vnode.tag);
    vnode.__el = el;
    attachListeners(el, vnode);
    applyEl(el, vnode, null);
    return el;
  }

  function applyEl(el, vnode, old) {
    el.__vn = vnode;

    if (vnode.k === 'comp') {
      setClass(el, ('wx-comp-host ' + (vnode.className || '')).trim());
      if (vnode.id) el.setAttribute('id', vnode.id);
      if (vnode.style) el.setAttribute('style', vnode.style);
      return;
    }

    // class
    var cls = (vnode.className || '').trim();
    if (vnode.origTag === 'scroll-view') cls = ('wx-scroll-view ' + cls).trim();
    setClass(el, cls || '');

    if (vnode.id) el.setAttribute('id', vnode.id);
    var styleStr = vnode.style || '';
    if (vnode.origTag === 'image') {
      var mode = vnode.misc['mode'];
      styleStr += ';object-fit:' + (mode === 'aspectFit' ? 'contain' : 'cover') + ';display:block;';
      el.draggable = false;
    }
    if (vnode.origTag === 'scroll-view') {
      var sx = truthyAttr(vnode.misc['scroll-x']);
      var sy = truthyAttr(vnode.misc['scroll-y']);
      styleStr += ';overflow-x:' + (sx ? 'auto' : 'hidden') + ';overflow-y:' + (sy ? 'auto' : 'hidden') + ';-webkit-overflow-scrolling:touch;';
    }
    if (styleStr) el.setAttribute('style', styleStr.replace(/^;+/, ''));

    if (old) {
      if (old.id && old.id !== vnode.id) el.removeAttribute('id');
      if (old.className && old.className !== vnode.className && !vnode.className) setClass(el, '');
    }

    var misc = vnode.misc || {};
    // 图片地址（相对模板路径解析）
    if (vnode.origTag === 'image' && 'src' in misc) {
      var src = misc.src;
      if (src && typeof src === 'string' && el.getAttribute('src') !== src) el.setAttribute('src', src);
    }
    if ('placeholder' in misc) el.setAttribute('placeholder', misc.placeholder);
    if ('placeholder-class' in misc) el.setAttribute('placeholder-class', misc['placeholder-class']);
    if ('maxlength' in misc && misc.maxlength !== undefined) el.maxLength = Number(misc.maxlength) || 524288;
    if ('disabled' in misc) {
      var dis = !!misc.disabled && misc.disabled !== 'false' && misc.disabled !== '';
      if (vnode.tag === 'button' || vnode.tag === 'input' || vnode.tag === 'textarea') el.disabled = dis;
    }
    // 受控 value（只在变化时写，避免打断输入）
    if ('value' in misc && (vnode.tag === 'input' || vnode.tag === 'textarea')) {
      var v = misc.value == null ? '' : String(misc.value);
      if (el.value !== v) el.value = v;
    }
    // focus 属性：由 false → true 时拉起焦点（如创建页「其他游戏」格子聚焦输入框）
    if ('focus' in misc && (vnode.tag === 'input' || vnode.tag === 'textarea')) {
      var wantFocus = truthyAttr(misc.focus);
      var wasFocus = old && old.misc ? truthyAttr(old.misc['focus']) : false;
      if (wantFocus && !wasFocus) {
        setTimeout(function () { try { el.focus(); } catch (e) {} }, 0);
      }
    }
    if (vnode.origTag === 'scroll-view') {
      var target = misc['scroll-into-view'];
      var oldTarget = old && old.misc ? old.misc['scroll-into-view'] : undefined;
      if (target && oldTarget !== target) {
        var behavior = misc['scroll-with-animation'] ? 'smooth' : 'auto';
        // 等子节点挂载完成后再定位
        setTimeout(function () {
          // 无溢出时不滚动：原生 scrollIntoView 会沿祖先滚动链传播，
          // 锚点已可见时浏览器会去滚外层可滚祖先（如手机壳 .wx-content），导致页面位置被强制改写
          if (el.scrollHeight <= el.clientHeight) return;
          var anchor = document.getElementById(target);
          if (!anchor || !el.contains(anchor)) return;
          // 只滚 scroll-view 自身，不用 scrollIntoView（会波及祖先）
          var top = anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
          el.scrollTo({
            top: Math.max(0, top - el.clientHeight + anchor.offsetHeight),
            behavior: behavior
          });
        }, 0);
      }
    }
  }

  function setClass(el, cls) {
    if (el.getAttribute('class') !== cls) el.setAttribute('class', cls);
  }

  function truthyAttr(v) {
    if (v === undefined) return false;
    if (v === '' ) return true; // 裸属性 scroll-x
    return v === 'true' || v === true || v === 'True';
  }

  function makeEvent(native, vnode, detail, extra) {
    var ds = vnode.dataset || {};
    var ct = { dataset: ds, id: (vnode.id || '') };
    // 指针类事件附带坐标（滑块拖拽等需要 clientX）
    if (native && typeof native.clientX === 'number') {
      ct.clientX = native.clientX;
      ct.clientY = native.clientY;
    }
    var ev = {
      type: native && native.type || 'tap',
      detail: detail || {},
      currentTarget: ct,
      target: { dataset: ds, id: (vnode.id || '') },
      timeStamp: native ? native.timeStamp : Date.now()
    };
    // touch 事件的触点列表（extra 由 fireTouch 传入）
    if (extra) {
      if (extra.touches) ev.touches = extra.touches;
      if (extra.changedTouches) ev.changedTouches = extra.changedTouches;
    }
    return ev;
  }

  function attachListeners(el, vnode) {
    // tap（click）
    el.addEventListener('click', function (e) {
      var vn = el.__vn;
      if (!vn) return;
      if (vn.k === 'comp') return; // 组件宿主不响应原生 tap
      var h = vn.handlers && vn.handlers.tap;
      if (!h) {
        // open-type="share" 按钮兜底
        if (vn.misc && vn.misc['open-type'] === 'share' && WMP.core) {
          WMP.core.handleShareButton(vn);
        }
        return;
      }
      if (h.catch) e.stopPropagation();
      var method = findMethod(vn.owner, h.name);
      if (method) method.call(vn.owner, makeEvent(e, vn, {}));
    });
    // input
    el.addEventListener('input', function (e) {
      var vn = el.__vn;
      if (!vn || vn.k === 'comp') return;
      var h = vn.handlers && vn.handlers.input;
      if (!h) return;
      var method = findMethod(vn.owner, h.name);
      if (method) method.call(vn.owner, makeEvent(e, vn, { value: el.value, cursor: el.value.length }));
    });
    // confirm（回车）
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var vn = el.__vn;
      if (!vn || vn.k === 'comp') return;
      var h = vn.handlers && vn.handlers.confirm;
      if (!h) return;
      e.preventDefault();
      var method = findMethod(vn.owner, h.name);
      if (method) method.call(vn.owner, makeEvent(e, vn, { value: el.value }));
    });
    // 图片加载失败 → binderror
    el.addEventListener('error', function (e) {
      var vn = el.__vn;
      if (!vn || vn.k === 'comp') return;
      var h = vn.handlers && vn.handlers.error;
      if (!h) return;
      var method = findMethod(vn.owner, h.name);
      if (method) method.call(vn.owner, makeEvent(e, vn, {}));
    });
    // touchstart / touchmove / touchend（指针事件模拟，滑块拖拽等依赖）
    var touchDown = false;
    function fireTouch(evt, native) {
      var vn = el.__vn;
      if (!vn || vn.k === 'comp') return;
      var h = vn.handlers && vn.handlers[evt];
      if (!h) return;
      if (h.catch) native.stopPropagation();
      var touch = {
        clientX: native.clientX,
        clientY: native.clientY,
        pageX: native.clientX + window.scrollX,
        pageY: native.clientY + window.scrollY,
        identifier: 0
      };
      var method = findMethod(vn.owner, h.name);
      if (method) method.call(vn.owner, makeEvent(native, vn, {}, { touches: [touch], changedTouches: [touch] }));
    }
    el.addEventListener('pointerdown', function (e) {
      var vn = el.__vn;
      if (!vn || !vn.handlers || (!vn.handlers.touchstart && !vn.handlers.touchmove && !vn.handlers.touchend)) return;
      touchDown = true;
      // 拖拽期间禁止页面滚动/选中（对应小程序 catchtouchmove 行为）
      if (vn.handlers.touchstart && vn.handlers.touchstart.catch) e.preventDefault();
      fireTouch('touchstart', e);
    });
    el.addEventListener('pointermove', function (e) {
      if (!touchDown) return;
      var vn = el.__vn;
      if (vn && vn.handlers && vn.handlers.touchmove && vn.handlers.touchmove.catch) e.preventDefault();
      fireTouch('touchmove', e);
    });
    function endTouch(e) {
      if (!touchDown) return;
      touchDown = false;
      fireTouch('touchend', e);
    }
    el.addEventListener('pointerup', endTouch);
    el.addEventListener('pointercancel', endTouch);
    // hover-class 按压态
    el.addEventListener('pointerdown', function () {
      var vn = el.__vn;
      if (!vn || !vn.hover || vn.hover === 'none') return;
      el.classList.add(vn.hover);
    });
    function clearHover() {
      var vn = el.__vn;
      if (!vn || !vn.hover || vn.hover === 'none') return;
      el.classList.remove(vn.hover);
    }
    el.addEventListener('pointerup', clearHover);
    el.addEventListener('pointerleave', clearHover);
    el.addEventListener('pointercancel', clearHover);
  }

  function findMethod(owner, name) {
    if (!owner || !name) return null;
    var fn = owner[name];
    return typeof fn === 'function' ? fn : null;
  }

  // 列表 diff：按 key 复用，其余新建
  function syncChildren(container, newList, oldList, ctx) {
    var oldMap = {};
    var oldEls = [];
    for (var i = 0; i < container.childNodes.length; i++) {
      var cel = container.childNodes[i];
      var cvn = cel.__vn;
      if (cvn && cvn.key !== undefined && oldMap[cvn.key] === undefined) oldMap[cvn.key] = cvn;
      oldEls.push(cel);
    }

    var newEls = [];
    var usedOld = {};
    for (var j = 0; j < newList.length; j++) {
      var vn = newList[j];
      var el;
      var old = oldMap[vn.key];
      if (old && !usedOld[vn.key] && compatible(old, vn)) {
        usedOld[vn.key] = true;
        el = patchVNode(old, vn, ctx);
      } else {
        el = createEl(vn);
        if (vn.k === 'comp') {
          mountComp(vn, el);
        } else if (vn.children) {
          mountChildren(el, vn, ctx);
        }
      }
      newEls.push(el);
    }

    // 删除不再存在的旧节点
    for (var k = 0; k < oldEls.length; k++) {
      if (newEls.indexOf(oldEls[k]) === -1) {
        var ovn = oldEls[k].__vn;
        if (ovn && ovn.k === 'comp' && ovn.instance) destroyComp(ovn);
        if (oldEls[k].parentNode) oldEls[k].parentNode.removeChild(oldEls[k]);
      }
    }
    // 按序放置
    for (var m = 0; m < newEls.length; m++) {
      if (container.childNodes[m] !== newEls[m]) container.insertBefore(newEls[m], container.childNodes[m] || null);
    }
  }

  function mountChildren(el, vn, ctx) {
    if (!vn.children) return;
    for (var i = 0; i < vn.children.length; i++) {
      var child = vn.children[i];
      var cel = createEl(child);
      if (child.k === 'comp') mountComp(child, cel);
      else if (child.children) mountChildren(cel, child, ctx);
      el.appendChild(cel);
    }
  }

  function compatible(old, vn) {
    if (old.k !== vn.k) return false;
    if (old.k === 'elem') return old.tag === vn.tag && old.origTag === vn.origTag;
    if (old.k === 'comp') return old.compName === vn.compName && old.path === vn.path;
    return true;
  }

  function patchVNode(old, vn, ctx) {
    var el = old.__el;
    vn.__el = el;
    if (vn.k === 'text') {
      if (old.text !== vn.text) el.textContent = vn.text;
      return el;
    }
    applyEl(el, vn, old);
    if (vn.k === 'comp') {
      // 组件复用：继承旧实例，更新宿主指针并同步属性（触发 observers 和 scheduleRender）
      var inst = old.instance;
      vn.instance = inst;
      if (inst) {
        inst._hostVn = vn;
        inst._hostEl = el;
        updateComp(inst, vn);
      }
      return el;
    }
    syncChildren(el, vn.children, old.children, ctx);
    return el;
  }

  // 组件实例挂接（实例创建在 core.createComponent）
  function mountComp(vn, el) {
    vn.__el = el;
    var instance = WMP.core.createComponent(vn);
    vn.instance = instance;
    instance._hostVn = vn;
    instance._hostEl = el;
    WMP.core.renderInstanceInto(instance, el);
  }

  function updateComp(instance, hostVn) {
    WMP.core.updateCompProps(instance, hostVn);
  }

  function destroyComp(vn) {
    if (vn.instance && vn.comps) {
      vn.comps.delete(vn.path);
      var c = vn.instance._config;
      if (c && c.lifetimes && c.lifetimes.detached) {
        try { c.lifetimes.detached.call(vn.instance); } catch (e) { /* 忽略 */ }
      }
      if (vn.instance.onDestroy) vn.instance.onDestroy();
    }
  }

  // ---------- 对外接口 ----------
  // owner：页面或组件实例；返回根级 vnode 列表
  function renderTemplate(ast, data, owner, tmplPath, usingComps, compsRegistry) {
    var ctx = {
      owner: owner,
      tmplPath: tmplPath,
      usingComps: usingComps || {},
      comps: compsRegistry,
      visited: null
    };
    return buildChildren(ast.children, data, ctx, '');
  }

  return {
    parse: parse,
    renderTemplate: renderTemplate,
    syncChildren: syncChildren
  };
})();
