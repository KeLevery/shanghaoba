const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const dissolveRoom = require('../../cloudfunctions/dissolveRoom');

describe('dissolveRoom 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('非房主不能解散', async () => {
    cloud.__setOpenid('p1');
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1', status: 'recruiting' }]);
    await expect(dissolveRoom.main({ roomId: 'r1' })).rejects.toThrow('只有房主可以解散房间');
  });

  test('房主解散：软删除标记 dissolved', async () => {
    cloud.__setOpenid('host1');
    const now = Date.now();
    cloud.__seed('rooms', [{ _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1', status: 'recruiting', createdAt: now }]);

    await dissolveRoom.main({ roomId: 'r1' });
    const room = cloud.__collection('rooms')[0];
    expect(room.status).toBe('dissolved');
    expect(room.dissolvedAt).toBeGreaterThanOrEqual(now);
  });
});
