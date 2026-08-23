/**
 * 后端公共校验逻辑（单一事实来源）。
 *
 * 引用方式与 constants.js 相同：由 sync.js 软拷贝到各云函数目录，
 * 云函数内通过 `require('./_shared/validate')` 引用。
 * 错误文案语义与原有实现保持一致，不可随意改动。
 */

const {
  VALID_GAMES, MIN_PLAYERS, MAX_PLAYERS,
  VALID_TIME_LABELS, START_TIME_MAX_LENGTH
} = require('./constants');

// 校验游戏枚举，非法时抛错（文案沿用 createRoom 原有约定）
function assertValidGame(game) {
  if (!VALID_GAMES.includes(game)) throw new Error('不支持的游戏');
}

// 校验房间人数范围，非法时抛错（文案沿用 createRoom 原有约定）
function assertMaxPlayers(maxPlayers) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    throw new Error('人数需在 2-20 之间');
  }
}

// 校验开打时间：预设枚举或 1-20 字自定义文本。
// 裸「自定义时间」是前端占位符，说明没填具体时间，明确拒绝。
function assertStartTimeLabel(startTimeLabel) {
  const value = String(startTimeLabel || '').trim();
  if (value === '自定义时间') throw new Error('请填写具体的开打时间');
  if (!value || value.length > START_TIME_MAX_LENGTH) throw new Error('开打时间无效');
}

// 统一字符串清洗：转字符串 + trim + 按最大长度截断；空输入归一为空串
function trimAndSlice(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

module.exports = {
  assertValidGame,
  assertMaxPlayers,
  assertStartTimeLabel,
  trimAndSlice
};
