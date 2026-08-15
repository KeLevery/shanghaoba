const cloud = require('../helpers/wxServerSdkMock');
jest.mock('wx-server-sdk', () => require('../helpers/wxServerSdkMock'), { virtual: true });
const saveProfile = require('../../cloudfunctions/saveProfile');

describe('saveProfile 云函数', () => {
  beforeEach(() => { cloud.__reset(); });

  test('新用户保存时创建记录（trim）', async () => {
    cloud.__setOpenid('u1');
    const res = await saveProfile.main({ gameNickname: ' 阿伟 ' });
    expect(res.gameNickname).toBe('阿伟');
    expect(cloud.__collection('users')).toHaveLength(1);
    expect(cloud.__collection('users')[0]).toMatchObject({ openid: 'u1', gameNickname: '阿伟' });
  });

  test('已有用户时更新而非重复创建', async () => {
    cloud.__setOpenid('u1');
    cloud.__seed('users', [{ _id: 'u1', openid: 'u1', gameNickname: '旧名' }]);
    await saveProfile.main({ gameNickname: '新名' });
    expect(cloud.__collection('users')).toHaveLength(1);
    expect(cloud.__collection('users')[0].gameNickname).toBe('新名');
    expect(cloud.__collection('users')[0].updatedAt).toBeTruthy();
  });

  test('空昵称被拒绝', async () => {
    cloud.__setOpenid('u1');
    await expect(saveProfile.main({ gameNickname: '   ' })).rejects.toThrow('游戏昵称不能为空');
  });

  test('昵称超长截断到 20', async () => {
    cloud.__setOpenid('u1');
    await saveProfile.main({ gameNickname: '名'.repeat(50) });
    expect(cloud.__collection('users')[0].gameNickname).toHaveLength(20);
  });
});
