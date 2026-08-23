// ============================================================
// profile/index.js — 我的（个人中心）
// 用户卡片 + 昵称编辑 + 设置列表（关于/隐私/条款/反馈/清缓存/版本号）
// 约定：云函数一律经 utils/cloud.js 的 call() 调用；
//       云调用错误 toast 由 cloud.js 统一处理，本页只发表单校验提示。
// ============================================================
var cloud = require('../../utils/cloud.js');
var env = require('../../config/env.js');

// 昵称长度上限（与 users.gameNickname 契约一致，见 §4.1）
var NICKNAME_MAX_LEN = 20;

Page({
  data: {
    gameNickname: '', // 输入框当前值
    charCount: 0, // 实时字数统计
    avatarChar: '', // 头像预览首字（忽略前导空白）
    saving: false, // 保存中：按钮 loading + 防重复提交
    editing: false, // 是否展开昵称编辑区
    cacheSize: '0KB', // 缓存大小展示
    version: env.appVersion || '1.0.0'
  },

  onLoad: function () {
    this.loadProfile();
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 3 });
    }
    this.refreshCacheSize();
  },

  // 拉取资料并回填昵称；失败提示由 cloud.js 统一处理
  loadProfile: function () {
    var that = this;
    cloud
      .call('getProfile', {}, { loading: '加载资料' })
      .then(function (result) {
        var nickname = (result && result.gameNickname) || '';
        that.applyNickname(nickname);
      })
      .catch(function () {});
  },

  // 输入回调：同步昵称、字数统计与首字头像
  onNicknameInput: function (e) {
    this.applyNickname(e.detail.value);
  },

  // 统一写入昵称及其派生数据
  applyNickname: function (value) {
    var safeValue = value || '';
    var trimmedHead = safeValue.replace(/^\s+/, '');
    this.setData({
      gameNickname: safeValue,
      charCount: safeValue.length,
      avatarChar: trimmedHead ? trimmedHead.charAt(0) : ''
    });
  },

  // 展开 / 收起昵称编辑区
  toggleEdit: function () {
    this.setData({ editing: !this.data.editing });
  },

  // 保存昵称：前端校验 → saveProfile → 成功 toast
  onSave: function () {
    if (this.data.saving) {
      return;
    }
    var nickname = this.data.gameNickname.trim();

    // 表单校验（前端提示属允许范围）
    if (!nickname) {
      wx.showToast({ title: '请填写游戏昵称', icon: 'none' });
      return;
    }
    if (nickname.length > NICKNAME_MAX_LEN) {
      wx.showToast({ title: '昵称最多 20 个字', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    var that = this;
    cloud
      .call('saveProfile', { gameNickname: nickname }, { loading: '保存中' })
      .then(function () {
        // 保存成功后同步为 trim 后的值，与服务端存储保持一致
        that.applyNickname(nickname);
        that.setData({ editing: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      })
      .catch(function () {})
      .then(function () {
        that.setData({ saving: false });
      });
  },

  // ---- 设置项 ----

  // 关于 / 隐私政策 / 使用条款：跳静态内容页
  goAbout: function (e) {
    var tab = e.currentTarget.dataset.tab || 'about';
    wx.navigateTo({ url: '/pages/about/index?tab=' + tab });
  },

  // 意见反馈：优先微信原生反馈入口，未开通时降级 modal 说明
  onFeedback: function () {
    wx.showModal({
      title: '意见反馈',
      content: '感谢你的建议！可在小程序「右上角菜单 → 反馈与投诉」中提交，或联系开发者。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 清除缓存：二次确认后全清本地缓存并刷新展示
  onClearCache: function () {
    var that = this;
    wx.showModal({
      title: '清除缓存',
      content: '将清空本地缓存（含消息列表缓存），不影响账号数据。确定清除吗？',
      success: function (res) {
        if (!res.confirm) {
          return;
        }
        try {
          wx.clearStorageSync();
          that.refreshCacheSize();
          wx.showToast({ title: '已清除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '清除失败，请重试', icon: 'none' });
        }
      }
    });
  },

  // 读取并格式化缓存大小
  refreshCacheSize: function () {
    try {
      var info = wx.getStorageInfoSync();
      var kb = (info && info.currentSize) || 0;
      this.setData({ cacheSize: kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB' });
    } catch (err) {
      // 读取失败保持原值
    }
  }
});
