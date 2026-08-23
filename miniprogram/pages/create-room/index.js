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

// 人数快捷档（2-20 契约内的常用档位）
var QUICK_NUMS = [2, 3, 4, 5, 6, 10];

var MIN_PLAYERS = 2;
var MAX_PLAYERS = 20;

// 表单校验提示（仅此用途允许手写 toast）
function validateToast(title) {
  wx.showToast({ title: title, icon: 'none' });
}

Page({
  data: {
    games: GAME_LIST,
    gameIndex: 0,
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
    quickNums: QUICK_NUMS
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 1 });
    }
  },

  // 选择游戏：切换时带入该游戏默认人数
  onGameTap: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    this.setData({
      gameIndex: index,
      maxPlayers: GAME_LIST[index].defaultPlayers
    });
  },

  // 人数步进（2-20）
  decrease: function () {
    if (this.data.maxPlayers > MIN_PLAYERS) {
      this.setData({ maxPlayers: this.data.maxPlayers - 1 });
    }
  },
  increase: function () {
    if (this.data.maxPlayers < MAX_PLAYERS) {
      this.setData({ maxPlayers: this.data.maxPlayers + 1 });
    }
  },

  // 人数快捷档
  onQuickNumTap: function (e) {
    var value = Number(e.currentTarget.dataset.value);
    if (value >= MIN_PLAYERS && value <= MAX_PLAYERS) {
      this.setData({ maxPlayers: value });
    }
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
    if (!GAME_LIST[this.data.gameIndex]) {
      validateToast('请选择游戏');
      return null;
    }
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
      game: GAME_LIST[this.data.gameIndex].name,
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
      setTimeout(function () {
        // 跳转后再复位，避免 toast 展示期间重复点击重复建房
        that.setData({ submitting: false });
        wx.redirectTo({ url: '/pages/room-detail/index?roomId=' + roomId });
      }, 500);
    } catch (err) {
      // 云调用错误提示由 cloud.js 统一处理，这里不重复 toast
      this.setData({ submitting: false });
    }
  }
});
