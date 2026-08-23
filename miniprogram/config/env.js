// ============================================================
// env.js — 全局环境配置集中模块
// 所有「部署时才能确定」的配置统一收敛到本文件，
// 业务代码一律从本模块 require，禁止散写硬编码。
// ============================================================

// 云开发环境 ID
// ⚠️ 部署时替换为真实值：云开发控制台「设置 - 环境 ID」，
//    替换后 app.js 的 wx.cloud.init({ env }) 应改从本模块读取。
const CLOUD_ENV = '请替换为你的云环境ID';

// 「全员准备提醒」订阅消息模板 ID
// ⚠️ 部署时替换为真实值：小程序后台创建订阅模板后回填。
//    未配置（空串）时 startRoom 会返回 not_configured，
//    前端须诚实提示「开打提醒尚未配置」，不得伪造推送结果。
const ROOM_READY_TEMPLATE_ID = '';

module.exports = {
  cloudEnv: CLOUD_ENV,
  roomReadyTemplateId: ROOM_READY_TEMPLATE_ID,
  appVersion: '1.0.0'
};
