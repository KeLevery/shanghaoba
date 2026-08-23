// ============================================================
// about/index.js — 关于 / 隐私政策 / 使用条款 静态内容页
// 单页三 Tab 切换，支持 ?tab=about|privacy|terms 直达
// ============================================================
var TITLES = {
  about: '关于上号吧',
  privacy: '隐私政策',
  terms: '使用条款'
};

Page({
  data: {
    tab: 'about',
    title: TITLES.about
  },

  onLoad: function (options) {
    var tab = (options && options.tab) || 'about';
    this.applyTab(TITLES[tab] ? tab : 'about');
  },

  onTabTap: function (e) {
    this.applyTab(e.currentTarget.dataset.tab);
  },

  applyTab: function (tab) {
    this.setData({ tab: tab, title: TITLES[tab] });
    wx.setNavigationBarTitle({ title: TITLES[tab] });
  }
});
