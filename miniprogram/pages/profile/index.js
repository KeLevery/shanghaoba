Page({
  data: { gameNickname: '', saving: false },
  onShow() { this.loadProfile(); },
  async loadProfile() {
    try { const res = await wx.cloud.callFunction({ name: 'getProfile' }); this.setData({ gameNickname: res.result.gameNickname || '' }); }
    catch (error) { wx.showToast({ title: '资料加载失败', icon: 'none' }); }
  },
  onNicknameInput(e) { this.setData({ gameNickname: e.detail.value }); },
  async save() {
    const gameNickname = this.data.gameNickname.trim();
    if (!gameNickname) { wx.showToast({ title: '请填写游戏昵称', icon: 'none' }); return; }
    this.setData({ saving: true });
    try { await wx.cloud.callFunction({ name: 'saveProfile', data: { gameNickname } }); wx.showToast({ title: '已保存', icon: 'success' }); }
    catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  }
});
