Page({
  data: { rooms: [], myRooms: [] },

  onShow() { this.loadRooms(); this.loadMyRooms(); },

  async loadRooms() {
    wx.showLoading({ title: '加载中' });
    try {
      const res = await wx.cloud.callFunction({ name: 'listRooms' });
      this.setData({ rooms: res.result.rooms || [] });
    } catch (error) {
      wx.showToast({ title: '加载失败，请检查云环境', icon: 'none' });
    } finally { wx.hideLoading(); }
  },

  async loadMyRooms() {
    try {
      const res = await wx.cloud.callFunction({ name: 'listMyRooms' });
      this.setData({ myRooms: res.result.rooms || [] });
    } catch (error) {
      wx.showToast({ title: '我的房间加载失败', icon: 'none' });
    }
  },

  refresh() { this.loadRooms(); this.loadMyRooms(); },
  goCreate() { wx.navigateTo({ url: '/pages/create-room/index' }); },
  goProfile() { wx.navigateTo({ url: '/pages/profile/index' }); },
  openRoom(e) { wx.navigateTo({ url: `/pages/room-detail/index?roomId=${e.currentTarget.dataset.id}` }); }
});
