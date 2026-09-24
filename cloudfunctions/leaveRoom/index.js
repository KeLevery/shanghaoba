const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { STATUS } = require('./_shared/constants');

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
  if (roomDoc.status === STATUS.DISSOLVED) throw new Error('房间已解散');

  const targetOpenid = event.targetOpenid || openid;
  const isSelf = targetOpenid === openid;

  if (!isSelf && roomDoc.hostOpenid !== openid) throw new Error('只有房主可以移除队员');
  if (targetOpenid === roomDoc.hostOpenid) throw new Error('房主不能退出，如需结束请解散房间');

  const existing = await db.collection('participants').where({ roomId, openid: targetOpenid }).limit(1).get();
  if (existing.data.length) {
    await db.collection('participants').doc(existing.data[0]._id).remove();
  }

  const now = Date.now();
  // 状态回退：full/pending/ready 房间退出后不再满员（或本为 ready）时回落 recruiting；
  // 无论是否回退，退出本身都算活跃行为，统一刷新 updatedAt/lastActiveAt。
  let statusPatch = null;
  if (roomDoc.status === STATUS.FULL || roomDoc.status === STATUS.PENDING || roomDoc.status === STATUS.READY) {
    const current = await db.collection('participants').where({ roomId }).count();
    if (roomDoc.status === STATUS.READY || current.total < roomDoc.maxPlayers) {
      statusPatch = { status: STATUS.RECRUITING, allReadyAt: null, readyNotificationStatus: null };
    }
  }
  await db.collection('rooms').doc(roomId).update({
    data: Object.assign({ updatedAt: now, lastActiveAt: now }, statusPatch)
  });

  return { left: true };
};