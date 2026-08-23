// 订阅消息配置（向后兼容入口）
// 真实配置已迁移至 ./env.js 集中管理；
// 本文件仅做 re-export，保持既有引用（如 room-detail）无需改动。
// ⚠️ 部署时替换为真实值：请到 env.js 回填 roomReadyTemplateId。
const { roomReadyTemplateId } = require('./env');

module.exports = {
  roomReadyTemplateId: roomReadyTemplateId
};
