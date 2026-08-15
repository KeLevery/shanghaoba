const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
const createRoom = require('../../../../miniprogram/pages/create-room/index');

describe('create-room 页面（submit 异常处理）', () => {
  beforeEach(reset);

  test('submit 失败时 toast 错误，finally 恢复 submitting', async () => {
    const page = createPage();
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('权限不足'));

    page.data.submitting = false;
    await page.submit();

    expect(wxState.toasts[0].title).toBe('权限不足');
    expect(page.data.submitting).toBe(false);
  });

  test('submitting 期间防重复提交（不重复调用云函数）', async () => {
    const page = createPage();
    wx.cloud.callFunction.mockResolvedValue({ result: { roomId: 'r1' } });

    page.data.submitting = true;
    await page.submit();

    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
    expect(page.data.submitting).toBe(true);
  });
});
