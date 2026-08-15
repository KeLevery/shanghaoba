const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const toggleReady = require('../../cloudfunctions/toggleReady');

function seedRoom(status, maxPlayers) {
  cloud.__seed('rooms', [{
    _id: 'r1', game: '无畏契约', startTimeLabel: '今晚', hostOpenid: 'host1',
    maxPlayers: maxPlayers || 2, status: status || 'recruiting'
  }]);
}

describe('toggleReady 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('非成员被拒绝', async () => {
    cloud.__setOpenid('stranger');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', ready: false }]);
    await expect(toggleReady.main({ roomId: 'r1' })).rejects.toThrow('你不在这个房间里');
  });

  test('切换准备状态（false→true→false）', async () => {
    cloud.__setOpenid('p1');
    seedRoom('recruiting', 3);
    cloud.__seed('participants', [{ _id: 'p1x', roomId: 'r1', openid: 'p1', ready: false }]);

    const r1 = await toggleReady.main({ roomId: 'r1' });
    expect(r1.ready).toBe(true);
    expect(cloud.__collection('participants')[0].ready).toBe(true);

    const r2 = await toggleReady.main({ roomId: 'r1' });
    expect(r2.ready).toBe(false);
    expect(cloud.__collection('participants')[0].ready).toBe(false);
  });

  test('至少两人全部准备时进入 pending（待房主开始），不发送通知', async () => {
    cloud.__setOpenid('p1');
    seedRoom();
    cloud.__seed('participants', [
      { _id: 'h1', roomId: 'r1', openid: 'host1', ready: true },
      { _id: 'p1', roomId: 'r1', openid: 'p1', ready: false }
    ]);

    const result = await toggleReady.main({ roomId: 'r1' });

    expect(result).toMatchObject({ ready: true, allReady: true, status: 'pending' });
    expect(cloud.__collection('rooms')[0].status).toBe('pending');
  });

  test('只有一名成员准备时不进入 pending', async () => {
    cloud.__setOpenid('host1');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1', ready: false }]);

    const result = await toggleReady.main({ roomId: 'r1' });

    expect(result).toMatchObject({ ready: true, allReady: false, status: 'recruiting' });
  });

  test('pending 房间取消准备后回退为 recruiting', async () => {
    cloud.__setOpenid('p1');
    seedRoom('pending', 3);
    cloud.__seed('participants', [
      { _id: 'h1', roomId: 'r1', openid: 'host1', ready: true },
      { _id: 'p1', roomId: 'r1', openid: 'p1', ready: true }
    ]);

    const result = await toggleReady.main({ roomId: 'r1' });

    expect(result).toMatchObject({ ready: false, allReady: false, status: 'recruiting' });
    expect(cloud.__collection('rooms')[0].status).toBe('recruiting');
  });

  test('ready 房间中取消准备后回退为 recruiting（与锁定只由开始触发的语义一致）', async () => {
    cloud.__setOpenid('p1');
    seedRoom('ready', 3);
    cloud.__seed('participants', [
      { _id: 'h1', roomId: 'r1', openid: 'host1', ready: true },
      { _id: 'p1', roomId: 'r1', openid: 'p1', ready: true }
    ]);

    const result = await toggleReady.main({ roomId: 'r1' });

    expect(result.ready).toBe(false);
    expect(cloud.__collection('rooms')[0].status).toBe('recruiting');
  });
});
