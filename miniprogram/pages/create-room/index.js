// ============================================================
// create-room/index.js — 发起上号（V2 单页表单）
// 一屏完成：选游戏（带入默认人数）→ 人数（步进 + 快捷）→ 模式
// → 开打时间 → 备注；底部固定操作栏实时摘要 + 提交。
// 提交调 createRoom，成功跳房间详情。
// 云函数一律通过 utils/cloud.js 的 call() 调用，云调用错误由其统一提示；
// wx.showToast 在本页仅用于表单校验类提示
// ============================================================
var cloud = require('../../utils/cloud');
var games = require('../../utils/games');

// 游戏枚举与默认人数（契约见开发交接文档 §2.2 / §4.1）
var GAME_LIST = games.GAME_LIST;

// 开打时间标签枚举（§4.1 startTimeLabel）
var TIME_OPTIONS = ['现在开打', '今晚', '明天', '自定义时间'];

// 模式/地图预设（选「自定义」时露出自由输入，契约 mode 仍为 ≤30 自由文本）
var MODE_PRESETS = ['排位', '匹配', '娱乐', '自定义'];

// 人数上下限（契约：2-20）
var MIN_PLAYERS = 2;
var MAX_PLAYERS = 20;

// 滑块刻度（2-20 每个整数一个停泊点，点击即设值）
var SLIDER_STOPS = (function () {
  var stops = [];
  for (var i = MIN_PLAYERS; i <= MAX_PLAYERS; i++) {
    stops.push(i);
  }
  return stops;
})();

// 人数 → 滑块填充百分比
function playersToPct(value) {
  return Math.round(((value - MIN_PLAYERS) / (MAX_PLAYERS - MIN_PLAYERS)) * 100);
}

// 表单校验提示（仅此用途允许手写 toast）
function validateToast(title) {
  wx.showToast({ title: title, icon: 'none' });
}

Page({
  data: {
    games: GAME_LIST,
    gameIndex: 0,
    // 自定义游戏名（枚举外的自由输入，≤20 字，契约同 createRoom 校验）
    customGame: '',
    // 当前生效的游戏名（摘要栏/校验用）：选预设或填自定义名
    selectedGameName: GAME_LIST[0].name,
    maxPlayers: GAME_LIST[0].defaultPlayers,
    mode: MODE_PRESETS[0],   // 默认预设「排位」；选「自定义」后清空待填
    remark: '',
    timeOptions: TIME_OPTIONS,
    timeIndex: 0,
    timeLabel: TIME_OPTIONS[0], // 摘要栏展示用：预设文案或自定义输入内容
    customTime: '',             // 选「自定义时间」后的自由输入（≤20 字）
    submitting: false,
    modePresets: MODE_PRESETS,
    modePresetIndex: 0,      // 当前模式预设下标；最后一项为「自定义」
    // 自定义游戏格子聚焦态（bindblur 后复位，再次点击可重新拉起键盘）
    focusCustomGame: false,
    // 人数滑块：刻度停泊点 + 填充百分比
    sliderStops: SLIDER_STOPS,
    sliderPct: playersToPct(GAME_LIST[0].defaultPlayers)
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 1 });
    }
  },

  // 选择游戏：切换时带入该游戏默认人数；清掉自定义游戏输入
  onGameTap: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    this.setData({
      gameIndex: index,
      customGame: '',
      focusCustomGame: false,
      selectedGameName: GAME_LIST[index].name,
      maxPlayers: GAME_LIST[index].defaultPlayers,
      sliderPct: playersToPct(GAME_LIST[index].defaultPlayers)
    });
  },

  // 点「其他游戏」格子：置为选中态（gameIndex=-1，与预设高亮同语义）+ 聚焦自定义输入框
  onCustomTileTap: function () {
    this.setData({
      gameIndex: -1,
      selectedGameName: (this.data.customGame || '').trim(),
      focusCustomGame: true
    });
  },

  // 输入框失焦后复位聚焦态，便于下次点击格子重新聚焦
  onCustomGameBlur: function () {
    this.setData({ focusCustomGame: false });
  },

  // 输入自定义游戏名：非空时取消预设选中态（与 demo「或输入其他游戏」交互一致）
  onCustomGameInput: function (e) {
    var trimmed = (e.detail.value || '').trim();
    this.setData({
      customGame: e.detail.value,
      gameIndex: trimmed ? -1 : this.data.gameIndex,
      selectedGameName: trimmed || (this.data.gameIndex >= 0 ? GAME_LIST[this.data.gameIndex].name : '')
    });
  },

  // 人数滑块：±微调 + 点刻度带直接设值（2-20）
  updatePlayers: function (value) {
    if (value < MIN_PLAYERS) value = MIN_PLAYERS;
    if (value > MAX_PLAYERS) value = MAX_PLAYERS;
    this.setData({ maxPlayers: value, sliderPct: playersToPct(value) });
  },

  decrease: function () {
    this.updatePlayers(this.data.maxPlayers - 1);
  },
  increase: function () {
    this.updatePlayers(this.data.maxPlayers + 1);
  },

  // 点击滑块刻度带：落在哪个停泊点就设为对应人数
  onSliderTap: function (e) {
    var value = Number(e.currentTarget.dataset.value);
    if (value >= MIN_PLAYERS && value <= MAX_PLAYERS) {
      this.updatePlayers(value);
    }
  },

  // ---- 滑块拖拽（按住轨道左右拖动）----
  // 触点横坐标 → 人数：用 boundingClientRect 测一次轨道位置缓存复用；
  // 真实小程序与本地运行时均支持 wx.createSelectorQuery 最小集。
  _touchClientX: function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? t.clientX : 0;
  },

  _applySliderX: function (clientX) {
    var rect = this._sliderRect;
    if (!rect || !rect.width) {
      return;
    }
    var ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    var value = Math.round(MIN_PLAYERS + ratio * (MAX_PLAYERS - MIN_PLAYERS));
    if (value !== this.data.maxPlayers) {
      this.updatePlayers(value);
    }
  },

  onSliderTouchStart: function (e) {
    var self = this;
    this._sliderDragging = true;
    if (this._sliderRect) {
      this._applySliderX(this._touchClientX(e));
      // 后台刷新一次缓存，窗口尺寸变化后不至于拖偏（本次拖拽仍用旧值）
    }
    wx.createSelectorQuery().select('.pslider__rail').boundingClientRect(function (rect) {
      self._sliderRect = rect || null;
      // 首次拿到位置后补一次当前触点映射（异步回调可能晚于首次 move）
      if (self._sliderDragging) {
        self._applySliderX(self._touchClientX(e));
      }
    }).exec();
  },

  onSliderTouchMove: function (e) {
    if (!this._sliderDragging) {
      return;
    }
    this._applySliderX(this._touchClientX(e));
  },

  onSliderTouchEnd: function () {
    this._sliderDragging = false;
  },

  // 模式预设 chips：非「自定义」直接写入 mode；「自定义」清空待填
  onModeChipTap: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var preset = MODE_PRESETS[index];
    this.setData({
      modePresetIndex: index,
      mode: preset === '自定义' ? '' : preset
    });
  },

  onModeInput: function (e) {
    this.setData({ mode: e.detail.value });
  },
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },
  onTimeTap: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    this.setData({
      timeIndex: index,
      // 切回预设直接用预设文案；切到自定义先显示占位，等用户输入
      timeLabel: index === TIME_OPTIONS.length - 1 ? '自定义…' : TIME_OPTIONS[index]
    });
  },

  onCustomTimeInput: function (e) {
    var value = e.detail.value;
    this.setData({
      customTime: value,
      timeLabel: value.trim() || '自定义…'
    });
  },

  // 前端基础校验：必填 + 范围，通过后再发起云调用
  validate: function () {
    var mode = this.data.mode.trim();
    var remark = this.data.remark.trim();
    var customGame = this.data.customGame.trim();
    if (!customGame && !GAME_LIST[this.data.gameIndex]) {
      validateToast('请选择或输入游戏');
      return null;
    }
    if (customGame.length > 20) {
      validateToast('游戏名最多 20 字');
      return null;
    }
    var game = customGame || GAME_LIST[this.data.gameIndex].name;
    if (!mode) {
      validateToast('请填写模式/地图');
      return null;
    }
    if (mode.length > 30) {
      validateToast('模式最多 30 字');
      return null;
    }
    if (this.data.maxPlayers < MIN_PLAYERS || this.data.maxPlayers > MAX_PLAYERS) {
      validateToast('人数需在 2-20 之间');
      return null;
    }
    if (remark.length > 100) {
      validateToast('备注最多 100 字');
      return null;
    }
    // 开打时间：预设直通；自定义必填 1-20 字
    var startTimeLabel;
    if (this.data.timeIndex === TIME_OPTIONS.length - 1) {
      startTimeLabel = this.data.customTime.trim();
      if (!startTimeLabel) {
        validateToast('请填写开打时间');
        return null;
      }
      if (startTimeLabel.length > 20) {
        validateToast('时间最多 20 字');
        return null;
      }
    } else {
      startTimeLabel = TIME_OPTIONS[this.data.timeIndex];
    }
    return {
      game: game,
      mode: mode,
      maxPlayers: this.data.maxPlayers,
      remark: remark,
      startTimeLabel: startTimeLabel
    };
  },

  submit: async function () {
    if (this.data.submitting) {
      return;
    }
    var payload = this.validate();
    if (!payload) {
      return;
    }
    this.setData({ submitting: true });
    try {
      var result = await cloud.call('createRoom', payload, { loading: '发起中' });
      wx.showToast({ title: '召集已发起', icon: 'success' });
      var roomId = result.roomId;
      var that = this;
      this._navTimer = setTimeout(function () {
        that._navTimer = null;
        // 跳转后再复位，避免 toast 展示期间重复点击重复建房
        that.setData({ submitting: false });
        wx.navigateTo({ url: '/pages/room-detail/index?roomId=' + roomId });
      }, 500);
    } catch (err) {
      // 云调用错误提示由 cloud.js 统一处理，这里不重复 toast
      this.setData({ submitting: false });
    }
  },

  onUnload: function () {
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  }
});
