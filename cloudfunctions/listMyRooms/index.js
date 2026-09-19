const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { STATUS, STATUS_TEXT } = require('./_shared/constants');

function roomInfo(room, participant, memberCount) {
  const isHost = room.hostOpenid === participant.openid;
  return {
    _id: room._id,
    game: room.game,
    mode: room.mode || '',
    maxPlayers: room.maxPlayers,
    memberCount,
    startTimeLabel: room.startTimeLabel || '现在开打',
    remark: room.remark || '',
    status: room.status,
    statusText: STATUS_TEXT[room.status] || room.status,
    roleText: isHost ? '房主' : '已加入',
    isHost,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt || room.lastActiveAt || room.createdAt
  };
}

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  const participantRes = await db.collection('participants')
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const participantByRoomId = {};
  participantRes.data.forEach((participant) => {
    if (!participantByRoomId[participant.roomId]) {
      participantByRoomId[participant.roomId] = participant;
    }
  });
  // 限制单次查询房间数上限为 50，防 db.command.in 数组超限
  const roomIds = Object.keys(participantByRoomId).slice(0, 50);
  if (!roomIds.length) return { rooms: [] };

  const roomRes = await db.collection('rooms')
    .where({ _id: db.command.in(roomIds) })
    .limit(1000)
    .get();
  const allParticipantRes = await db.collection('participants')
    .where({ roomId: db.command.in(roomIds) })
    .limit(1000)
    .get();
  const memberCountByRoomId = {};
  allParticipantRes.data.forEach((participant) => {
    memberCountByRoomId[participant.roomId] = (memberCountByRoomId[participant.roomId] || 0) + 1;
  });

  const rooms = roomRes.data
    .filter(room => room.status !== STATUS.DISSOLVED)
    .map(room => roomInfo(room, participantByRoomId[room._id], memberCountByRoomId[room._id] || 0))
    .sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

  return { rooms };
};
