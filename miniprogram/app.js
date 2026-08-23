// 云环境等占位配置集中在 config/env.js，部署时只需改那一处
var envConfig = require('./config/env');

App({
  globalData: {
    user: null
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '提示',
        content: '请使用支持云开发的微信开发者工具打开项目',
        showCancel: false
      });
      return;
    }

    wx.cloud.init({
      env: envConfig.cloudEnv,
      traceUser: true
    });
  }
});
