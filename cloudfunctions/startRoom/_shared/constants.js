/**
 * 后端公共常量（单一事实来源）。
 *
 * 注意：云函数是独立部署单元，云端只上传函数自身目录，
 * 因此本目录会由 sync.js 软拷贝到每个云函数目录下的 `_shared/`，
 * 云函数内统一通过 `require('./_shared/constants')` 引用。
 * 修改本文件后请运行 `node cloudfunctions/_shared/sync.js` 同步副本。
 */

// 房间状态机取值（recruiting/full/pending/ready/dissolved）
const STATUS = {
  RECRUITING: 'recruiting',
  FULL: 'full',
  PENDING: 'pending',
  READY: 'ready',
  DISSOLVED: 'dissolved'
};

// 状态中文展示文案（listRooms / listMyRooms / getRoom 共用）
const STATUS_TEXT = {
  recruiting: '招募中',
  full: '已满',
  pending: '待房主开始',
  ready: '全员就绪 · 可以开打',
  dissolved: '已解散'
};

// 支持的游戏枚举（预设游戏；枚举之外允许自定义游戏名，见 GAME_MAX_LENGTH）
const VALID_GAMES = ['无畏契约', '三角洲行动', 'CS2', '英雄联盟', '永劫无间'];

// 各游戏默认人数（无畏契约 5 / 三角洲行动 4 / CS2 5 / 英雄联盟 5 / 永劫无间 3）
const DEFAULT_MAX_PLAYERS = {
  '无畏契约': 5,
  '三角洲行动': 4,
  'CS2': 5,
  '英雄联盟': 5,
  '永劫无间': 3
};

// 开打时间标签枚举
const VALID_TIME_LABELS = ['现在开打', '今晚', '明天', '自定义时间'];

// 房间人数上下限
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;

// 字段长度限制
const MODE_MAX_LENGTH = 30;      // 模式/地图
const REMARK_MAX_LENGTH = 100;   // 房间备注
const CONTENT_MAX_LENGTH = 200;  // 聊天消息
const NICKNAME_MAX_LENGTH = 20;  // 游戏昵称
const START_TIME_MAX_LENGTH = 20; // 开打时间（自定义自由文本）
const GAME_MAX_LENGTH = 20;      // 自定义游戏名（枚举之外的自由文本）

// 房间邀请码：4 位，去除易混淆字符（I/O/0/1）
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 4;

// 房间过期时长：2 小时无活动自动过期
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;

module.exports = {
  STATUS,
  STATUS_TEXT,
  VALID_GAMES,
  DEFAULT_MAX_PLAYERS,
  VALID_TIME_LABELS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MODE_MAX_LENGTH,
  REMARK_MAX_LENGTH,
  CONTENT_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  START_TIME_MAX_LENGTH,
  GAME_MAX_LENGTH,
  INVITE_CODE_CHARS,
  INVITE_CODE_LENGTH,
  ROOM_EXPIRE_MS
};
