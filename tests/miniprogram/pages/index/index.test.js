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
});
