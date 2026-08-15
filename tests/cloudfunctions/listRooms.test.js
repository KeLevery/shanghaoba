const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const listRooms = require('../../cloudfunctions/listRooms');

describe('listRooms 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('只返回「招募中且未过期」的房间，并统计成员数', async () => {
    const now = Date.now();
    cloud.__seed('rooms', [
      { _id: 'r1', game: '无畏契约', mode: '', maxPlayers: 5, hostOpenid: 'h', status: 'recruiting', createdAt: now - 100, expireAt: now + 100000 },
      { _id: 'r2', game: 'CS2', mode: '', maxPlayers: 5, hostOpenid: 'h', status: 'recruiting', createdAt: now - 50, expireAt: now - 1 }, // 已过期
      { _id: 'r3', game: 'CS2', mode: '', maxPlayers: 5, hostOpenid: 'h', status: 'full', createdAt: now, expireAt: now + 100000 },
      { _id: 'r4', game: 'CS2', mode: '', maxPlayers: 5, hostOpenid: 'h', status: 'dissolved', createdAt: now, expireAt: now + 100000 }
    ]);
    cloud.__seed('participants', [
      { roomId: 'r1', openid: 'a' }, { roomId: 'r1', openid: 'b' },
      { roomId: 'r2', openid: 'a' }, { roomId: 'r3', openid: 'a' }
    ]);

    const res = await listRooms.main();
    expect(res.rooms.map((r) => r._id)).toEqual(['r1']);
    expect(res.rooms[0]).toMatchObject({ status: 'recruiting', statusText: '招募中' });
    expect(res.rooms[0].memberCount).toBe(2);
  });

  test('无房间时返回空数组', async () => {
    const res = await listRooms.main();
    expect(res.rooms).toEqual([]);
  });

  test('全部过期 / 非招募中时返回空数组', async () => {
    const now = Date.now();
    cloud.__seed('rooms', [
      { _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'h', status: 'recruiting', createdAt: now, expireAt: now - 10 },
      { _id: 'r2', game: 'CS2', maxPlayers: 5, hostOpenid: 'h', status: 'full', createdAt: now, expireAt: now + 100000 }
    ]);
    const res = await listRooms.main();
    expect(res.rooms).toEqual([]);
  });
});
