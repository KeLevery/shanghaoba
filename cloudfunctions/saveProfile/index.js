const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const gameNickname = String(event.gameNickname || '').trim().slice(0, 20);
  if (!gameNickname) throw new Error('游戏昵称不能为空');

  const existing = await db.collection('users').where({ openid }).limit(1).get();
  if (existing.data.length) {
    await db.collection('users').doc(existing.data[0]._id).update({
      data: { gameNickname, updatedAt: Date.now() }
    });
  } else {
    await db.collection('users').add({
      data: { openid, gameNickname, createdAt: Date.now(), updatedAt: Date.now() }
    });
  }

  return { gameNickname };
};