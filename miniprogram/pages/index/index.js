// ============================================================
// index.js — 招募大厅首页
// 顶部游戏筛选 tabs（纯前端过滤）+「正在召集」列表 +「我的房间」列表
// 云函数一律通过 utils/cloud.js 的 call() 调用，错误提示由其统一处理
// ============================================================
var cloud = require('../../utils/cloud');
var games = require('../../utils/games');

// 筛选 tabs：全部 + 游戏枚举
var GAME_TABS = ['全部'].concat(games.GAME_LIST.map(function (g) { return g.name; }));

// 页眉日期：M月D日 · 周X
function buildDateText() {
  var now = new Date();
  var week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + week;
}

Page({
  data: {
    rooms: [],          // 正在召集：招募中且未过期的房间（含 memberCount）
    myRooms: [],        // 我的房间：含 roleText，房主优先、再按 updatedAt 降序
    gameTabs: GAME_TABS,
    activeGameIndex: 0, // 当前筛选 tab（0=全部）
    filteredRooms: [],  // 筛选后的「正在召集」
    filteredMyRooms: [], // 筛选后的「我的房间」
    dateText: '',       // 页眉右侧日期
    inviteCode: ''      // 邀请码输入框内容
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 0 });
    }
    this.setData({ dateText: buildDateText() });
    this.loadAll();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadAll(true);
  },

  onInviteInput: function (e) {
    this.setData({ inviteCode: e.detail.value });
  },

  // 邀请码直达：客户端直查 rooms 集合（§4.2 所有用户可读）。
  // 不用 db.command 条件操作符（本地调试运行时不支持），
  // 改为拉取最近的同码房间后本地过滤掉已解散/已过期，取最新一个；
  // 进入 room-detail 后由其「分享即入房」逻辑自动加入（满员/锁房由该页提示）。
  onJoinByCode: function () {
    var self = this;
    var code = (this.data.inviteCode || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    var db = wx.cloud.database();
    wx.showLoading({ title: '进房中', mask: true });
    var done = function () { wx.hideLoading(); };
    db.collection('rooms')
      .where({ inviteCode: code })
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
      .then(function (res) {
        done();
        var now = Date.now();
        var room = null;
        var sawExpired = false;
        var list = (res.data || []).slice().sort(function (a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        list.some(function (d) {
          if (d.status === 'dissolved') {
            return false;
          }
          // expireAt 兼容 Date / 时间戳 / ISO 字符串（本地运行时经 JSON 序列化后是字符串，
          // 直接和数字比较会得 NaN 导致过滤失效）
          var expireTs = d.expireAt ? new Date(d.expireAt).getTime() : 0;
          if (expireTs && expireTs <= now) {
            sawExpired = true;
            return false;
          }
          room = d;
          return true;
        });
        if (!room) {
          wx.showToast({
            title: sawExpired ? '房间已过期，请房主重新发起' : '邀请码不存在，再核对一下',
            icon: 'none'
          });
          return;
        }
        self.setData({ inviteCode: '' });
        wx.navigateTo({ url: '/pages/room-detail/index?roomId=' + room._id });
      })
      .catch(function () {
        done();
        wx.showToast({ title: '查询失败，再试一次', icon: 'none' });
      });
  },

  // 并发拉取两区列表；fromPullDown 为 true 时结束后收起下拉动画
  loadAll: function (fromPullDown) {
    var self = this;
    // 单个接口失败不拖垮另一区，错误 toast 由 cloud.js 统一弹出
    var fetchRooms = cloud.call('listRooms', {}, { loading: false })
      .then(function (result) { return (result && result.rooms) || []; })
      .catch(function () { return null; });
    var fetchMyRooms = cloud.call('listMyRooms', {}, { loading: false })
      .then(function (result) { return (result && result.rooms) || []; })
      .catch(function () { return null; });

    Promise.all([fetchRooms, fetchMyRooms]).then(function (results) {
      var patch = {};
      if (results[0]) { patch.rooms = results[0]; }
      if (results[1]) { patch.myRooms = results[1]; }
      self.setData(patch);
      self.applyFilter();
      if (fromPullDown) {
        wx.stopPullDownRefresh();
      }
    });
  },

  // 切换游戏筛选 tab
  onGameTabTap: function (e) {
    var raw = (e && e.detail && typeof e.detail.index === 'number')
      ? e.detail.index
      : (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
    var index = Number(raw) || 0;
    this.setData({ activeGameIndex: index });
    this.applyFilter();
  },

  // 按当前 tab 过滤两区列表（全部则直通）；
  // 已加入的房间（出现在我的房间）不再重复出现在正在召集区，避免同房间两个入口文案打架。
  applyFilter: function () {
    var tab = GAME_TABS[this.data.activeGameIndex];
    var myIds = {};
    this.data.myRooms.forEach(function (r) { myIds[r._id] = true; });
    var recruiting = this.data.rooms.filter(function (r) { return !myIds[r._id]; });
    if (!tab || tab === '全部') {
      this.setData({
        filteredRooms: recruiting,
        filteredMyRooms: this.data.myRooms
      });
      return;
    }
    this.setData({
      filteredRooms: recruiting.filter(function (r) { return r.game === tab; }),
      filteredMyRooms: this.data.myRooms.filter(function (r) { return r.game === tab; })
    });
  },

  // 跳转「发起上号」（tab 页）
  goCreate: function () {
    wx.switchTab({ url: '/pages/create-room/index' });
  },

  // 铃铛：说明「开打提醒」订阅消息机制（未配置模板时如实告知）
  onBellTap: function () {
    wx.showModal({
      title: '开打提醒',
      content: '全员准备后，房主点击「开始游戏」时会通过微信服务通知提醒你上号。提醒功能需配置订阅消息模板后生效，未配置时不影响正常开局。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 点击房间卡片（room-card 的 tap 事件回传 { roomId }）
  onRoomTap: function (e) {
    var roomId = e.detail.roomId;
    if (!roomId) {
      return;
    }
    wx.navigateTo({ url: '/pages/room-detail/index?roomId=' + roomId });
  }
});
