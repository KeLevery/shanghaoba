// ============================================================
// room-detail 房间详情页
// 保留 🔒 业务逻辑：分享自动入房、3 watcher 实时监听、
// 操作映射（toggleReady/startRoom/leaveRoom/dissolveRoom/sendMessage）、
// 订阅消息诚实提示、分享带 roomId。
// 性能改造：participants/messages watcher 不再触发 getRoom 全量重拉，
// 改为快照本地重建 / 增量 append（_id 去重、createdAt 排序防乱序）。
// ============================================================

const { call, formatStartTime } = require('../../utils/cloud');
const { roomReadyTemplateId } = require('../../config/notification');
const games = require('../../utils/games');

// 房间状态 → 文案（状态机见交接文档 §4.3）
const STATUS_TEXT = {
  recruiting: '招募中',
  full: '已满员',
  pending: '待房主开始',
  ready: '全员就绪 · 可以开打',
  dissolved: '已解散'
};

Page({
  data: {
    roomId: '',
    room: null,
    participants: [],
    messages: [],
    isHost: false,
    myReady: false,
    messageContent: '',
    // 满员进度条宽度（百分比数字）
    fillPct: 0,
    // 聊天滚动锚点（scroll-into-view 目标 id）
    lastMessageId: '',
    // 成员准备进度展示用
    readyCount: 0,
    // 房主昵称（信息卡展示）
    hostName: '',
    // 空位序号列表（等待加入占位行）
    emptySlots: [],
    // 核心作战室 Tab 分段：0=成员, 1=聊天, 2=设置
    activeTab: 0,
    tabs: ['成员', '聊天', '设置']
  },

  async onLoad(options) {
    if (!options.roomId) {
      wx.showToast({ title: '缺少房间信息', icon: 'none' });
      return;
    }
    var initialTab = options.tab === 'chat' ? 1 : 0;
    // 实例字段（不进 data，避免无谓 setData）：
    this._myOpenid = ''; // 本人 openid（用于聊天左右气泡）
    this._knownMsgIds = {}; // 消息 _id 去重表（防 watcher 乱序/重复事件）
    this._nameMap = {}; // openid → displayName（watcher 快照只有原始字段）
    this._lastSentMessageId = ''; // 最近一次 sendMessage 返回的 messageId
    this._hydrateTimer = null; // 昵称补水防抖定时器
    this.setData({ roomId: options.roomId, activeTab: initialTab });
    await this.enterRoom();
    if (this.data.room) {
      this.watchRoomData();
      this.resolveMyOpenid();
    }
  },

  // 通过分享进入时若还不是成员，先自动加入房间（🔒 分享即入房）
  async enterRoom() {
    try {
      let result = await call('getRoom', { roomId: this.data.roomId }, { loading: '加载中', toastError: false });
      if (!result.isMember) {
        await call('joinRoom', { roomId: this.data.roomId }, { loading: false, toastError: false });
        result = await call('getRoom', { roomId: this.data.roomId }, { loading: false, toastError: false });
        wx.showToast({ title: '已成功加入房间', icon: 'success' });
      }
      this.applyRoomResult(result);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '房间不存在或已关闭', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
    }
  },

  // 满员进度百分比（进度条宽度）：maxPlayers<=0 时兜底 0
  computeFillPct(memberCount, maxPlayers) {
    const total = Number(maxPlayers) || 0;
    if (!total) {
      return 0;
    }
    return Math.min(Math.round((memberCount / total) * 100), 100);
  },

  // getRoom 全量结果落地（首屏与显式重拉共用）
  applyRoomResult(result) {
    const room = result.room;
    const participants = result.participants || [];
    const messages = result.messages || [];
    // 重建昵称映射与消息去重表（全量结果为权威数据）
    this._nameMap = {};
    participants.forEach(p => { this._nameMap[p.openid] = p.displayName || ''; });
    this._knownMsgIds = {};
    messages.forEach(m => { this._knownMsgIds[m._id] = true; });
    // 房主身份可直接推得本人 openid
    if (result.isHost && room.hostOpenid) {
      this._myOpenid = room.hostOpenid;
    }
    this.setData({
      room: this.formatRoom(room),
      participants: participants,
      messages: this.decorateMessages(messages),
      isHost: !!result.isHost,
      myReady: !!result.myReady,
      readyCount: this.countReady(participants),
      hostName: this.findHostName(participants),
      emptySlots: this.computeSlots(participants.length, room.maxPlayers),
      fillPct: this.computeFillPct(participants.length, room.maxPlayers),
      lastMessageId: messages.length ? 'msg-' + messages[messages.length - 1]._id : ''
    });
  },

  // 取房主昵称（participants 中 isHost 者）
  findHostName(participants) {
    const host = (participants || []).filter(function (p) { return p.isHost; })[0];
    return host ? (host.displayName || '神秘玩家') : '';
  },

  // 空位序号：从当前人数 +1 到 maxPlayers
  computeSlots(memberCount, maxPlayers) {
    const slots = [];
    const total = Number(maxPlayers) || 0;
    for (let i = memberCount + 1; i <= total; i++) {
      slots.push(i);
    }
    return slots;
  },

  // 静默全量重拉：仅在本人操作后或需补水昵称时使用（🔒 契约不变）
  async loadRoom() {
    try {
      const result = await call('getRoom', { roomId: this.data.roomId }, { loading: false, toastError: false });
      this.applyRoomResult(result);
    } catch (error) {
      // 实时回调里失败不打扰用户
    }
  },

  // 查询本人 openid：users 集合「仅创建者可读写」，客户端只能查到本人记录
  async resolveMyOpenid() {
    if (this._myOpenid) {
      return;
    }
    try {
      const res = await wx.cloud.database().collection('users').limit(1).get();
      if (res.data && res.data.length && res.data[0].openid) {
        this._myOpenid = res.data[0].openid;
        this.refreshSelfFlags();
      }
    } catch (error) {
      // 查询失败不阻断页面，气泡仅少「本人靠右」样式
    }
  },

  // 把数据库原始房间文档转成页面展示结构
  formatRoom(doc) {
    const gameConf = games.findGame(doc.game);
    return {
      _id: doc._id,
      game: doc.game,
      gameColor: gameConf ? gameConf.color : '#9c978a',
      mode: doc.mode || '',
      maxPlayers: doc.maxPlayers,
      startTimeLabel: formatStartTime(doc.startTimeLabel),
      remark: doc.remark || '',
      // 邀请码：createRoom 落地时生成；历史存量房间无此字段则为空串（前端隐藏该行）
      inviteCode: doc.inviteCode || '',
      status: doc.status,
      statusText: STATUS_TEXT[doc.status] || doc.status,
      isReadyState: doc.status === 'ready',
      isPendingState: doc.status === 'pending',
      hostOpenid: doc.hostOpenid
    };
  },

  // 消息补充展示字段：isSelf（本人靠右）+ displayName 兜底
  decorateMessages(list) {
    const self = this;
    return list.map(function (m) {
      return {
        _id: m._id,
        openid: m.openid || '',
        content: m.content,
        displayName: m.displayName || self._nameMap[m.openid] || '',
        createdAt: m.createdAt,
        isSelf: !!self._myOpenid && m.openid === self._myOpenid
      };
    });
  },

  // myOpenid 后补到位时，重刷历史消息的 isSelf 标记
  refreshSelfFlags() {
    if (!this._myOpenid || !this.data.messages.length) {
      return;
    }
    const self = this;
    const messages = this.data.messages.map(function (m) {
      m.isSelf = m.openid === self._myOpenid;
      return m;
    });
    this.setData({ messages: messages });
  },

  countReady(participants) {
    return participants.filter(p => !!p.ready).length;
  },

  // ---- 3 个 watcher（🔒 架构不变；onUnload 统一 close）----
  watchRoomData() {
    const db = wx.cloud.database();
    const roomId = this.data.roomId;

    // 房间文档：状态变化直接 formatRoom 更新，不重拉
    this._roomWatcher = db.collection('rooms').doc(roomId).watch({
      onChange: snapshot => {
        // 软删除：文档还在但 status 变为 dissolved（🔒）
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

    // 成员集合：用快照本地重建列表（docs 即当前权威全量），不再重拉 getRoom
    this._participantWatcher = db.collection('participants').where({ roomId }).watch({
      onChange: snapshot => this.applyParticipantSnapshot(snapshot),
      onError: () => {}
    });

    // 消息集合：只增量 append 新增消息（_id 去重 + createdAt 排序防乱序）
    this._messageWatcher = db.collection('messages').where({ roomId }).orderBy('createdAt', 'asc').watch({
      onChange: snapshot => this.appendNewMessages(snapshot),
      onError: () => {}
    });
  },

  // participants 快照增量应用：快照不含 join 的昵称，沿用本地昵称映射；
  // 出现陌生 openid（新成员加入）时防抖重拉一次 getRoom 补水昵称
  applyParticipantSnapshot(snapshot) {
    const docs = snapshot.docs || [];
    const nameMap = this._nameMap;
    let hasUnknownName = false;
    const participants = docs.map(function (d) {
      const known = Object.prototype.hasOwnProperty.call(nameMap, d.openid);
      if (!known) {
        nameMap[d.openid] = '';
        hasUnknownName = true;
      }
      return {
        openid: d.openid,
        displayName: nameMap[d.openid],
        isHost: !!d.isHost,
        ready: !!d.ready
      };
    });
    // 本人准备状态可能被其他端修改，保持 myReady 同步
    if (this._myOpenid) {
      const mine = participants.filter(p => p.openid === this._myOpenid)[0];
      if (mine && mine.ready !== this.data.myReady) {
        this.setData({ myReady: mine.ready });
      }
    }
    this.setData({
      participants: participants,
      readyCount: this.countReady(participants),
      hostName: this.findHostName(participants),
      emptySlots: this.computeSlots(participants.length, this.data.room && this.data.room.maxPlayers),
      fillPct: this.computeFillPct(participants.length, this.data.room && this.data.room.maxPlayers)
    });
    if (hasUnknownName) {
      this.scheduleHydrateNames();
    }
  },

  // 新成员昵称补水：防抖合并，避免连续入房放大请求
  scheduleHydrateNames() {
    if (this._hydrateTimer) {
      clearTimeout(this._hydrateTimer);
    }
    this._hydrateTimer = setTimeout(() => {
      this._hydrateTimer = null;
      this.loadRoom();
    }, 800);
  },

  // messages 快照增量 append：仅处理未知 _id，排序防乱序，不重拉全量
  appendNewMessages(snapshot) {
    const docs = snapshot.docs || [];
    const known = this._knownMsgIds;
    const fresh = [];
    docs.forEach(function (d) {
      if (!known[d._id]) {
        known[d._id] = true;
        fresh.push(d);
      }
    });
    if (!fresh.length) {
      return;
    }
    // 兜底：从自己刚发出的消息快照里学回本人 openid
    if (!this._myOpenid && this._lastSentMessageId) {
      const mine = fresh.filter(d => d._id === this._lastSentMessageId)[0];
      if (mine) {
        this._myOpenid = mine.openid;
      }
    }
    const appended = this.decorateMessages(fresh);
    // watcher 事件可能乱序到达，合并后按 createdAt 统一排序（量级 ≤ 百余条，开销可忽略）
    const messages = this.data.messages.concat(appended).sort(function (a, b) {
      return a.createdAt - b.createdAt;
    });
    this.setData({
      messages: messages,
      lastMessageId: 'msg-' + messages[messages.length - 1]._id
    });
  },

  closeWatchers() {
    const self = this;
    ['_roomWatcher', '_participantWatcher', '_messageWatcher'].forEach(function (key) {
      if (self[key]) {
        self[key].close();
        self[key] = null;
      }
    });
    if (this._hydrateTimer) {
      clearTimeout(this._hydrateTimer);
      this._hydrateTimer = null;
    }
  },

  onUnload() {
    this.closeWatchers();
  },

  // ---- 聊天 ----
  // 复制邀请码：没收到分享卡片的朋友，靠口头转告的码也能进房
  copyInvite() {
    const code = (this.data.room && this.data.room.inviteCode) || '';
    if (!code) {
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' })
    });
  },

  onMessageInput(e) {
    this.setData({ messageContent: e.detail.value });
  },

  async sendMessage() {
    const content = this.data.messageContent.trim();
    if (!content) {
      return;
    }
    try {
      const result = await call('sendMessage', { roomId: this.data.roomId, content: content }, { loading: false });
      this._lastSentMessageId = (result && result.messageId) || '';
      this.setData({ messageContent: '' });
      // 新消息由 messageWatcher 增量 append，无需手动刷新
    } catch (error) {
      // call 已 toast
    }
  },

  // ---- 准备 / 开始 / 退出 / 解散 / 移除（🔒 操作映射不变）----
  async toggleReady() {
    // 配置过模板时，准备前请求订阅授权；授权失败不阻断准备流程（🔒 诚实行为）
    if (!this.data.myReady && roomReadyTemplateId && wx.requestSubscribeMessage) {
      try {
        await new Promise(function (resolve, reject) {
          wx.requestSubscribeMessage({ tmplIds: [roomReadyTemplateId], success: resolve, fail: reject });
        });
      } catch (error) {
        // 用户拒绝授权不影响 toggleReady
      }
    }
    try {
      const result = await call('toggleReady', { roomId: this.data.roomId });
      this.setData({ myReady: !!(result && result.ready) });
      // 本人操作后重拉一次，校准房间状态与成员数据
      await this.loadRoom();
    } catch (error) {
      // call 已 toast
    }
  },

  startRoom() {
    wx.showModal({
      title: '开始游戏',
      content: '全员已准备，确定开始吗？将通知队友并锁定房间。',
      success: async ({ confirm }) => {
        if (!confirm) {
          return;
        }
        try {
          const result = await call('startRoom', { roomId: this.data.roomId });
          this.toastNotification(result && result.notification);
          await this.loadRoom();
        } catch (error) {
          // call 已 toast
        }
      }
    });
  },

  // 按 notification.status 诚实提示（🔒 绝不伪造已推送）
  toastNotification(notification) {
    if (!notification) {
      wx.showToast({ title: '已开始', icon: 'success' });
      return;
    }
    if (notification.status === 'not_configured') {
      wx.showToast({ title: '已开始，开打提醒尚未配置', icon: 'none' });
      return;
    }
    if (notification.status === 'unavailable') {
      wx.showToast({ title: '已开始，开打提醒服务不可用', icon: 'none' });
      return;
    }
    if (notification.status === 'sent') {
      wx.showToast({ title: '已开始，已通知队友', icon: 'success' });
      return;
    }
    if (notification.status === 'partial') {
      const onlyUnsubscribed = notification.unsubscribed > 0 && notification.unsubscribed === notification.failed;
      wx.showToast({ title: onlyUnsubscribed ? '已开始，部分成员未开启提醒' : '已开始，开打提醒部分发送失败', icon: 'none' });
      return;
    }
    if (notification.status === 'failed') {
      wx.showToast({ title: '已开始，开打提醒发送失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已开始', icon: 'success' });
  },

  leaveRoom() {
    wx.showModal({
      title: '退出房间',
      content: '确定要退出这个房间吗？',
      success: async ({ confirm }) => {
        if (!confirm) {
          return;
        }
        try {
          await call('leaveRoom', { roomId: this.data.roomId });
          wx.navigateBack();
        } catch (error) {
          // call 已 toast
        }
      }
    });
  },

  dissolveRoom() {
    wx.showModal({
      title: '解散房间',
      content: '解散后所有成员都会退出，确定吗？',
      confirmColor: '#ff5c6c',
      success: async ({ confirm }) => {
        if (!confirm) {
          return;
        }
        try {
          await call('dissolveRoom', { roomId: this.data.roomId });
          wx.reLaunch({ url: '/pages/index/index' });
        } catch (error) {
          // call 已 toast
        }
      }
    });
  },

  // 房主移除队员：member-item remove 事件回传 { openid }
  onRemoveMember(e) {
    const targetOpenid = e.detail && e.detail.openid;
    if (!targetOpenid) {
      return;
    }
    wx.showModal({
      title: '移除队员',
      content: '确定将这名队员移出房间吗？',
      confirmColor: '#ff5c6c',
      success: async ({ confirm }) => {
        if (!confirm) {
          return;
        }
        try {
          await call('leaveRoom', { roomId: this.data.roomId, targetOpenid: targetOpenid });
          // 成员变化由 participantWatcher 驱动刷新
        } catch (error) {
          // call 已 toast
        }
      }
    });
  },

  // 🔒 分享卡片带 roomId，非成员打开自动入房
  onShareAppMessage() {
    const room = this.data.room || {};
    return {
      title: '上号吧｜' + (room.game || '组队') + ' ' + (room.mode || '开黑') + '，快来上号',
      path: '/pages/room-detail/index?roomId=' + this.data.roomId
    };
  },

  onShareTimeline() {
    return this.onShareAppMessage();
  },

  onTabChange(e) {
    var raw = (e && e.detail && typeof e.detail.index === 'number')
      ? e.detail.index
      : (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
    var index = Number(raw) || 0;
    this.setData({ activeTab: index });
  }
});

