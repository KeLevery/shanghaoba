const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const createRoom = require('../../cloudfunctions/createRoom');

describe('createRoom 云函数（模式输入 / 备注 / 时间选择）', () => {
  beforeEach(() => { cloud.__reset(); cloud.__setOpenid('creator-1'); });

  test('mode 超长被截断到 30 个字符', async () => {
    const res = await createRoom.main({
      game: '无畏契约', mode: '排位赛'.repeat(10), maxPlayers: 5, remark: '', startTimeLabel: '今晚'
    });
    expect(cloud.__collection('rooms')[0].mode).toHaveLength(30);
  });

  test('remark 超长被截断到 100 个字符', async () => {
    const res = await createRoom.main({
      game: '无畏契约', mode: '', maxPlayers: 5, remark: 'x'.repeat(200), startTimeLabel: '今晚'
    });
    expect(cloud.__collection('rooms')[0].remark).toHaveLength(100);
  });

  test('startTimeLabel 支持 1-20 字自定义文本（trim 后入库）', async () => {
    await createRoom.main({
      game: '无畏契约', mode: '排位', maxPlayers: 5, remark: '', startTimeLabel: ' 周六晚上八点 '
    });
    expect(cloud.__collection('rooms')[0].startTimeLabel).toBe('周六晚上八点');
  });

  test('startTimeLabel 为空或超过 20 字被拒绝', async () => {
    await expect(createRoom.main({
      game: '无畏契约', mode: '排位', maxPlayers: 5, remark: '', startTimeLabel: '   '
    })).rejects.toThrow('开打时间无效');
    await expect(createRoom.main({
      game: '无畏契约', mode: '排位', maxPlayers: 5, remark: '', startTimeLabel: '时'.repeat(21)
    })).rejects.toThrow('开打时间无效');
  });

  test('startTimeLabel 裸「自定义时间」占位符被拒绝，要求填具体时间', async () => {
    await expect(createRoom.main({
      game: '无畏契约', mode: '排位', maxPlayers: 5, remark: '', startTimeLabel: '自定义时间'
    })).rejects.toThrow('请填写具体的开打时间');
  });
});
