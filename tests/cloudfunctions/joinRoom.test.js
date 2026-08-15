const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const joinRoom = require('../../cloudfunctions/joinRoom');

describe('joinRoom 云函数（after join 自动置满）', () => {
  beforeEach(() => { cloud.__reset(); });

  test('加入后正好满人时置 full', async () => {
    cloud.__setOpenid('p1');
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 2, hostOpenid: 'host1', status: 'recruiting' }]);
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true }]);

    await joinRoom.main({ roomId: 'r1' });
    expect(cloud.__collection('rooms')[0].status).toBe('full');
  });

  test('ready 状态的房间拒绝新成员加入', async () => {
    cloud.__setOpenid('p1');
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1', status: 'ready' }]);
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true, ready: true }]);

    await expect(joinRoom.main({ roomId: 'r1' })).rejects.toThrow('队友已全部准备，可以开打了');
  });

  test('pending 状态的房间允许新成员加入', async () => {
    cloud.__setOpenid('p1');
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1', status: 'pending' }]);
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true, ready: true }]);

    const result = await joinRoom.main({ roomId: 'r1' });
    expect(result.joined).toBe(true);
    expect(cloud.__collection('participants').map(p => p.openid)).toContain('p1');
  });
});
