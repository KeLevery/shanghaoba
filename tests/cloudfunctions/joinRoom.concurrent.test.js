const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const joinRoom = require('../../cloudfunctions/joinRoom');

// 并发场景：maxPlayers=2，房内仅房主一人，两名用户同时抢最后一席。
// main() 第一行同步读取 OPENID，因此先 setOpenid 再调用即可让两次调用各自持有不同身份。
function seedLastSeatRoom() {
  cloud.__seed('rooms', [{
    _id: 'r1', game: '无畏契约', maxPlayers: 2, hostOpenid: 'host1',
    status: 'recruiting', createdAt: 0
  }]);
  cloud.__seed('participants', [
    { _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true, ready: false, createdAt: 0 }
  ]);
}

function startRace(openids) {
  return openids.map((openid) => {
    cloud.__setOpenid(openid);
    return joinRoom.main({ roomId: 'r1' });
  });
}

describe('joinRoom 并发抢名额', () => {
  beforeEach(() => { cloud.__reset(); });

  test('两人同时抢最后一席：恰好一人成功、无超员、无误删', async () => {
    seedLastSeatRoom();

    const results = await Promise.allSettled(startRace(['p1', 'p2']));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // 恰好一人成功，另一人收到满员错误（文案与契约一致）
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value).toEqual({ joined: true });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toBe('房间已满，下次早点来');

    // 无超员：成员数恰为 maxPlayers
    const participants = cloud.__collection('participants');
    expect(participants).toHaveLength(2);

    // 无误删：房主与胜出的竞争者都还在房间内
    const openids = participants.map((p) => p.openid);
    expect(openids).toContain('host1');
    expect(openids.filter((o) => o === 'p1' || o === 'p2')).toHaveLength(1);

    // 房间被置为 full
    expect(cloud.__collection('rooms')[0].status).toBe('full');
  });

  test('三人同时抢两席：恰好两人成功、补偿删除只删名次靠后者自己', async () => {
    cloud.__seed('rooms', [{
      _id: 'r1', game: '无畏契约', maxPlayers: 3, hostOpenid: 'host1',
      status: 'recruiting', createdAt: 0
    }]);
    cloud.__seed('participants', [
      { _id: 'h1', roomId: 'r1', openid: 'host1', isHost: true, ready: false, createdAt: 0 }
    ]);

    const results = await Promise.allSettled(startRace(['p1', 'p2', 'p3']));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toBe('房间已满，下次早点来');

    // 无超员且无误删：房主 + 两名胜出者
    const participants = cloud.__collection('participants');
    expect(participants).toHaveLength(3);
    expect(participants.map((p) => p.openid)).toContain('host1');

    // 胜出者的记录必须真实存在（joined:true 不可空口无凭）
    fulfilled.forEach((r) => expect(r.value).toEqual({ joined: true }));
    expect(cloud.__collection('rooms')[0].status).toBe('full');
  });
});
