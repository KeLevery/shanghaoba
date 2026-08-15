const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const leaveRoom = require('../../cloudfunctions/leaveRoom');

function seedRoom(status) {
  cloud.__seed('rooms', [{
    _id: 'r1', game: '无畏契约', maxPlayers: 2, hostOpenid: 'host1',
    status: status || 'recruiting', createdAt: 0
  }]);
}
function seedMembers(list) {
  cloud.__seed('participants', list.map((m, i) => ({ _id: `p${i}`, roomId: 'r1', ...m })));
}

describe('leaveRoom 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('普通成员退出，满员房间回退为招募中', async () => {
    cloud.__setOpenid('p1');
    seedRoom('full');
    seedMembers([{ openid: 'host1', isHost: true }, { openid: 'p1' }]);

    await leaveRoom.main({ roomId: 'r1' });
    expect(cloud.__collection('participants')).toHaveLength(1);
    expect(cloud.__collection('rooms')[0].status).toBe('recruiting');
  });

  test('成员退出后仍满员则保持 full', async () => {
    cloud.__setOpenid('p3');
    seedRoom('full');
    seedMembers([{ openid: 'host1' }, { openid: 'p1' }, { openid: 'p2' }]); // maxPlayers=2, 3人满
    await leaveRoom.main({ roomId: 'r1' });
    expect(cloud.__collection('rooms')[0].status).toBe('full');
  });

  test('房主移除普通队员', async () => {
    cloud.__setOpenid('host1');
    seedRoom('recruiting');
    seedMembers([{ openid: 'host1' }, { openid: 'p1' }]);

    await leaveRoom.main({ roomId: 'r1', targetOpenid: 'p1' });
    expect(cloud.__collection('participants').map((p) => p.openid)).toEqual(['host1']);
  });

  test('非房主不能移除别人', async () => {
    cloud.__setOpenid('p1');
    seedRoom('recruiting');
    seedMembers([{ openid: 'host1' }, { openid: 'p1' }, { openid: 'p2' }]);
    await expect(leaveRoom.main({ roomId: 'r1', targetOpenid: 'p2' })).rejects.toThrow('只有房主可以移除队员');
  });

  test('房主不能退出（需解散）', async () => {
    cloud.__setOpenid('host1');
    seedRoom('recruiting');
    seedMembers([{ openid: 'host1' }]);
    await expect(leaveRoom.main({ roomId: 'r1' })).rejects.toThrow('房主不能退出');
  });

  test('房主不能移除自己', async () => {
    cloud.__setOpenid('host1');
    seedRoom('recruiting');
    seedMembers([{ openid: 'host1' }, { openid: 'p1' }]);
    await expect(leaveRoom.main({ roomId: 'r1', targetOpenid: 'host1' })).rejects.toThrow('房主不能退出');
  });

  test('ready 房间成员退出后恢复招募中，保留剩余成员准备状态', async () => {
    cloud.__setOpenid('p1');
    seedRoom('ready');
    seedMembers([{ openid: 'host1', isHost: true, ready: true }, { openid: 'p1', ready: true }]);

    await leaveRoom.main({ roomId: 'r1' });

    expect(cloud.__collection('rooms')[0].status).toBe('recruiting');
    expect(cloud.__collection('participants')[0].ready).toBe(true);
  });

  test('pending 房间成员退出后恢复招募中', async () => {
    cloud.__setOpenid('p1');
    seedRoom('pending');
    seedMembers([{ openid: 'host1', isHost: true, ready: true }, { openid: 'p1', ready: true }]);

    await leaveRoom.main({ roomId: 'r1' });

    expect(cloud.__collection('rooms')[0].status).toBe('recruiting');
  });

  test('房间不存在时抛出友好错误', async () => {
    cloud.__setOpenid('p1');
    await expect(leaveRoom.main({ roomId: 'nope' })).rejects.toThrow('房间不存在或已关闭');
  });
});
