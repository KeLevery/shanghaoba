// 自定义 TabBar（参考图样式）：第 2 项为凸起青柠绿＋按钮
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/index/index', text: '大厅', icon: 'home' },
      { pagePath: 'pages/create-room/index', text: '发起上号', fab: true },
      { pagePath: 'pages/messages/index', text: '消息', icon: 'chat' },
      { pagePath: 'pages/profile/index', text: '我的', icon: 'user' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      if (index === this.data.selected) return;
      wx.switchTab({ url: '/' + path });
    }
  }
});
