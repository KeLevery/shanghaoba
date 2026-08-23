// ============================================================
// web/server.js — 上号吧 · 网页运行时服务器
//
// 用途：把微信小程序在浏览器里跑起来。
//   - 浏览器端跑「真实」miniprogram 页面代码（见 web/public/runtime）
//   - 本服务器执行「真实」云函数代码，后端用 tests/helpers/wxServerSdkMock
//     的内存数据库模拟 wx-server-sdk（require 钩子拦截）
//   - 提供 /api/db 查询 + 轮询，支撑页面里的 watcher 实时监听
//
// 启动：node web/server.js  （或 npm run web）
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP_ROOT = path.join(ROOT, 'miniprogram');
const CF_ROOT = path.join(ROOT, 'cloudfunctions');
const PUB_ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);

// ---- 拦截 wx-server-sdk，指向测试工程的内存 mock ----
const Module = require('module');
const mockSdkPath = path.join(ROOT, 'tests', 'helpers', 'wxServerSdkMock.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'wx-server-sdk') return mockSdkPath;
  return origResolve.call(this, request, parent, isMain, options);
};
const mockCloud = require(mockSdkPath);

// ---- 加载全部云函数（真实业务代码） ----
const CLOUD_FNS = {};
for (const name of fs.readdirSync(CF_ROOT)) {
  const entry = path.join(CF_ROOT, name, 'index.js');
  if (fs.statSync(path.join(CF_ROOT, name)).isDirectory() && fs.existsSync(entry)) {
    CLOUD_FNS[name] = require(entry);
  }
}

// ---- 串行队列：mock 的 openid 是全局态，请求必须排队执行 ----
let chain = Promise.resolve();
function serialized(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function runCloud(name, uid, data) {
  const fn = CLOUD_FNS[name];
  if (!fn || typeof fn.main !== 'function') {
    throw new Error('云函数不存在: ' + name);
  }
  return serialized(() => {
    mockCloud.__setOpenid(uid);
    return fn.main(data || {});
  });
}

// 客户端数据库查询（页面 watcher / users 自查走这里）
async function dbQuery(uid, q) {
  return serialized(async () => {
    mockCloud.__setOpenid(uid);
    const db = mockCloud.database();
    if (q.docId) {
      const res = await db.collection(q.collection).doc(q.docId).get();
      return [res.data];
    }
    let query = db.collection(q.collection).where(q.where || {});
    if (q.orderBy) query = query.orderBy(q.orderBy, q.orderDir || 'asc');
    if (q.limit) query = query.limit(q.limit);
    const res = await query.get();
    let data = res.data;
    // users 集合「仅创建者可读写」：只返回本人记录
    if (q.collection === 'users') data = data.filter((u) => u.openid === uid);
    return data;
  });
}

// ---- 演示数据：全部通过真实云函数逻辑生成 ----
const DEMO_USERS = [
  { uid: 'u-kele', name: 'Kele' },
  { uid: 'u-awei', name: '阿伟' },
  { uid: 'u-xiaomei', name: '小美' },
  { uid: 'u-laowang', name: '老王' }
];

async function seedDemo() {
  return serialized(async () => {
    mockCloud.__reset();
    const U = { kele: 'u-kele', awei: 'u-awei', xiaomei: 'u-xiaomei', laowang: 'u-laowang' };
    const as = (uid) => mockCloud.__setOpenid(uid);
    const call = (name, data) => CLOUD_FNS[name].main(data || {});

    for (const u of DEMO_USERS) {
      as(u.uid);
      await call('saveProfile', { gameNickname: u.name });
    }

    // 房间 1：Kele 的无畏契约房（今晚，进行中的热闹房间）
    as(U.kele);
    const r1 = await call('createRoom', {
      game: '无畏契约', mode: '亚海悬城 5v5', maxPlayers: 5,
      startTimeLabel: '今晚', remark: '来听指挥的'
    });
    await call('sendMessage', { roomId: r1.roomId, content: '人齐了都准备一下，开一把就走' });
    as(U.awei);
    await call('joinRoom', { roomId: r1.roomId });
    await call('sendMessage', { roomId: r1.roomId, content: '等我上个厕所' });
    await call('toggleReady', { roomId: r1.roomId });
    as(U.xiaomei);
    await call('joinRoom', { roomId: r1.roomId });
    await call('sendMessage', { roomId: r1.roomId, content: '我先准备了，你们快点' });
    await call('toggleReady', { roomId: r1.roomId });

    // 房间 2：老王的 CS2（现在开打，就差一个）
    as(U.laowang);
    const r2 = await call('createRoom', {
      game: 'CS2', mode: '官匹竞技', maxPlayers: 5,
      startTimeLabel: '现在开打', remark: '速来，就差一个'
    });
    await call('sendMessage', { roomId: r2.roomId, content: '官匹上车，速来' });
    as(U.kele);
    await call('joinRoom', { roomId: r2.roomId });

    // 房间 3：阿伟的英雄联盟灵活组排
    as(U.awei);
    const r3 = await call('createRoom', {
      game: '英雄联盟', mode: '灵活组排', maxPlayers: 5,
      startTimeLabel: '现在开打', remark: '段位不限'
    });
    as(U.xiaomei);
    await call('joinRoom', { roomId: r3.roomId });
    as(U.kele);
  });
}

// ---- 小程序文件清单（浏览器启动时一次性拉取） ----
const MP_EXTS = new Set(['.js', '.json', '.wxml', '.wxss', '.svg', '.png', '.txt']);
function walkDir(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(full).isDirectory()) walkDir(full, rel, out);
    else if (MP_EXTS.has(path.extname(name).toLowerCase())) out.push(rel);
  }
  return out;
}
let manifestCache = null;
function buildManifest() {
  if (!manifestCache) manifestCache = { files: walkDir(MP_ROOT, '', []) };
  return manifestCache;
}

// ---- HTTP ----
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wxml': 'text/plain; charset=utf-8',
  '.wxss': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

function sendFile(res, filePath, cacheable) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404: ' + filePath);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': cacheable ? 'public, max-age=3600' : 'no-cache'
    });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
    });
  });
}

function sendJSON(res, obj) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  try {
    // ---- API ----
    if (pathname.startsWith('/api/')) {
      const uid = (req.headers['x-uid'] || 'u-kele').toString().slice(0, 64);

      if (req.method === 'POST' && pathname.startsWith('/api/cloud/')) {
        const name = pathname.slice('/api/cloud/'.length);
        const body = await readBody(req);
        try {
          const result = await runCloud(name, uid, body.data);
          sendJSON(res, { result });
        } catch (error) {
          sendJSON(res, { error: (error && error.message) || '云函数执行失败' });
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/api/db') {
        const q = await readBody(req);
        try {
          const data = await dbQuery(uid, q);
          sendJSON(res, { data });
        } catch (error) {
          sendJSON(res, { error: (error && error.message) || '查询失败' });
        }
        return;
      }

      if (pathname === '/api/users') {
        const users = (mockCloud.__collection('users') || []).map((u) => ({
          openid: u.openid, gameNickname: u.gameNickname || ''
        }));
        sendJSON(res, { users });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/seed') {
        await seedDemo();
        const users = (mockCloud.__collection('users') || []).map((u) => ({
          openid: u.openid, gameNickname: u.gameNickname || ''
        }));
        sendJSON(res, { ok: true, users });
        return;
      }

      sendJSON(res, { error: 'unknown api' });
      return;
    }

    // ---- 小程序原始文件 ----
    if (pathname === '/mp/manifest.json') {
      sendJSON(res, buildManifest());
      return;
    }
    if (pathname.startsWith('/mp/')) {
      const rel = pathname.slice('/mp/'.length).replace(/\//g, path.sep);
      const full = path.join(MP_ROOT, rel);
      if (full.startsWith(MP_ROOT) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        sendFile(res, full, true);
      } else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404');
      }
      return;
    }

    // ---- 运行时静态文件（web/public 下） ----
    if (pathname === '/') {
      sendFile(res, path.join(PUB_ROOT, 'public', 'index.html'));
      return;
    }
    const staticRoot = path.join(PUB_ROOT, 'public');
    const staticCandidate = path.join(staticRoot, pathname.replace(/\//g, path.sep));
    if (staticCandidate.startsWith(staticRoot) && fs.existsSync(staticCandidate) && fs.statSync(staticCandidate).isFile()) {
      sendFile(res, staticCandidate, false);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(error && error.message) }));
  }
});

// 启动：先种演示数据再监听
seedDemo().then(() => {
  server.listen(PORT, () => {
    const url = 'http://localhost:' + PORT;
    console.log('');
    console.log('  上号吧 · 网页运行时已启动');
    console.log('  → ' + url);
    console.log('  云函数：' + Object.keys(CLOUD_FNS).length + ' 个（内存 mock 后端）');
    console.log('');
    // Windows 下自动打开浏览器（失败不影响使用）
    if (process.platform === 'win32') {
      require('child_process').exec('start "" "' + url + '"', () => {});
    }
  });
}).catch((error) => {
  console.error('演示数据初始化失败:', error);
  process.exit(1);
});
