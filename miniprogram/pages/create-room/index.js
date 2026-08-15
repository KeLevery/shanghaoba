const GAME_DEFAULT_PLAYERS = {
  '无畏契约': 5,
  '三角洲行动': 4,
  'CS2': 5,
  '英雄联盟': 5,
  '永劫无间': 3
};

Page({
  data: {
    games: ['无畏契约', '三角洲行动', 'CS2', '英雄联盟', '永劫无间'],
    gameIndex: 0,
    maxPlayers: 5,
    mode: '',
    remark: '',
    timeOptions: ['现在开打', '今晚', '明天', '自定义时间'],
    timeIndex: 0,
    submitting: false
  },

  onGameChange(e) {
    const gameIndex = Number(e.detail.value);
    const game = this.data.games[gameIndex];
    this.setData({ gameIndex, maxPlayers: GAME_DEFAULT_PLAYERS[game] });
  },
  onModeInput(e) { this.setData({ mode: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },
  onTimeChange(e) { this.setData({ timeIndex: Number(e.detail.value) }); },
  decrease() { if (this.data.maxPlayers > 2) this.setData({ maxPlayers: this.data.maxPlayers - 1 }); },
  increase() { if (this.data.maxPlayers < 20) this.setData({ maxPlayers: this.data.maxPlayers + 1 }); },

  async submit() {
    if (this.data.submitting) return;
    const { games, gameIndex, mode, maxPlayers, remark, timeOptions, timeIndex } = this.data;
    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'createRoom',
        data: { game: games[gameIndex], mode: mode.trim(), maxPlayers, remark: remark.trim(), startTimeLabel: timeOptions[timeIndex] }
      });
      const roomId = res.result.roomId;
      wx.showToast({ title: '召集已发起', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: `/pages/room-detail/index?roomId=${roomId}` }), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '发起失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
});
