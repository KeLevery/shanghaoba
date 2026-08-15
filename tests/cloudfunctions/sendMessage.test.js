const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const sendMessage = require('../../cloudfunctions/sendMessage');

function seedRoom(status) {
  cloud.__seed('rooms', [{
    _id: 'r1', game: '无畏契约', maxPlayers: 5, hostOpenid: 'host1',
    status: status || 'recruiting', createdAt: 0
  }]);
}

describe('sendMessage 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('成员发送消息成功（trim）', async () => {
    cloud.__setOpenid('p1');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1' }, { _id: 'p1x', roomId: 'r1', openid: 'p1' }]);

    const res = await sendMessage.main({ roomId: 'r1', content: ' 来了来了 ' });
    expect(res.messageId).toBeTruthy();
    expect(cloud.__collection('messages')[0]).toMatchObject({
      roomId: 'r1', openid: 'p1', content: '来了来了'
    });
  });

  test('非成员被拒绝', async () => {
    cloud.__setOpenid('stranger');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'h1', roomId: 'r1', openid: 'host1' }]);
    await expect(sendMessage.main({ roomId: 'r1', content: 'hi' })).rejects.toThrow('你不在这个房间里');
  });

  test('空消息被拒绝', async () => {
    cloud.__setOpenid('p1');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'p1x', roomId: 'r1', openid: 'p1' }]);
    await expect(sendMessage.main({ roomId: 'r1', content: '   ' })).rejects.toThrow('消息不能为空');
  });

  test('已解散房间不可发消息', async () => {
    cloud.__setOpenid('p1');
    seedRoom('dissolved');
    cloud.__seed('participants', [{ _id: 'p1x', roomId: 'r1', openid: 'p1' }]);
    await expect(sendMessage.main({ roomId: 'r1', content: 'hi' })).rejects.toThrow('房间已解散');
  });

  test('消息超长被截断到 200', async () => {
    cloud.__setOpenid('p1');
    seedRoom();
    cloud.__seed('participants', [{ _id: 'p1x', roomId: 'r1', openid: 'p1' }]);
    await sendMessage.main({ roomId: 'r1', content: 'x'.repeat(500) });
    expect(cloud.__collection('messages')[0].content).toHaveLength(200);
  });
});
