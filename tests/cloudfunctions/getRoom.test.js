const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const getRoom = require('../../cloudfunctions/getRoom');

describe('getRoom 云函数（messages 昵称映射）', () => {
  beforeEach(() => { cloud.__reset(); });

  test('消息作者昵称映射正确（users + openid 去重）', async () => {
    cloud.__setOpenid('viewer');
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1', status: 'recruiting' }]);
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true, ready: false, createdAt: 1 }]);
    cloud.__seed('users', [{ _id: 'u1', openid: 'host1', gameNickname: '阿伟' }, { _id: 'u2', openid: 'viewer', gameNickname: '你' }]);
    cloud.__seed('messages', [
      { _id: 'm1', roomId: 'r1', openid: 'host1', content: '来来来', createdAt: 2 },
      { _id: 'm2', roomId: 'r1', openid: 'viewer', content: '我来', createdAt: 3 }
    ]);

    const res = await getRoom.main({ roomId: 'r1' });
    expect(res.messages[0].displayName).toBe('阿伟');
    expect(res.messages[1].displayName).toBe('你');
  });
});
