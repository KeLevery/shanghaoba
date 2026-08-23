const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 公共常量与校验逻辑（副本由 cloudfunctions/_shared/sync.js 同步维护）
const {
  STATUS, ROOM_EXPIRE_MS,
  MODE_MAX_LENGTH, REMARK_MAX_LENGTH, START_TIME_MAX_LENGTH
} = require('./_shared/constants');
const { assertValidGame, assertMaxPlayers, assertStartTimeLabel, trimAndSlice } = require('./_shared/validate');

exports.main = async (event) => {
  const { game, mode, maxPlayers, remark, startTimeLabel } = event;
  const openid = cloud.getWXContext().OPENID;

  assertValidGame(game);
  assertMaxPlayers(maxPlayers);
  assertStartTimeLabel(startTimeLabel);
  const cleanMode = trimAndSlice(mode, MODE_MAX_LENGTH);
  const cleanRemark = trimAndSlice(remark, REMARK_MAX_LENGTH);
  const cleanStartTimeLabel = trimAndSlice(startTimeLabel, START_TIME_MAX_LENGTH);

  const now = Date.now();
  let roomId;
  try {
    const created = await db.collection('rooms').add({
      data: {
        game,
        mode: cleanMode,
        maxPlayers,
        remark: cleanRemark,
        startTimeLabel: cleanStartTimeLabel,
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