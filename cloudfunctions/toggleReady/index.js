const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const roomId = event.roomId;
  if (!roomId) throw new Error('缺少房间 ID');

  const transition = await db.runTransaction(async (transaction) => {
    let room;
    try {
      room = (await transaction.collection('rooms').doc(roomId).get()).data;
    } catch (error) {
      throw new Error('房间不存在或已关闭');
    }
    if (room.status === STATUS.DISSOLVED) throw new Error('房间已解散');

    const memberRes = await transaction.collection('participants')
      .where({ roomId, openid })
      .limit(1)
      .get();
    if (!memberRes.data.length) throw new Error('你不在这个房间里');

    const ready = !memberRes.data[0].ready;
    const now = Date.now();
    await transaction.collection('participants').doc(memberRes.data[0]._id).update({ data: { ready } });

    const participants = (await transaction.collection('participants').where({ roomId }).get()).data;
    const allReady = participants.length >= 2 && participants.every(participant => !!participant.ready);
    // 全员准备只进入「待开打」，由房主在 startRoom 中正式开始；不在此发送通知。
    const status = allReady ? STATUS.PENDING : STATUS.RECRUITING;

    await transaction.collection('rooms').doc(roomId).update({
      data: { status, updatedAt: now, allReadyAt: allReady ? now : null }
    });

    return { ready, allReady, status };
  });

  return { ready: transition.ready, allReady: transition.allReady, status: transition.status };
};
