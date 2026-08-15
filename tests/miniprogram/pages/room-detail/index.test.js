const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
const roomDetail = require('../../../../miniprogram/pages/room-detail/index');

describe('room-detail 页面', () => {
  beforeEach(reset);

  test('leaveRoom 退出确认弹窗', () => {
    const page = createPage();
    page.data.roomId = 'r1';

    page.leaveRoom();

    expect(wxState.modals[0].title).toBe('退出房间');
    expect(wxState.modals[0].success).toBeDefined();
  });

  test('toggleReady 成功后保存准备状态，不触发通知相关提示（通知发生在开始阶段）', async () => {
    const page = createPage();
    page.data.roomId = 'r1';
    wx.cloud.callFunction = jest.fn()
      .mockResolvedValueOnce({ result: { ready: true, allReady: false, status: 'recruiting' } })
      .mockResolvedValueOnce({ result: { room: { status: 'recruiting' }, participants: [], messages: [], isHost: false, myReady: true } });

    await page.toggleReady();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'toggleReady', data: { roomId: 'r1' } });
    expect(page.data.myReady).toBe(true);
    expect(wxState.toasts).toEqual([]);
  });

  test('startRoom 且订阅未配置时提示降级', async () => {
    const page = createPage();
    page.data.roomId = 'r1';
    wx.cloud.callFunction = jest.fn()
      .mockResolvedValueOnce({ result: { status: 'ready', notification: { status: 'not_configured', failed: 0 } } })
      .mockResolvedValueOnce({ result: { room: { status: 'ready' }, participants: [], messages: [], isHost: true, myReady: true } });

    await page.startRoom();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'startRoom', data: { roomId: 'r1' } });
    expect(wxState.toasts).toContainEqual({ title: '已开始，开打提醒尚未配置', icon: 'none' });
  });
});