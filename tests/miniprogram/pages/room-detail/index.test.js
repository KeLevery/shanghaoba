// room-detail 房间详情页（重点）：
// 分享自动入房、3 watcher 生命周期、dissolved 跳走、
// messages 增量 append 去重排序、操作映射与显隐数据、订阅提醒诚实文案
const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
require('../../../../miniprogram/pages/room-detail/index');

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

function flushAll() {
  return flush().then(flush).then(flush);
}

// 按云函数名路由 stub；值或函数（函数收到 data，返回 result）
function stubCall(map) {
  wx.cloud.callFunction = jest.fn(function (args) {
    var fn = map[args.name];
    if (!fn) {
      return Promise.reject(new Error('未 stub 的云函数: ' + args.name));
    }
    var value = typeof fn === 'function' ? fn(args.data) : fn;
    return Promise.resolve({ result: value });
  });
}

// getRoom 全量结果骨架
function roomResult(overrides) {
  return Object.assign({
    room: {
      _id: 'r1', game: '无畏契约', mode: '排位', maxPlayers: 5,
      startTimeLabel: '现在开打', remark: '', status: 'recruiting', hostOpenid: 'host1'
    },
    participants: [{ openid: 'host1', displayName: '房主', isHost: true, ready: false }],
    messages: [],
    isHost: false,
    myReady: false,
    isMember: true
  }, overrides || {});
}

// 内存版 wx.cloud.database()：仅实现 room-detail 用到的链式 API，
// watchers 上保留 handlers 供测试手动推事件，close 为 jest.fn 可断言
function createFakeDb(users) {
  var watchers = {};
  function register(key, handlers) {
    watchers[key] = {
      handlers: handlers,
      closed: false,
      close: jest.fn(function () { watchers[key].closed = true; })
    };
    return watchers[key];
  }
  var db = {
    collection: function (name) {
      if (name === 'users') {
        return {
          limit: function () {
            return { get: function () { return Promise.resolve({ data: users || [] }); } };
          }
        };
      }
      if (name === 'rooms') {
        return {
          doc: function () {
            return { watch: function (handlers) { return register('room', handlers); } };
          }
        };
      }
      if (name === 'participants') {
        return {
          where: function () {
            return { watch: function (handlers) { return register('participants', handlers); } };
          }
        };
      }
      if (name === 'messages') {
        return {
          where: function () {
            return {
              orderBy: function () {
                return { watch: function (handlers) { return register('messages', handlers); } };
              }
            };
          }
        };
      }
      throw new Error('未 stub 的集合: ' + name);
    }
  };
  return { db: db, watchers: watchers };
}

// 完成 onLoad 的标准页面（已是成员、非房主），返回页面与 fakeDb 句柄
async function enterStandardPage(extra) {
  var fake = createFakeDb([{ openid: 'me' }]);
  wx.cloud.database = jest.fn(function () { return fake.db; });
  stubCall(Object.assign({ getRoom: roomResult() }, extra || {}));
  var page = createPage();
  await page.onLoad({ roomId: 'r1' });
  await flushAll(); // resolveMyOpenid 等尾部异步
  return { page: page, fake: fake };
}

describe('room-detail 页面（进入与分享自动入房）', () => {
  beforeEach(reset);

  test('onLoad 缺少 roomId 时提示且不发云调用', async () => {
    const page = createPage();
    await page.onLoad({});
    expect(wxState.toasts).toContainEqual({ title: '缺少房间信息', icon: 'none' });
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });

  test('已是成员：只调 getRoom，不 joinRoom', async () => {
    var ctx = await enterStandardPage();
    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['getRoom']);
    expect(ctx.page.data.room._id).toBe('r1');
    expect(ctx.page.data.room.statusText).toBe('招募中');
    expect(ctx.page.data.participants).toHaveLength(1);
  });

  test('分享进入 isMember=false：先 joinRoom 再重新 getRoom 展示', async () => {
    var fake = createFakeDb([{ openid: 'me' }]);
    wx.cloud.database = jest.fn(function () { return fake.db; });
    var getRoomCalls = 0;
    stubCall({
      getRoom: function () {
        getRoomCalls += 1;
        return roomResult({ isMember: getRoomCalls > 1 });
      },
      joinRoom: { joined: true }
    });
    const page = createPage();

    await page.onLoad({ roomId: 'r1' });
    await flushAll();

    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['getRoom', 'joinRoom', 'getRoom']);
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'joinRoom', data: { roomId: 'r1' } });
    expect(page.data.room._id).toBe('r1');
  });

  test('getRoom 失败：toast 错误并延迟 navigateBack', async () => {
    stubCall({
      getRoom: function () { return Promise.reject(new Error('房间不存在或已关闭')); }
    });
    const page = createPage();

    jest.useFakeTimers();
    try {
      await page.onLoad({ roomId: 'r1' });
      expect(wxState.toasts).toContainEqual({ title: '房间不存在或已关闭', icon: 'none' });
      expect(wxState.navigations).toEqual([]);
      jest.advanceTimersByTime(900);
      expect(wxState.navigations).toEqual([{ back: true }]);
      // 未成功进入，不应建立 watcher
      expect(page._roomWatcher).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('room-detail 页面（watcher 生命周期）', () => {
  beforeEach(reset);

  test('进入后建立 3 个 watcher，onUnload 全部 close 无泄漏', async () => {
    var ctx = await enterStandardPage();

    expect(ctx.fake.watchers.room).toBeDefined();
    expect(ctx.fake.watchers.participants).toBeDefined();
    expect(ctx.fake.watchers.messages).toBeDefined();

    ctx.page.onUnload();

    expect(ctx.fake.watchers.room.close).toHaveBeenCalledTimes(1);
    expect(ctx.fake.watchers.participants.close).toHaveBeenCalledTimes(1);
    expect(ctx.fake.watchers.messages.close).toHaveBeenCalledTimes(1);
    // 重复 onUnload 不报错、不重复 close
    ctx.page.onUnload();
    expect(ctx.fake.watchers.room.close).toHaveBeenCalledTimes(1);
  });

  test('room watcher 收到 dissolved：toast + close 全部 watcher + 延迟 navigateBack', async () => {
    var ctx = await enterStandardPage();

    jest.useFakeTimers();
    try {
      ctx.fake.watchers.room.handlers.onChange({ docs: [{ _id: 'r1', status: 'dissolved' }] });

      expect(wxState.toasts).toContainEqual({ title: '房间已解散', icon: 'none' });
      expect(ctx.fake.watchers.room.close).toHaveBeenCalledTimes(1);
      expect(ctx.fake.watchers.participants.close).toHaveBeenCalledTimes(1);
      expect(ctx.fake.watchers.messages.close).toHaveBeenCalledTimes(1);
      expect(wxState.navigations).toEqual([]);
      jest.advanceTimersByTime(700);
      expect(wxState.navigations).toEqual([{ back: true }]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('room watcher 正常状态变化：直接 formatRoom 更新，不重拉 getRoom', async () => {
    var ctx = await enterStandardPage();
    var callsBefore = wx.cloud.callFunction.mock.calls.length;

    ctx.fake.watchers.room.handlers.onChange({
      docs: [{ _id: 'r1', game: '无畏契约', status: 'pending', hostOpenid: 'host1' }]
    });

    expect(ctx.page.data.room.status).toBe('pending');
    expect(ctx.page.data.room.statusText).toBe('待房主开始');
    expect(ctx.page.data.room.isPendingState).toBe(true);
    expect(wx.cloud.callFunction.mock.calls.length).toBe(callsBefore);
  });
});

describe('room-detail 页面（participants/messages watcher 增量更新）', () => {
  beforeEach(reset);

  test('participants 快照本地重建列表并同步 readyCount 与 myReady', async () => {
    var ctx = await enterStandardPage();

    ctx.fake.watchers.participants.handlers.onChange({
      docs: [
        { openid: 'host1', isHost: true, ready: true },
        { openid: 'me', isHost: false, ready: true }
      ]
    });

    expect(ctx.page.data.participants).toEqual([
      { openid: 'host1', displayName: '房主', isHost: true, ready: true },
      { openid: 'me', displayName: '', isHost: false, ready: true }
    ]);
    expect(ctx.page.data.readyCount).toBe(2);
    // 本人准备状态被其他端修改时同步 myReady
    expect(ctx.page.data.myReady).toBe(true);
  });

  test('participants 快照出现陌生 openid：防抖 800ms 后重拉 getRoom 补水昵称', async () => {
    var ctx = await enterStandardPage();
    var callsBefore = wx.cloud.callFunction.mock.calls.length;

    jest.useFakeTimers();
    try {
      ctx.fake.watchers.participants.handlers.onChange({
        docs: [{ openid: 'host1', isHost: true, ready: false }, { openid: 'new-guy', ready: false }]
      });
      // 防抖窗口内重拉未发生
      expect(wx.cloud.callFunction.mock.calls.length).toBe(callsBefore);
      await jest.advanceTimersByTimeAsync(800);
      var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
      expect(names[names.length - 1]).toBe('getRoom');
    } finally {
      jest.useRealTimers();
    }
  });

  test('messages watcher：增量 append + _id 去重 + 乱序按 createdAt 归位', async () => {
    var ctx = await enterStandardPage({
      getRoom: roomResult({
        messages: [{ _id: 'm1', openid: 'host1', content: '第一句', createdAt: 100 }]
      })
    });

    // 乱序到达：m2(ts 300) 先于 m3(ts 200)
    ctx.fake.watchers.messages.handlers.onChange({
      docs: [
        { _id: 'm1', openid: 'host1', content: '第一句', createdAt: 100 },
        { _id: 'm2', openid: 'me', content: '第二句', createdAt: 300 },
        { _id: 'm3', openid: 'host1', content: '插队的', createdAt: 200 }
      ]
    });

    var ids = ctx.page.data.messages.map(function (m) { return m._id; });
    expect(ids).toEqual(['m1', 'm3', 'm2']);
    expect(ctx.page.data.lastMessageId).toBe('msg-m2');

    // 重复事件：m2 再次出现不应重复 append，仅新增 m4
    ctx.fake.watchers.messages.handlers.onChange({
      docs: [
        { _id: 'm2', openid: 'me', content: '第二句', createdAt: 300 },
        { _id: 'm4', openid: 'me', content: '第四句', createdAt: 400 }
      ]
    });

    ids = ctx.page.data.messages.map(function (m) { return m._id; });
    expect(ids).toEqual(['m1', 'm3', 'm2', 'm4']);
    expect(ctx.page.data.lastMessageId).toBe('msg-m4');
  });
});

describe('room-detail 页面（操作映射与按钮显隐数据）', () => {
  beforeEach(reset);

  test('显隐数据：房主 + pending → isHost 且 isPendingState（开始按钮可见）', async () => {
    var fake = createFakeDb([]);
    wx.cloud.database = jest.fn(function () { return fake.db; });
    stubCall({
      getRoom: roomResult({
        isHost: true,
        room: {
          _id: 'r1', game: '无畏契约', mode: '排位', maxPlayers: 5,
          startTimeLabel: '今晚', remark: '', status: 'pending', hostOpenid: 'me'
        }
      })
    });
    const page = createPage();
    await page.onLoad({ roomId: 'r1' });

    expect(page.data.isHost).toBe(true);
    expect(page.data.room.isPendingState).toBe(true);
    expect(page.data.room.isReadyState).toBe(false);
    // 房主身份可直接推得本人 openid，无需查 users 集合
    expect(page._myOpenid).toBe('me');
  });

  test('显隐数据：非房主 + recruiting → 开始/解散按钮均不可见', async () => {
    var ctx = await enterStandardPage();
    expect(ctx.page.data.isHost).toBe(false);
    expect(ctx.page.data.room.isPendingState).toBe(false);
    expect(ctx.page.data.room.isReadyState).toBe(false);
  });

  test('toggleReady：更新 myReady 并重拉校准；模板未配置时不请求订阅授权', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();
    stubCall({
      toggleReady: { ready: true, allReady: false, status: 'recruiting' },
      getRoom: roomResult({ myReady: true })
    });

    await ctx.page.toggleReady();
    await flushAll();

    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['toggleReady', 'getRoom']);
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'toggleReady', data: { roomId: 'r1' } });
    expect(ctx.page.data.myReady).toBe(true);
    expect(wx.requestSubscribeMessage).not.toHaveBeenCalled();
  });

  test('startRoom：确认后调用云函数、按 notification 提示并重拉', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();
    stubCall({
      startRoom: { status: 'ready', notification: { status: 'not_configured' } },
      getRoom: roomResult({ isHost: true, myReady: true, room: roomResult().room })
    });

    ctx.page.startRoom(); // harness 的 showModal 自动确认
    await flushAll();

    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['startRoom', 'getRoom']);
    expect(wxState.modals[0].title).toBe('开始游戏');
    expect(wxState.toasts).toContainEqual({ title: '已开始，开打提醒尚未配置', icon: 'none' });
  });

  test('toastNotification 各分支诚实文案', () => {
    const page = createPage();

    page.toastNotification(null);
    expect(wxState.toasts.pop()).toEqual({ title: '已开始', icon: 'success' });

    page.toastNotification({ status: 'not_configured' });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，开打提醒尚未配置', icon: 'none' });

    page.toastNotification({ status: 'unavailable' });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，开打提醒服务不可用', icon: 'none' });

    page.toastNotification({ status: 'sent' });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，已通知队友', icon: 'success' });

    // partial：失败全部为未订阅 → 提示「部分成员未开启提醒」
    page.toastNotification({ status: 'partial', unsubscribed: 2, failed: 2 });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，部分成员未开启提醒', icon: 'none' });

    // partial：存在真实失败 → 提示「部分发送失败」
    page.toastNotification({ status: 'partial', unsubscribed: 1, failed: 2 });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，开打提醒部分发送失败', icon: 'none' });

    page.toastNotification({ status: 'failed' });
    expect(wxState.toasts.pop()).toEqual({ title: '已开始，开打提醒发送失败', icon: 'none' });
  });

  test('leaveRoom：确认后调用 leaveRoom 并 navigateBack', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();
    stubCall({ leaveRoom: { left: true } });

    ctx.page.leaveRoom();
    await flushAll();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'leaveRoom', data: { roomId: 'r1' } });
    expect(wxState.navigations).toEqual([{ back: true }]);
  });

  test('dissolveRoom：确认后调用 dissolveRoom 并 reLaunch 回大厅', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();
    stubCall({ dissolveRoom: { dissolved: true } });

    ctx.page.dissolveRoom();
    await flushAll();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'dissolveRoom', data: { roomId: 'r1' } });
    expect(wxState.navigations).toEqual([{ url: '/pages/index/index' }]);
  });

  test('onRemoveMember：房主移除队员走 leaveRoom + targetOpenid', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();
    stubCall({ leaveRoom: { left: true } });

    ctx.page.onRemoveMember({ detail: { openid: 'p2' } });
    await flushAll();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'leaveRoom',
      data: { roomId: 'r1', targetOpenid: 'p2' }
    });
  });

  test('onRemoveMember 缺少 openid 时不弹窗不调用', () => {
    const page = createPage();
    page.onRemoveMember({ detail: {} });
    expect(wxState.modals).toEqual([]);
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });

  test('sendMessage：空内容拦截；成功后清空输入框并记录 messageId', async () => {
    var ctx = await enterStandardPage();
    wx.cloud.callFunction.mockClear();

    ctx.page.setData({ messageContent: '   ' });
    await ctx.page.sendMessage();
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();

    stubCall({ sendMessage: { messageId: 'm9' } });
    ctx.page.setData({ messageContent: '  冲鸭  ' });
    await ctx.page.sendMessage();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'sendMessage',
      data: { roomId: 'r1', content: '冲鸭' }
    });
    expect(ctx.page.data.messageContent).toBe('');
    expect(ctx.page._lastSentMessageId).toBe('m9');
  });

  test('onShareAppMessage 分享卡片 path 携带 roomId', async () => {
    var ctx = await enterStandardPage();
    var share = ctx.page.onShareAppMessage();
    expect(share.path).toBe('/pages/room-detail/index?roomId=r1');
    expect(share.title).toContain('无畏契约');
  });
});
