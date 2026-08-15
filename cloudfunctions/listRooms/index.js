const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };

function statusTextOf(status) {
  const map = { recruiting: '招募中', full: '已满', pending: '待房主开始', ready: '全员就绪 · 可以开打', dissolved: '已解散' };
  return map[status] || status;
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