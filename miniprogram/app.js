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
      env: '请替换为你的云环境ID',
      traceUser: true
    });
  }
});
