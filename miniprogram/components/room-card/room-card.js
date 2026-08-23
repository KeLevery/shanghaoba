'use strict';

// room-card 房间卡片（参考图样式：封面 + 加入胶囊）
// 行式结构：左游戏色脊 | 标题(meta) | 右计分分数 + 状态标 + 底部填充条
// 对外契约不变：properties 与 tap 事件 { roomId } 与旧版一致。

var games = require('../../utils/games');

// 房间状态 → 文案/修饰类（full 单独示「已满员」并整行降透明度）
var STATUS_MAP = {
  recruiting: { text: '招募中', modifier: 'recruiting' },
  full: { text: '已满员', modifier: 'full' },
  pending: { text: '等待开始', modifier: 'pending' },
  ready: { text: '进行中', modifier: 'ready' },
  dissolved: { text: '已解散', modifier: 'dissolved' }
};

var DEFAULT_COLOR = '#9c978a';

Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    // 房间 ID，tap 事件回传
    roomId: { type: String, value: '' },
    // 游戏名（无畏契约/三角洲行动/CS2/英雄联盟/永劫无间）
    game: { type: String, value: '' },
    // 模式/地图
    mode: { type: String, value: '' },
    // 开打时间标签（现在开打/今晚/明天/自定义时间）
    startTimeLabel: { type: String, value: '' },
    // 当前成员数
    memberCount: { type: Number, value: 0 },
    // 人数上限（2-20）
    maxPlayers: { type: Number, value: 0 },
    // 房间状态 recruiting/full/pending/ready/dissolved
    status: { type: String, value: 'recruiting' },
    // 备注（为空则不展示）
    remark: { type: String, value: '' },
    // 角色文案（我的房间用：房主/队员；空则不展示角色标）
    roleText: { type: String, value: '' }
  },

  data: {
    isFull: false,
    title: '',
    statusText: '招募中',
    statusModifier: 'recruiting',
    color: DEFAULT_COLOR,
    // 底部填充条宽度（inline style）
    fillWidth: '0%'
  },

  observers: {
    'game, mode': function (game, mode) {
      this.setData({ title: mode ? game + ' · ' + mode : game });
    },
    'game': function (game) {
      var conf = games.findGame(game);
      this.setData({ color: conf ? conf.color : DEFAULT_COLOR });
    },
    'memberCount, maxPlayers, status': function (memberCount, maxPlayers, status) {
      var full = status === 'full' || (maxPlayers > 0 && memberCount >= maxPlayers);
      var conf = STATUS_MAP[status] || STATUS_MAP.recruiting;
      var pct = maxPlayers > 0 ? Math.round((memberCount / maxPlayers) * 100) : 0;
      this.setData({
        isFull: full,
        statusText: conf.text,
        statusModifier: conf.modifier,
        fillWidth: Math.min(pct, 100) + '%'
      });
    }
  },

  methods: {
    onTap: function () {
      this.triggerEvent('tap', { roomId: this.data.roomId });
    }
  }
});
