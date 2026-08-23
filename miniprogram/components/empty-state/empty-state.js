'use strict';

// empty-state 空状态（V2：虚线方框记号替代 emoji 图标）
Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    // 主文案
    title: { type: String, value: '暂无内容' },
    // 辅助说明（为空不展示）
    description: { type: String, value: '' },
    // 按钮文案（为空不展示按钮）
    buttonText: { type: String, value: '' }
  },

  methods: {
    onAction: function () {
      this.triggerEvent('action');
    }
  }
});
