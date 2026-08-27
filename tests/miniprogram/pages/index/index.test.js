// index 招募大厅页：onShow/下拉刷新触发 listRooms+listMyRooms、空态、容错与跳转
const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
require('../../../../miniprogram/pages/index/index');

// 等待页面里的 Promise 链跑完（onShow/loadAll 均不返回 Promise）
function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

// 依次 flush 多轮，确保 Promise.all 之后的 setData 也完成
function flushAll() {
  return flush().then(flush).then(flush);
}

// 按云函数名路由 stub 返回值
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

describe('index 页面（招募大厅）', () => {
  beforeEach(reset);

  test('onShow 并发触发 listRooms + listMyRooms 并渲染两区', async () => {
    stubCall({
      listRooms: { rooms: [{ _id: 'r1', game: '无畏契约', memberCount: 3 }] },
      listMyRooms: { rooms: [{ _id: 'r2', game: 'CS2', roleText: '房主' }] }
    });
    const page = createPage();

    page.onShow();
    await flushAll();

    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['listRooms', 'listMyRooms']);
    expect(page.data.rooms).toEqual([{ _id: 'r1', game: '无畏契约', memberCount: 3 }]);
    expect(page.data.myRooms).toEqual([{ _id: 'r2', game: 'CS2', roleText: '房主' }]);
  });

  test('已加入的房间不再重复出现在正在召集区（按 _id 去重）', async () => {
    stubCall({
      listRooms: { rooms: [
        { _id: 'r1', game: '无畏契约', memberCount: 3 },
        { _id: 'r2', game: 'CS2', memberCount: 2 }
      ] },
      listMyRooms: { rooms: [{ _id: 'r2', game: 'CS2', roleText: '队员' }] }
    });
    const page = createPage();

    page.onShow();
    await flushAll();

    expect(page.data.filteredMyRooms.map(function (r) { return r._id; })).toEqual(['r2']);
    expect(page.data.filteredRooms.map(function (r) { return r._id; })).toEqual(['r1']);
  });

  test('空态：两接口返回空数组时两区均为空', async () => {
    stubCall({ listRooms: { rooms: [] }, listMyRooms: { rooms: [] } });
    const page = createPage();

    page.onShow();
    await flushAll();

    expect(page.data.rooms).toEqual([]);
    expect(page.data.myRooms).toEqual([]);
  });

  test('单个接口失败不拖垮另一区，错误 toast 由 cloud.js 统一弹出', async () => {
    stubCall({
      listRooms: function () { return Promise.reject(new Error('网络异常')); },
      listMyRooms: { rooms: [{ _id: 'r2', game: 'CS2' }] }
    });
    const page = createPage();

    page.onShow();
    await flushAll();

    // listRooms 失败：rooms 保持初始空数组；listMyRooms 正常落地
    expect(page.data.rooms).toEqual([]);
    expect(page.data.myRooms).toEqual([{ _id: 'r2', game: 'CS2' }]);
    expect(wxState.toasts).toContainEqual({ title: '网络异常', icon: 'none' });
  });

  test('onPullDownRefresh 触发刷新并在结束后收起下拉动画', async () => {
    stubCall({
      listRooms: { rooms: [{ _id: 'r1' }] },
      listMyRooms: { rooms: [] }
    });
    const page = createPage();

    page.onPullDownRefresh();
    await flushAll();

    var names = wx.cloud.callFunction.mock.calls.map(function (c) { return c[0].name; });
    expect(names).toEqual(['listRooms', 'listMyRooms']);
    expect(page.data.rooms).toEqual([{ _id: 'r1' }]);
    expect(wxState.pullDownStops).toBe(1);
  });

  test('onRoomTap 携带 roomId 跳转房间详情', () => {
    const page = createPage();
    page.onRoomTap({ detail: { roomId: 'r123' } });
    expect(wxState.navigations[0].url).toBe('/pages/room-detail/index?roomId=r123');
  });

  test('onRoomTap 缺少 roomId 时不跳转', () => {
    const page = createPage();
    page.onRoomTap({ detail: {} });
    expect(wxState.navigations).toEqual([]);
  });

  test('goCreate 切换发起上号 tab 页', () => {
    const page = createPage();
    page.goCreate();
    expect(wxState.switchTabs[0].url).toBe('/pages/create-room/index');
  });

  test('onJoinByCode 按码查询后跳转房间详情（码归一大写、跳过已解散/过期房取最新）', async () => {
    var capturedWhere = null;
    var capturedOrderBy = null;
    var builder;
    builder = {
      where: function (cond) { capturedWhere = cond; return builder; },
      orderBy: function (field, dir) { capturedOrderBy = [field, dir]; return builder; },
      limit: function () { return builder; },
      get: function () {
        // 倒序返回：第一个已解散、第二个已过期，第三个才是有效房
        return Promise.resolve({ data: [
          { _id: 'r-old', status: 'dissolved' },
          { _id: 'r-expired', status: 'recruiting', expireAt: Date.now() - 1000 },
          { _id: 'r9', status: 'recruiting', expireAt: Date.now() + 100000 }
        ] });
      }
    };
    wx.cloud.database = jest.fn(function () {
      return { collection: function () { return builder; }, command: {} };
    });

    const page = createPage();
    page.setData({ inviteCode: ' kd42 ' });
    page.onJoinByCode();
    await flushAll();

    expect(capturedWhere.inviteCode).toBe('KD42');
    expect(capturedOrderBy).toEqual(['createdAt', 'desc']);
    expect(wxState.navigations[0].url).toBe('/pages/room-detail/index?roomId=r9');
  });

  test('onJoinByCode 无匹配房间时提示码不存在且不跳转', async () => {
    var builder;
    builder = {
      where: function () { return builder; },
      orderBy: function () { return builder; },
      limit: function () { return builder; },
      get: function () { return Promise.resolve({ data: [] }); }
    };
    wx.cloud.database = jest.fn(function () {
      return {
        collection: function () { return builder; },
        command: {}
      };
    });

    const page = createPage();
    page.setData({ inviteCode: 'ZZZZ' });
    page.onJoinByCode();
    await flushAll();

    expect(wxState.navigations).toEqual([]);
    expect(wxState.toasts).toContainEqual({ title: '邀请码不存在，再核对一下', icon: 'none' });
  });

  test('onJoinByCode 命中房均已过期时提示重新发起（兼容 ISO 字符串 expireAt）', async () => {
    var builder;
    builder = {
      where: function () { return builder; },
      orderBy: function () { return builder; },
      limit: function () { return builder; },
      get: function () {
        return Promise.resolve({ data: [
          { _id: 'r-expired', status: 'recruiting', expireAt: new Date(Date.now() - 60000).toISOString() }
        ] });
      }
    };
    wx.cloud.database = jest.fn(function () {
      return { collection: function () { return builder; }, command: {} };
    });

    const page = createPage();
    page.setData({ inviteCode: 'KD42' });
    page.onJoinByCode();
    await flushAll();

    expect(wxState.navigations).toEqual([]);
    expect(wxState.toasts).toContainEqual({ title: '房间已过期，请房主重新发起', icon: 'none' });
  });

  test('onJoinByCode 未输入码时仅提示，不查库', () => {
    wx.cloud.database = jest.fn();
    const page = createPage();
    page.onJoinByCode();
    expect(wx.cloud.database).not.toHaveBeenCalled();
    expect(wxState.toasts).toContainEqual({ title: '请输入邀请码', icon: 'none' });
  });
});
