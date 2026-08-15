const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const listMyRooms = require('../../cloudfunctions/listMyRooms');

describe('listMyRooms 云函数', () => {
  beforeEach(() => { cloud.__reset(); cloud.__setOpenid('me'); });

  test('返回所有未解散的我的房间，房主优先且按 updatedAt 倒序', async () => {
    cloud.__seed('rooms', [
      { _id: 'joined-new', game: 'CS2', maxPlayers: 5, status: 'recruiting', hostOpenid: 'other', createdAt: 10, updatedAt: 90 },
      { _id: 'host-old', game: '无畏契约', maxPlayers: 5, status: 'recruiting', hostOpenid: 'me', createdAt: 10, updatedAt: 30 },
      { _id: 'host-new', game: '英雄联盟', maxPlayers: 5, status: 'ready', hostOpenid: 'me', createdAt: 10, updatedAt: 80 },
      { _id: 'dissolved', game: 'APEX', maxPlayers: 3, status: 'dissolved', hostOpenid: 'me', createdAt: 10, updatedAt: 100 }
    ]);
    cloud.__seed('participants', [
      { _id: 'p1', roomId: 'joined-new', openid: 'me' },
      { _id: 'p2', roomId: 'host-old', openid: 'me' },
      { _id: 'p3', roomId: 'host-new', openid: 'me' },
      { _id: 'p4', roomId: 'dissolved', openid: 'me' },
      { _id: 'p5', roomId: 'host-new', openid: 'other' }
    ]);

    const result = await listMyRooms.main();

    expect(result.rooms.map(room => room._id)).toEqual(['host-new', 'host-old', 'joined-new']);
    expect(result.rooms.map(room => room.roleText)).toEqual(['房主', '房主', '已加入']);
    expect(result.rooms[0]).toMatchObject({ status: 'ready', statusText: '全员就绪 · 可以开打', memberCount: 2 });
  });

  test('没有我的房间时返回空数组', async () => {
    const result = await listMyRooms.main();
    expect(result.rooms).toEqual([]);
  });
});
