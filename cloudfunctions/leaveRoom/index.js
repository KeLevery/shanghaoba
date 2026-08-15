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

  const targetOpenid = event.targetOpenid || openid;
  const isSelf = targetOpenid === openid;

  if (!isSelf && roomDoc.hostOpenid !== openid) throw new Error('只有房主可以移除队员');
  if (targetOpenid === roomDoc.hostOpenid) throw new Error('房主不能退出，如需结束请解散房间');

  const existing = await db.collection('participants').where({ roomId, openid: targetOpenid }).limit(1).get();
  if (existing.data.length) {
    await db.collection('participants').doc(existing.data[0]._id).remove();
  }

  const now = Date.now();
  if (roomDoc.status === STATUS.FULL || roomDoc.status === STATUS.PENDING || roomDoc.status === STATUS.READY) {
    const current = await db.collection('participants').where({ roomId }).count();
    if (roomDoc.status === STATUS.READY || current.total < roomDoc.maxPlayers) {
      await db.collection('rooms').doc(roomId).update({
        data: { status: STATUS.RECRUITING, updatedAt: now, allReadyAt: null, readyNotificationStatus: null }
      });
    }
  } else {
    await db.collection('rooms').doc(roomId).update({ data: { updatedAt: now } });
  }

  return { left: true };
};