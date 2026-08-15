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
  if (roomDoc.status === STATUS.DISSOLVED) throw new Error('房间已解散');
  if (roomDoc.status === STATUS.READY) throw new Error('队友已全部准备，可以开打了');
  if (roomDoc.hostOpenid === openid) throw new Error('你是房主，无需重复加入');

  const existing = await db.collection('participants').where({ roomId, openid }).count();
  if (existing.total > 0) return { joined: false, message: '已在房间内' };

  const before = await db.collection('participants').where({ roomId }).count();
  if (before.total >= roomDoc.maxPlayers) {
    // 满员：同步房间状态为 full（防止脏状态），再拒绝
    await db.collection('rooms').doc(roomId).update({ data: { status: STATUS.FULL, updatedAt: Date.now() } });
    throw new Error('房间已满，下次早点来');
  }

  // 先写入参与者；并发下可能与另一请求竞争同一名额，靠下面的二次校验 + 补偿删除兜底，
  // 避免出现成员数超过 maxPlayers 的超员状态。
  const now = Date.now();
  const added = await db.collection('participants').add({
    data: { roomId, openid, isHost: false, ready: false, createdAt: now }
  });

  const after = await db.collection('participants').where({ roomId }).count();
  if (after.total > roomDoc.maxPlayers) {
    // 并发超员：补偿删除刚加入的参与者，避免成员超过上限
    await db.collection('participants').doc(added._id).remove();
    await db.collection('rooms').doc(roomId).update({ data: { status: STATUS.FULL, updatedAt: now } });
    throw new Error('房间已满，下次早点来');
  }

  const full = after.total >= roomDoc.maxPlayers;
  await db.collection('rooms').doc(roomId).update({
    data: { status: full ? STATUS.FULL : STATUS.RECRUITING, updatedAt: now }
  });

  return { joined: true };
};