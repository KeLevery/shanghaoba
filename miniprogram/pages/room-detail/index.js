const { roomReadyTemplateId } = require('../../config/notification');

Page({
  data: {
    roomId: '', room: null, participants: [], messages: [],
    isHost: false, myReady: false, messageContent: '', lastMessageId: '',
    roomWatcher: null, participantWatcher: null, messageWatcher: null
  },

  async onLoad(options) {
    if (!options.roomId) {
      wx.showToast({ title: '缺少房间信息', icon: 'none' });
      return;
    }
    this.setData({ roomId: options.roomId });
    await this.enterRoom();
    if (this.data.room) {
      this.watchRoomData();
    }
  },

  // 通过分享进入时若还不是成员，先自动加入房间
  async enterRoom() {
    wx.showLoading({ title: '加载中' });
    try {
      let res = await wx.cloud.callFunction({ name: 'getRoom', data: { roomId: this.data.roomId } });
      if (!res.result.isMember) {
        await wx.cloud.callFunction({ name: 'joinRoom', data: { roomId: this.data.roomId } });
        res = await wx.cloud.callFunction({ name: 'getRoom', data: { roomId: this.data.roomId } });
      }
      this.applyRoomResult(res.result);
    } catch (error) {
      wx.showToast({ title: error.message || '房间不存在或已关闭', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
    } finally { wx.hideLoading(); }
  },

  applyRoomResult(result) {
    const { room, participants, messages, isHost, myReady } = result;
    this.setData({
      room: {
        ...room,
        isReadyState: room.status === 'ready',
        isPendingState: room.status === 'pending'
      }, participants, messages, isHost, myReady,
      lastMessageId: messages.length ? `msg-${messages[messages.length - 1]._id}` : ''
    });
  },

  async loadRoom() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getRoom', data: { roomId: this.data.roomId } });
      this.applyRoomResult(res.result);
    } catch (error) { /* 实时回调里失败不打扰用户 */ }
  },

  onUnload() { this.closeWatchers(); },

  // 把数据库原始房间文档转成页面展示结构
  formatRoom(doc) {
    const statusMap = { recruiting: '招募中', full: '已满', pending: '待房主开始', ready: '全员就绪 · 可以开打', dissolved: '已解散' };
    return {
      _id: doc._id,
      game: doc.game,
      mode: doc.mode || '',
      maxPlayers: doc.maxPlayers,
      startTimeLabel: doc.startTimeLabel || '现在开打',
      remark: doc.remark || '',
      statusText: statusMap[doc.status] || doc.status,
      isReadyState: doc.status === 'ready',
      isPendingState: doc.status === 'pending',
      hostOpenid: doc.hostOpenid
    };
  },

  watchRoomData() {
    const db = wx.cloud.database();
    const roomId = this.data.roomId;
    this.data.roomWatcher = db.collection('rooms').doc(roomId).watch({
      onChange: snapshot => {
        // 软删除：文档还在但 status 变为 dissolved
        if (!snapshot.docs.length || snapshot.docs[0].status === 'dissolved') {
          wx.showToast({ title: '房间已解散', icon: 'none' });
          this.closeWatchers();
          setTimeout(() => wx.navigateBack(), 700);
          return;
        }
        this.setData({ room: this.formatRoom(snapshot.docs[0]) });
      },
      onError: () => {}
    });
    this.data.participantWatcher = db.collection('participants').where({ roomId }).watch({
      onChange: () => this.loadRoom(),
      onError: () => {}
    });
    this.data.messageWatcher = db.collection('messages').where({ roomId }).orderBy('createdAt', 'asc').watch({
      onChange: () => this.loadRoom(),
      onError: () => {}
    });
  },

  closeWatchers() {
    ['roomWatcher', 'participantWatcher', 'messageWatcher'].forEach(key => { if (this.data[key]) this.data[key].close(); });
  },

  onMessageInput(e) { this.setData({ messageContent: e.detail.value }); },

  async sendMessage() {
    const content = this.data.messageContent.trim();
    if (!content) return;
    try {
      await wx.cloud.callFunction({ name: 'sendMessage', data: { roomId: this.data.roomId, content } });
      this.setData({ messageContent: '' });
    } catch (error) { wx.showToast({ title: error.message || '发送失败', icon: 'none' }); }
  },

  async toggleReady() {
    if (!this.data.myReady && roomReadyTemplateId && wx.requestSubscribeMessage) {
      try {
        await new Promise((resolve, reject) => {
          wx.requestSubscribeMessage({ tmplIds: [roomReadyTemplateId], success: resolve, fail: reject });
        });
      } catch (error) {
        // 授权失败不阻断准备状态，云函数仍会正常处理。
      }
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'toggleReady', data: { roomId: this.data.roomId } });
      const result = res.result || {};
      this.setData({ myReady: !!result.ready });
      await this.loadRoom();
    } catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }); }
  },

  async startRoom() {
    wx.showModal({ title: '开始游戏', content: '全员已准备，确定开始吗？将通知队友并锁定房间。', success: async ({ confirm }) => {
      if (!confirm) return;
      try {
        const res = await wx.cloud.callFunction({ name: 'startRoom', data: { roomId: this.data.roomId } });
        const notification = res.result && res.result.notification;
        if (notification && notification.status === 'not_configured') {
          wx.showToast({ title: '已开始，开打提醒尚未配置', icon: 'none' });
        } else if (notification && notification.status === 'unavailable') {
          wx.showToast({ title: '已开始，开打提醒服务不可用', icon: 'none' });
        } else if (notification && notification.failed > 0) {
          const onlyUnsubscribed = notification.unsubscribed === notification.failed;
          wx.showToast({ title: onlyUnsubscribed ? '已开始，部分成员未开启提醒' : '已开始，开打提醒部分发送失败', icon: 'none' });
        } else {
          wx.showToast({ title: '已开始', icon: 'success' });
        }
        await this.loadRoom();
      } catch (error) { wx.showToast({ title: error.message || '开始失败', icon: 'none' }); }
    }});
  },

  leaveRoom() {
    wx.showModal({ title: '退出房间', content: '确定要退出这个房间吗？', success: async ({ confirm }) => {
      if (!confirm) return;
      try { await wx.cloud.callFunction({ name: 'leaveRoom', data: { roomId: this.data.roomId } }); wx.navigateBack(); }
      catch (error) { wx.showToast({ title: error.message || '退出失败', icon: 'none' }); }
    }});
  },

  dissolveRoom() {
    wx.showModal({ title: '解散房间', content: '解散后所有成员都会退出，确定吗？', confirmColor: '#df4d4d', success: async ({ confirm }) => {
      if (!confirm) return;
      try { await wx.cloud.callFunction({ name: 'dissolveRoom', data: { roomId: this.data.roomId } }); wx.reLaunch({ url: '/pages/index/index' }); }
      catch (error) { wx.showToast({ title: error.message || '解散失败', icon: 'none' }); }
    }});
  },

  kickMember(e) {
    wx.showModal({ title: '移除队员', content: '确定将这名队员移出房间吗？', confirmColor: '#df4d4d', success: async ({ confirm }) => {
      if (!confirm) return;
      try { await wx.cloud.callFunction({ name: 'leaveRoom', data: { roomId: this.data.roomId, targetOpenid: e.currentTarget.dataset.openid } }); }
      catch (error) { wx.showToast({ title: error.message || '移除失败', icon: 'none' }); }
    }});
  },

  onShareAppMessage() {
    const { room } = this.data;
    return { title: `上号吧｜${room.game} ${room.mode || '开黑'}，快来上号`, path: `/pages/room-detail/index?roomId=${this.data.roomId}` };
  },

  onShareTimeline() { return this.onShareAppMessage(); }
});
