// profile 我的资料页：getProfile 回填、昵称校验拦截、saveProfile 成功链路
const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
require('../../../../miniprogram/pages/profile/index');

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

function flushAll() {
  return flush().then(flush).then(flush);
}

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

describe('profile 页面（我的资料）', () => {
  beforeEach(reset);

  test('onLoad 调 getProfile 并回填昵称、字数与首字头像', async () => {
    stubCall({ getProfile: { gameNickname: '夜雨声烦' } });
    const page = createPage();

    page.onLoad();
    await flushAll();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({ name: 'getProfile', data: {} });
    expect(page.data.gameNickname).toBe('夜雨声烦');
    expect(page.data.charCount).toBe(4);
    expect(page.data.avatarChar).toBe('夜');
  });

  test('onLoad 首次无记录：回填空串', async () => {
    stubCall({ getProfile: { gameNickname: '' } });
    const page = createPage();

    page.onLoad();
    await flushAll();

    expect(page.data.gameNickname).toBe('');
    expect(page.data.charCount).toBe(0);
    expect(page.data.avatarChar).toBe('');
  });

  test('onNicknameInput 同步派生数据，首字忽略前导空白', () => {
    const page = createPage();
    page.onNicknameInput({ detail: { value: '  小明abc' } });
    expect(page.data.gameNickname).toBe('  小明abc');
    expect(page.data.charCount).toBe(7);
    expect(page.data.avatarChar).toBe('小');
  });

  test('onSave 空昵称拦截，不发云调用', async () => {
    const page = createPage();
    page.setData({ gameNickname: '   ' });

    page.onSave();
    await flushAll();

    expect(wxState.toasts).toContainEqual({ title: '请填写游戏昵称', icon: 'none' });
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
    expect(page.data.saving).toBe(false);
  });

  test('onSave 超过 20 字拦截，不发云调用', async () => {
    const page = createPage();
    page.setData({ gameNickname: '字'.repeat(21) });

    page.onSave();
    await flushAll();

    expect(wxState.toasts).toContainEqual({ title: '昵称最多 20 个字', icon: 'none' });
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });

  test('onSave 成功：trim 后提交 saveProfile，同步 trim 值并 toast 已保存', async () => {
    stubCall({ saveProfile: { gameNickname: '夜雨声烦' } });
    const page = createPage();
    page.setData({ gameNickname: '  夜雨声烦  ' });

    page.onSave();
    expect(page.data.saving).toBe(true);
    await flushAll();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'saveProfile',
      data: { gameNickname: '夜雨声烦' }
    });
    expect(wxState.toasts).toContainEqual({ title: '已保存', icon: 'success' });
    expect(page.data.gameNickname).toBe('夜雨声烦');
    expect(page.data.charCount).toBe(4);
    expect(page.data.saving).toBe(false);
  });

  test('onSave 失败：错误 toast 由 cloud.js 统一处理，saving 恢复', async () => {
    stubCall({
      saveProfile: function () { return Promise.reject(new Error('保存失败')); }
    });
    const page = createPage();
    page.setData({ gameNickname: '夜雨声烦' });

    page.onSave();
    await flushAll();

    expect(wxState.toasts).toContainEqual({ title: '保存失败', icon: 'none' });
    expect(page.data.saving).toBe(false);
  });

  test('saving 期间防重复提交', async () => {
    stubCall({ saveProfile: { gameNickname: '夜雨声烦' } });
    const page = createPage();
    page.setData({ gameNickname: '夜雨声烦', saving: true });

    page.onSave();
    await flushAll();

    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });
});
