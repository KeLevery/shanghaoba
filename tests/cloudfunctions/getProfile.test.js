const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const getProfile = require('../../cloudfunctions/getProfile');

describe('getProfile 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('返回已有昵称', async () => {
    cloud.__setOpenid('u1');
    cloud.__seed('users', [{ _id: 'u1', openid: 'u1', gameNickname: '老王' }]);
    const res = await getProfile.main({});
    expect(res.gameNickname).toBe('老王');
  });

  test('无记录时返回空串（不抛错）', async () => {
    cloud.__setOpenid('nobody');
    const res = await getProfile.main({});
    expect(res.gameNickname).toBe('');
  });
});
