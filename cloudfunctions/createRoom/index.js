const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000; // 2 小时无活动自动过期
const STATUS = { RECRUITING: 'recruiting', FULL: 'full', PENDING: 'pending', READY: 'ready', DISSOLVED: 'dissolved' };
const VALID_GAMES = ['无畏契约', '三角洲行动', 'CS2', '英雄联盟', '永劫无间'];
const VALID_TIME_LABELS = ['现在开打', '今晚', '明天', '自定义时间'];

exports.main = async (event) => {
  const { game, mode, maxPlayers, remark, startTimeLabel } = event;
  const openid = cloud.getWXContext().OPENID;

  if (!VALID_GAMES.includes(game)) throw new Error('不支持的游戏');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 20) throw new Error('人数需在 2-20 之间');
  if (!VALID_TIME_LABELS.includes(startTimeLabel)) throw new Error('开打时间无效');
  const cleanMode = String(mode || '').trim().slice(0, 30);
  const cleanRemark = String(remark || '').trim().slice(0, 100);

  const now = Date.now();
  let roomId;
  try {
    const created = await db.collection('rooms').add({
      data: {
        game,
        mode: cleanMode,
        maxPlayers,
        remark: cleanRemark,
        startTimeLabel,
        hostOpenid: openid,
        status: STATUS.RECRUITING,
        createdAt: now,
        updatedAt: now,
        expireAt: now + ROOM_EXPIRE_MS,
        lastActiveAt: now
      }
    });
    roomId = created._id;
  } catch (error) {
    throw new Error('创建房间失败');
  }

  try {
    await db.collection('participants').add({
      data: {
        roomId,
        openid,
        displayName: '',
        isHost: true,
        ready: false,
        createdAt: now
      }
    });
  } catch (error) {
    // 补偿：房主参与者写入失败时删除已创建的房间，避免遗留无法被解散/管理的孤儿房间
    try {
      await db.collection('rooms').doc(roomId).remove();
    } catch (cleanupError) {
      // 补偿删除也失败时无法做更多；房间已无房主参与者，依赖后续清理任务
    }
    throw new Error('创建房间失败');
  }

  return { roomId };
};