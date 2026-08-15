const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
const profile = require('../../../../miniprogram/pages/profile/index');

describe('profile 页面（save 空昵称）', () => {
  beforeEach(reset);

  test('save 空昵称直接 toast，不执行云函数', () => {
    const page = createPage();
    page.data.gameNickname = '   ';
    page.save();

    expect(wxState.toasts[0].title).toBe('请填写游戏昵称');
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });
});
