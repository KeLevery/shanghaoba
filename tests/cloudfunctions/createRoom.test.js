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
});
