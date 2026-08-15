const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

function statusTextOf(status) {
  const map = { recruiting: '招募中', full: '已满', pending: '待房主开始', ready: '全员就绪 · 可以开打', dissolved: '已解散' };
  return map[status] || status;
}

function displayNameInitial(name) {
  if (!name) return '友';
  const trimmed = String(name).trim();
  return trimmed.slice(0, 2) || '友';
}

function buildRoomInfo(roomDoc, participantCount) {
  const d = roomDoc;
  return {
    _id: d._id,
    game: d.game,
    mode: d.mode || '',
    maxPlayers: d.maxPlayers,
    startTimeLabel: d.startTimeLabel || '现在开打',
    remark: d.remark || '',
    statusText: statusTextOf(d.status),
    status: d.status,
    hostOpenid: d.hostOpenid,
    allReadyAt: d.allReadyAt || null,
    readyNotificationStatus: d.readyNotificationStatus || null,
    readyNotificationSent: d.readyNotificationSent || 0,
    readyNotificationFailed: d.readyNotificationFailed || 0,
    memberCount: participantCount,
    createdAt: d.createdAt
  };
}

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

  const partRes = await db.collection('participants')
    .where({ roomId })
    .orderBy('createdAt', 'asc')
    .get();

  const openids = partRes.data.map(p => p.openid);
  let displayNameMap = {};
  if (openids.length) {
    const userRes = await db.collection('users')
      .where({ openid: db.command.in(openids) })
      .get();
    userRes.data.forEach(u => { displayNameMap[u.openid] = u.gameNickname || ''; });
  }

  const participants = partRes.data.map(p => ({
    openid: p.openid,
    displayName: displayNameMap[p.openid] || '',
    displayNameInitial: displayNameInitial(displayNameMap[p.openid] || p.openid),
    isHost: !!p.isHost,
    ready: !!p.ready
  }));

  const msgRes = await db.collection('messages')
    .where({ roomId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();

  const msgOpenids = [...new Set(msgRes.data.map(m => m.openid))];
  const msgNameMap = {};
  if (msgOpenids.length) {
    const userRes = await db.collection('users').where({ openid: db.command.in(msgOpenids) }).get();
    userRes.data.forEach(u => { msgNameMap[u.openid] = u.gameNickname || ''; });
  }
  const messages = msgRes.data.map(m => ({
    _id: m._id,
    content: m.content,
    displayName: msgNameMap[m.openid] || '',
    createdAt: m.createdAt
  }));

  const myParticipant = partRes.data.find(p => p.openid === openid);
  const myReady = myParticipant ? !!myParticipant.ready : false;
  const isHost = roomDoc.hostOpenid === openid;
  const isMember = !!myParticipant;

  return {
    room: buildRoomInfo(roomDoc, participants.length),
    participants,
    messages,
    isHost,
    myReady,
    isMember
  };
};