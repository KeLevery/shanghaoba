// messages 消息聚合页：listMyRooms → 并发 getRoom 组装最近消息、容错与空态
const { reset, createPage } = require('../../../helpers/miniprogramHarness');
require('../../../../miniprogram/pages/messages/index');

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

function flushAll() {
  return flush().then(flush).then(flush).then(flush);
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

describe('messages 页面（消息聚合）', () => {
  beforeEach(reset);

  test('onShow 聚合我的房间最近一条消息', async () => {
    stubCall({
      listMyRooms: { rooms: [{ _id: 'r1', game: 'CS2', mode: '竞技' }] },
      getRoom: {
        room: { _id: 'r1', game: 'CS2', maxPlayers: 5 },
        participants: [{ openid: 'a', isHost: true }],
        messages: [
          { _id: 'm1', content: '老位置集合', createdAt: 1700000000000 },
          { _id: 'm2', content: '收到', createdAt: 1700000060000, displayName: '老王' }
        ]
      }
    });
    const page = createPage();

    page.onShow();
    await flushAll();

    expect(page.data.items.length).toBe(1);
    expect(page.data.items[0].roomId).toBe('r1');
    expect(page.data.items[0].lastContent).toBe('收到');
    expect(page.data.items[0].lastSender).toBe('老王');
    expect(page.data.items[0].memberCount).toBe(1);
    expect(page.data.loading).toBe(false);
  });

  test('单个房间 getRoom 失败不拖垮整页', async () => {
    stubCall({
      listMyRooms: { rooms: [{ _id: 'r1', game: 'CS2' }, { _id: 'r2', game: '英雄联盟' }] },
      getRoom: function (data) {
        if (data.roomId === 'r1') {
          return Promise.reject(new Error('房间已解散'));
        }
        return { room: { _id: 'r2', game: '英雄联盟' }, participants: [], messages: [] };
      }
    });
    const page = createPage();

    page.onShow();
    await flushAll();

    expect(page.data.items.length).toBe(1);
    expect(page.data.items[0].roomId).toBe('r2');
  });

  test('无房间时为空态', async () => {
    stubCall({ listMyRooms: { rooms: [] } });
    const page = createPage();

    page.onShow();
    await flushAll();

    expect(page.data.items).toEqual([]);
    expect(page.data.loading).toBe(false);
  });

  test('onItemTap 携带 roomId 直达房间聊天 Tab', () => {
    const page = createPage();
    page.onItemTap({ currentTarget: { dataset: { roomId: 'r9' } } });
    const { wxState } = require('../../../helpers/miniprogramHarness');
    expect(wxState.navigations[0].url).toBe('/pages/room-detail/index?roomId=r9&tab=chat');
  });
});
