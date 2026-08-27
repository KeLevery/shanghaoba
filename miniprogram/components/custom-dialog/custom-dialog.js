'use strict';

Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: function (val) {
        var self = this;
        if (val) {
          setTimeout(function () {
            self.setData({ animating: true });
          }, 20);
        } else {
          this.setData({ animating: false });
        }
      }
    },
    title: { type: String, value: '提示' },
    content: { type: String, value: '' },
    confirmText: { type: String, value: '确认' },
    cancelText: { type: String, value: '取消' },
    showCancel: { type: Boolean, value: true },
    type: { type: String, value: 'default' }, // 'default' | 'danger'
    loading: { type: Boolean, value: false }
  },

  data: {
    animating: false
  },

  methods: {
    preventTouchMove: function () {},
    onCancel: function () {
      if (this.data.loading) return;
      this.triggerEvent('cancel');
    },
    onConfirm: function () {
      if (this.data.loading) return;
      this.triggerEvent('confirm');
    }
  }
});
