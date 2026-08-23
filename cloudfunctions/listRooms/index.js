const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { STATUS, STATUS_TEXT } = require('./_shared/constants');

function statusTextOf(status) {
  return STATUS_TEXT[status] || status;
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
    memberCount: participantCount,
    createdAt: d.createdAt
  };
}

exports.main = async () => {
  const now = Date.now();
  // 只列招募中且未过期的房间
  const res = await db.collection('rooms')
    .where({ status: STATUS.RECRUITING, expireAt: db.command.gt(now) })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const roomIds = res.data.map(r => r._id);
  if (!roomIds.length) return { rooms: [] };

  const countRes = await db.collection('participants')
    .where({ roomId: db.command.in(roomIds) })
    .limit(1000)
    .get();

  const countMap = {};
  countRes.data.forEach(p => { countMap[p.roomId] = (countMap[p.roomId] || 0) + 1; });

  const rooms = res.data.map(r => buildRoomInfo(r, countMap[r._id] || 0));
  return { rooms };
};