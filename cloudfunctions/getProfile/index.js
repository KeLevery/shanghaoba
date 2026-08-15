const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;

  let gameNickname = '';
  try {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    if (res.data.length) gameNickname = res.data[0].gameNickname || '';
  } catch (error) {
    // 首次查询 users 集合可能不存在，忽略并返回空
  }

  return { gameNickname };
};