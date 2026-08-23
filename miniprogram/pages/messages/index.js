// ============================================================
// messages/index.js — 消息聚合页
// 聚合「我的房间」各房间最近一条消息（复用 listMyRooms + getRoom，
// 不新增云函数）；点击直达房间详情聊天 Tab。
// 性能：房间硬截断 10 个并发；storage 缓存上次结果防白屏。
// ============================================================
var cloud = require('../../utils/cloud');
var games = require('../../utils/games');

// 聚合房间数上限（防 listMyRooms 返回过多放大并发云调用）
var MAX_ROOMS = 10;
var CACHE_KEY = 'messagesCache';

Page({
  data: {
    items: [],
    loading: true
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 2 });
    }
    this.load(false);
  },

  onPullDownRefresh: function () {
    this.load(true);
  },

  load: function (fromPullDown) {
    var self = this;
    // 首屏先渲染上次缓存，避免白屏
    if (!this.data.items.length) {
      var cache = this.readCache();
      if (cache && cache.length) {
        this.setData({ items: cache, loading: false });
      }
    }

    cloud.call('listMyRooms', {}, { loading: false })
      .then(function (result) {
        var rooms = ((result && result.rooms) || []).slice(0, MAX_ROOMS);
        if (!rooms.length) {
          self.setData({ items: [], loading: false });
          self.writeCache([]);
          if (fromPullDown) { wx.stopPullDownRefresh(); }
          return;
        }
        // 并发取各房间详情，单个失败（如房间刚解散）不拖垮整页
        return Promise.all(rooms.map(function (room) {
          return cloud.call('getRoom', { roomId: room._id }, { loading: false, toastError: false })
            .then(function (detail) {
              return self.buildItem(room, detail);
            })
            .catch(function () {
              return null;
            });
        })).then(function (items) {
          var list = items.filter(function (it) { return !!it; });
          self.setData({ items: list, loading: false });
          self.writeCache(list);
          if (fromPullDown) { wx.stopPullDownRefresh(); }
        });
      })
      .catch(function () {
        // listMyRooms 失败：错误 toast 由 cloud.js 统一弹出；保留缓存内容
        self.setData({ loading: false });
        if (fromPullDown) { wx.stopPullDownRefresh(); }
      });
  },

  // 组装列表项：房间信息 + 最近一条消息摘要
  buildItem: function (room, detail) {
    var messages = (detail && detail.messages) || [];
    var last = messages.length ? messages[messages.length - 1] : null;
    var participants = (detail && detail.participants) || [];
    var game = room.game || (detail && detail.room && detail.room.game) || '';
    var gameConf = games.findGame(game);
    return {
      roomId: room._id,
      game: game,
      gameColor: gameConf ? gameConf.color : '#9c978a',
      mode: room.mode || (detail && detail.room && detail.room.mode) || '',
      status: room.status || (detail && detail.room && detail.room.status) || '',
      memberCount: participants.length || room.memberCount || 0,
      maxPlayers: room.maxPlayers || (detail && detail.room && detail.room.maxPlayers) || 0,
      lastContent: last ? last.content : '',
      lastTime: last ? cloud.formatTime(last.createdAt) : '',
      lastSender: last ? (last.displayName || '队友') : ''
    };
  },

  // 点击直达房间聊天 Tab
  onItemTap: function (e) {
    var roomId = e.currentTarget.dataset.roomId;
    if (!roomId) {
      return;
    }
    wx.navigateTo({ url: '/pages/room-detail/index?roomId=' + roomId + '&tab=chat' });
  },

  readCache: function () {
    try {
      return wx.getStorageSync(CACHE_KEY) || null;
    } catch (err) {
      return null;
    }
  },

  writeCache: function (list) {
    try {
      wx.setStorageSync(CACHE_KEY, list);
    } catch (err) {
      // 缓存失败不影响主流程
    }
  }
});
