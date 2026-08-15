const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
const index = require('../../../../miniprogram/pages/index/index');

describe('index 页面', () => {
  beforeEach(reset);

  test('onShow 调用 loadRooms 并渲染房间', async () => {
    const page = createPage();
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { rooms: [{ _id: 'r1', game: '无畏契约' }] } });

    page.onShow();

    // onShow 不 await loadRooms，需等一个宏任务让异步链跑完
    await new Promise((resolve) => setImmediate(resolve));

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expect.objectContaining({ name: 'listRooms' }));
    expect(page.data.rooms).toEqual([{ _id: 'r1', game: '无畏契约' }]);
  });

  test('loadRooms 失败时 toast 错误', async () => {
    const page = createPage();
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('网络异常'));

    await page.loadRooms();

    expect(wxState.toasts[0].title).toBe('加载失败，请检查云环境');
  });

  test('refresh 触发加载', () => {
    const page = createPage();
    page.refresh();
    expect(wx.cloud.callFunction).toHaveBeenCalled();
  });

  test('goCreate 跳转创建页面', () => {
    const page = createPage();
    page.goCreate();
    expect(wxState.navigations[0].url).toBe('/pages/create-room/index');
  });

  test('goProfile 跳转个人页', () => {
    const page = createPage();
    page.goProfile();
    expect(wxState.navigations[0].url).toBe('/pages/profile/index');
  });

  test('openRoom 拼接房间详情 URL', () => {
    const page = createPage();
    page.openRoom({ currentTarget: { dataset: { id: 'r123' } } });
    expect(wxState.navigations[0].url).toBe('/pages/room-detail/index?roomId=r123');
  });
});
