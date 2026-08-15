const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const startRoom = require('../../cloudfunctions/startRoom');

function seedReadyScenario(status) {
  cloud.__seed('rooms', [{
    _id: 'r1', game: '无畏契约', startTimeLabel: '今晚', hostOpenid: 'host1',
    maxPlayers: 5, status
  }]);
  cloud.__seed('participants', [
    { _id: 'h1', roomId: 'r1', openid: 'host1', ready: true, isHost: true },
    { _id: 'p1', roomId: 'r1', openid: 'p1', ready: true }
  ]);
}

describe('startRoom 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('房主从 pending 正式开始，进入 ready 并尝试发送通知', async () => {
    cloud.__setOpenid('host1');
    seedReadyScenario('pending');

    const result = await startRoom.main({ roomId: 'r1' });

    expect(result.status).toBe('ready');
    expect(result.notification.status).toBe('not_configured');
    expect(cloud.__collection('rooms')[0].status).toBe('ready');
    expect(cloud.__collection('rooms')[0].readyNotificationStatus).toBe('not_configured');
  });

  test('非房主不能开始', async () => {
    cloud.__setOpenid('p1');
    seedReadyScenario('pending');
    await expect(startRoom.main({ roomId: 'r1' })).rejects.toThrow('只有房主可以开始');
  });

  test('非 pending 状态不能开始', async () => {
    cloud.__setOpenid('host1');
    seedReadyScenario('recruiting');
    await expect(startRoom.main({ roomId: 'r1' })).rejects.toThrow('全员准备后才能开始');
  });

  test('已 ready 的房间再次开始会被拒绝', async () => {
    cloud.__setOpenid('host1');
    seedReadyScenario('ready');
    await expect(startRoom.main({ roomId: 'r1' })).rejects.toThrow('全员准备后才能开始');
  });

  test('已解散的房间不能开始', async () => {
    cloud.__setOpenid('host1');
    seedReadyScenario('dissolved');
    await expect(startRoom.main({ roomId: 'r1' })).rejects.toThrow('房间已解散');
  });
});
