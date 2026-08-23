'use strict';

// member-item 成员行（V2 准备板）
// 首字方块头像（已准备 = 松绿底）+ 昵称 + 房主标 + 右侧准备状态
// 空位行：虚线分隔 + 「空位 N · 等待加入」

// 昵称为空时的兜底展示名
var DEFAULT_NAME = '神秘玩家';

Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    // 成员 openid（remove 事件回传）
    openid: { type: String, value: '' },
    // 展示昵称（§4.1 displayName，由 getRoom join users 得到）
    displayName: { type: String, value: '' },
    // 是否房主（「房主」标）
    isHost: { type: Boolean, value: false },
    // 准备状态
    ready: { type: Boolean, value: false },
    // 房主视角：是否展示移除按钮
    canRemove: { type: Boolean, value: false },
    // 空位占位行（序号 + 等待加入）
    isEmpty: { type: Boolean, value: false },
    // 空位序号（1 起的位置编号）
    slotIndex: { type: Number, value: 0 }
  },

  data: {
    // 头像首字（昵称首字符，空则取兜底名首字）
    avatarText: ''
  },

  observers: {
    displayName: function (displayName) {
      var name = displayName || DEFAULT_NAME;
      this.setData({ avatarText: name.charAt(0) });
    }
  },

  lifetimes: {
    attached: function () {
      var name = this.data.displayName || DEFAULT_NAME;
      this.setData({ avatarText: name.charAt(0) });
    }
  },

  methods: {
    onRemove: function () {
      this.triggerEvent('remove', { openid: this.data.openid });
    }
  }
});
