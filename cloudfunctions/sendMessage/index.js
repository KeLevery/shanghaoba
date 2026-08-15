const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const roomId = event.roomId;
  const content = String(event.content || '').trim().slice(0, 200);
  if (!roomId) throw new Error('缺少房间 ID');
  if (!content) throw new Error('消息不能为空');

  let roomDoc;
  try {
    const res = await db.collection('rooms').doc(roomId).get();
    roomDoc = res.data;
  } catch (error) {
    throw new Error('房间不存在或已关闭');
  }
  if (roomDoc.status === STATUS.DISSOLVED) throw new Error('房间已解散');

  const member = await db.collection('participants').where({ roomId, openid }).count();
  if (!member.total) throw new Error('你不在这个房间里');

  const now = Date.now();
  const added = await db.collection('messages').add({
    data: { roomId, openid, content, createdAt: now }
  });
  await db.collection('rooms').doc(roomId).update({ data: { updatedAt: now } });

  return { messageId: added._id };
};