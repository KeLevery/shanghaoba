// create-room 发起上号页：游戏默认人数、人数步进边界、表单校验拦截、提交跳转
const { reset, createPage, wxState } = require('../../../helpers/miniprogramHarness');
require('../../../../miniprogram/pages/create-room/index');

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

describe('create-room 页面（发起上号）', () => {
  beforeEach(reset);

  test('初始状态：默认选中无畏契约，人数带入默认值 5', () => {
    const page = createPage();
    expect(page.data.gameIndex).toBe(0);
    expect(page.data.maxPlayers).toBe(5);
    expect(page.data.submitting).toBe(false);
  });

  test('onGameTap 切换游戏时带入该游戏默认人数', () => {
    const page = createPage();
    // 永劫无间（index 4）默认 3 人
    page.onGameTap({ currentTarget: { dataset: { index: 4 } } });
    expect(page.data.gameIndex).toBe(4);
    expect(page.data.maxPlayers).toBe(3);
    // 三角洲行动（index 1）默认 4 人
    page.onGameTap({ currentTarget: { dataset: { index: 1 } } });
    expect(page.data.maxPlayers).toBe(4);
  });

  test('人数步进边界：2 不再减、20 不再加', () => {
    const page = createPage();
    page.setData({ maxPlayers: 2 });
    page.decrease();
    expect(page.data.maxPlayers).toBe(2);

    page.setData({ maxPlayers: 20 });
    page.increase();
    expect(page.data.maxPlayers).toBe(20);

    page.setData({ maxPlayers: 5 });
    page.increase();
    expect(page.data.maxPlayers).toBe(6);
    page.decrease();
    page.decrease();
    expect(page.data.maxPlayers).toBe(4);
  });

  test('validate 拦截空模式并提示', () => {
    const page = createPage();
    // V2 单页表单默认预填预设「排位」，这里显式清空模拟自定义未填
    page.setData({ mode: '' });
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '请填写模式/地图', icon: 'none' });
  });

  test('validate 拦截超长模式（>30 字）', () => {
    const page = createPage();
    page.setData({ mode: '模'.repeat(31) });
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '模式最多 30 字', icon: 'none' });
  });

  test('validate 拦截越界人数', () => {
    const page = createPage();
    page.setData({ mode: '排位', maxPlayers: 1 });
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '人数需在 2-20 之间', icon: 'none' });
  });

  test('validate 拦截超长备注（>100 字）', () => {
    const page = createPage();
    page.setData({ mode: '排位', remark: '备'.repeat(101) });
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '备注最多 100 字', icon: 'none' });
  });

  test('自定义时间：选中后未填写被拦截并提示', () => {
    const page = createPage();
    page.onTimeTap({ currentTarget: { dataset: { index: 3 } } });
    expect(page.data.timeIndex).toBe(3);
    expect(page.data.timeLabel).toBe('自定义…');
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '请填写开打时间', icon: 'none' });
  });

  test('自定义时间：填写后作为 startTimeLabel 参与提交', () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({ result: { roomId: 'r9' } });
    const page = createPage();
    page.onTimeTap({ currentTarget: { dataset: { index: 3 } } });
    page.onCustomTimeInput({ detail: { value: '周六 20:30' } });
    expect(page.data.timeLabel).toBe('周六 20:30');
    const payload = page.validate();
    expect(payload.startTimeLabel).toBe('周六 20:30');
  });

  test('自定义时间：超过 20 字被拦截（绕过 maxlength 的防御校验）', () => {
    const page = createPage();
    page.onTimeTap({ currentTarget: { dataset: { index: 3 } } });
    page.onCustomTimeInput({ detail: { value: '时'.repeat(21) } });
    expect(page.validate()).toBeNull();
    expect(wxState.toasts).toContainEqual({ title: '时间最多 20 字', icon: 'none' });
  });

  test('submit 成功：payload trim 后透传契约字段，toast 后 500ms 跳转房间详情', async () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({ result: { roomId: 'r9' } });
    const page = createPage();
    page.setData({ mode: '  排位  ', remark: ' 来稳的 ' });

    jest.useFakeTimers();
    try {
      await page.submit();

      expect(wx.cloud.callFunction).toHaveBeenCalledWith({
        name: 'createRoom',
        data: {
          game: '无畏契约',
          mode: '排位',
          maxPlayers: 5,
          remark: '来稳的',
          startTimeLabel: '现在开打'
        }
      });
      expect(wxState.toasts).toContainEqual({ title: '召集已发起', icon: 'success' });
      // 跳转有 500ms 延迟，未到时不发生
      expect(wxState.navigations).toEqual([]);
      jest.advanceTimersByTime(500);
      expect(wxState.navigations[0].url).toBe('/pages/room-detail/index?roomId=r9');
      expect(page.data.submitting).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('submit 校验失败时不发起云调用', async () => {
    const page = createPage();
    page.setData({ mode: '' }); // 模式为空（自定义未填）
    await page.submit();
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
    expect(page.data.submitting).toBe(false);
  });

  test('submit 失败：错误 toast 由 cloud.js 统一处理，submitting 恢复', async () => {
    wx.cloud.callFunction = jest.fn().mockRejectedValue(new Error('权限不足'));
    const page = createPage();
    page.setData({ mode: '排位' });

    await page.submit();
    await flush();

    expect(wxState.toasts).toContainEqual({ title: '权限不足', icon: 'none' });
    expect(page.data.submitting).toBe(false);
  });

  test('submitting 期间防重复提交', async () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({ result: { roomId: 'r9' } });
    const page = createPage();
    page.setData({ mode: '排位', submitting: true });

    await page.submit();

    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });
});
