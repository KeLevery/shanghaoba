const cloud = require('wx-server-sdk');
const notificationConfig = require('./notificationConfig');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

function notificationResult(status, attempted, sent, failed, unsubscribed) {
  return { status, attempted, sent, failed, unsubscribed: unsubscribed || 0 };
}

function notificationPage(roomId) {
  const separator = notificationConfig.page.includes('?') ? '&' : '?';
  return `${notificationConfig.page}${separator}roomId=${encodeURIComponent(roomId)}`;
}

async function getHostNickname(hostOpenid) {
  const res = await db.collection('users').where({ openid: hostOpenid }).limit(1).get();
  return res.data.length ? (res.data[0].gameNickname || '') : '';
}

async function sendReadyNotifications(room, participants) {
  if (!notificationConfig.templateId) {
    return notificationResult('not_configured', 0, 0, 0, 0);
  }

  if (!cloud.openapi || !cloud.openapi.subscribeMessage || typeof cloud.openapi.subscribeMessage.send !== 'function') {
    return notificationResult('unavailable', 0, 0, participants.length, 0);
  }

  const hostNickname = await getHostNickname(room.hostOpenid);
  const data = notificationConfig.buildData({
    game: room.game,
    startTimeLabel: room.startTimeLabel || '现在开打',
    hostNickname,
    roomId: room._id
  });

  let sent = 0;
  let failed = 0;
  let unsubscribed = 0;
  await Promise.all(participants.map(async (participant) => {
    try {
      const result = await cloud.openapi.subscribeMessage.send({
        touser: participant.openid,
        templateId: notificationConfig.templateId,
        page: notificationPage(room._id),
        miniprogramState: notificationConfig.miniprogramState,
        lang: notificationConfig.lang,
        data
      });
      const errorCode = result && (result.errCode || result.errcode);
      if (errorCode && Number(errorCode) !== 0) {
        const error = new Error((result && (result.errMsg || result.errmsg)) || '订阅消息发送失败');
        error.errCode = errorCode;
        throw error;
      }
      sent += 1;
    } catch (error) {
      failed += 1;
      if (Number(error && error.errCode) === 43101) unsubscribed += 1;
    }
  }));

  return notificationResult(failed ? (sent ? 'partial' : 'failed') : 'sent', participants.length, sent, failed, unsubscribed);
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const roomId = event.roomId;
  if (!roomId) throw new Error('缺少房间 ID');

  let room;
  try {
    room = (await db.collection('rooms').doc(roomId).get()).data;
  } catch (error) {
    throw new Error('房间不存在或已关闭');
  }
  if (room.status === STATUS.DISSOLVED) throw new Error('房间已解散');
  if (room.hostOpenid !== openid) throw new Error('只有房主可以开始');
  if (room.status !== STATUS.PENDING) throw new Error('全员准备后才能开始');

  const participants = (await db.collection('participants').where({ roomId }).get()).data;
  const now = Date.now();
  await db.collection('rooms').doc(roomId).update({
    data: { status: STATUS.READY, updatedAt: now, allReadyAt: now, readyNotificationStatus: 'pending' }
  });

  const notification = await sendReadyNotifications({ ...room, _id: roomId }, participants);
  await db.collection('rooms').doc(roomId).update({
    data: {
      readyNotificationStatus: notification.status,
      readyNotificationAt: now,
      readyNotificationAttempted: notification.attempted,
      readyNotificationSent: notification.sent,
      readyNotificationFailed: notification.failed,
      readyNotificationUnsubscribed: notification.unsubscribed
    }
  });

  return { status: STATUS.READY, notification };
};
