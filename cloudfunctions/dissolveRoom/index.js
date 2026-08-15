const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const roomId = event.roomId;
  if (!roomId) throw new Error('缺少房间 ID');

  let roomDoc;
  try {
    const res = await db.collection('rooms').doc(roomId).get();
    roomDoc = res.data;
  } catch (error) {
    throw new Error('房间不存在或已关闭');
  }

  if (roomDoc.hostOpenid !== openid) throw new Error('只有房主可以解散房间');

  // 软删除：标记解散，前端实时监听会收到状态变化后跳走
  const now = Date.now();
  await db.collection('rooms').doc(roomId).update({
    data: { status: STATUS.DISSOLVED, dissolvedAt: now, updatedAt: now }
  });

  return { dissolved: true };
};