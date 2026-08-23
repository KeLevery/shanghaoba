'use strict';

// ============================================================
// game-cover 游戏封面
// 有封面图时显示图片；缺失/加载失败降级为渐变品牌色 + 首字徽章
// 配色内置在组件中，不依赖 games.js 的 gradient 字段
// ============================================================
var games = require('../../utils/games');

// 每个游戏的降级渐变（暗调，不刺眼）
var GRADIENTS = {
  '无畏契约': 'linear-gradient(135deg, #a84651, #5e2a32)',
  '三角洲行动': 'linear-gradient(135deg, #5f7d45, #3a4f2c)',
  'CS2': 'linear-gradient(135deg, #b5822a, #6e4f16)',
  '英雄联盟': 'linear-gradient(135deg, #389089, #235e5a)',
  '永劫无间': 'linear-gradient(135deg, #a84444, #5e2a2a)'
};
var DEFAULT_BG = 'linear-gradient(135deg, #44505e, #2a323c)';

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    game: { type: String, value: '' }
  },

  data: {
    src: '',
    bg: DEFAULT_BG,
    initial: '游',
    failed: false
  },

  observers: {
    game: function (game) {
      this.resolve(game);
    }
  },

  lifetimes: {
    attached: function () {
      this.resolve(this.data.game);
    }
  },

  methods: {
    resolve: function (game) {
      var conf = games.findGame(game);
      this.setData({
        src: conf ? conf.cover : '',
        bg: GRADIENTS[game] || DEFAULT_BG,
        initial: game ? game.charAt(0) : '游',
        failed: false
      });
    },
    onError: function () {
      this.setData({ failed: true });
    }
  }
});