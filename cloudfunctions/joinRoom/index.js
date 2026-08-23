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

  // 先写入参与者；并发下可能与另一请求竞争同一名额，靠下面的二次校验 + 确定性补偿删除兜底，
  // 避免出现成员数超过 maxPlayers 的超员状态。
  const now = Date.now();
  const added = await db.collection('participants').add({
    data: { roomId, openid, isHost: false, ready: false, createdAt: now }
  });

  let full;
  const after = await db.collection('participants').where({ roomId }).count();
  if (after.total > roomDoc.maxPlayers) {
    // 并发超员：删除前再次拉取有序名单确认仍超员。名额按加入先后（createdAt 升序）分配，
    // 仅当自己那条记录排在名额之外时，才按 _id 补偿删除自己刚写入的记录；
    // 名次在名额之内则加入有效，由名次靠后的并发请求自行退出，保证不误删合法成员。
    const ordered = await db.collection('participants')
      .where({ roomId })
      .orderBy('createdAt', 'asc')
      .get();
    const myRank = ordered.data.findIndex((p) => p._id === added._id);
    if (myRank >= roomDoc.maxPlayers) {
      await db.collection('participants').doc(added._id).remove();
      await db.collection('rooms').doc(roomId).update({
        data: { status: STATUS.FULL, updatedAt: Date.now() }
      });
      throw new Error('房间已满，下次早点来');
    }
    full = true; // 已超员且自己在名额之内：房间必定已满
  } else {
    full = after.total >= roomDoc.maxPlayers;
  }

  await db.collection('rooms').doc(roomId).update({
    data: { status: full ? STATUS.FULL : STATUS.RECRUITING, updatedAt: now, lastActiveAt: now }
  });

  return { joined: true };
};