// ============================================================
// utils/games.js — 游戏枚举共享常量
// 游戏清单与默认人数契约见开发交接文档 §2.2 / §4.1
// cover：封面图本地路径（素材后补，缺失时 game-cover 组件降级为品牌色首字块）
// color：品牌色，用于缺图降级渐变底
// ============================================================
var GAME_LIST = [
  { name: '无畏契约', defaultPlayers: 5, cover: '/images/games/valorant.png', color: '#8a3a44', gradient: ['#a84651', '#5e2a32'] },
  { name: '三角洲行动', defaultPlayers: 4, cover: '/images/games/delta.png', color: '#4f6e3a', gradient: ['#5f7d45', '#3a4f2c'] },
  { name: 'CS2', defaultPlayers: 5, cover: '/images/games/cs2.png', color: '#9c6f1e', gradient: ['#b5822a', '#6e4f16'] },
  { name: '英雄联盟', defaultPlayers: 5, cover: '/images/games/lol.png', color: '#2f7d78', gradient: ['#389089', '#235e5a'] },
  { name: '永劫无间', defaultPlayers: 3, cover: '/images/games/naraka.png', color: '#8a3a3a', gradient: ['#a84444', '#5e2a2a'] }
];

// 游戏名 → 配置项索引
function findGame(name) {
  for (var i = 0; i < GAME_LIST.length; i++) {
    if (GAME_LIST[i].name === name) {
      return GAME_LIST[i];
    }
  }
  return null;
}

module.exports = {
  GAME_LIST: GAME_LIST,
  findGame: findGame
};
