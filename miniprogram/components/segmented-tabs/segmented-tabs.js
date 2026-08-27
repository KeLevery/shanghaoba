'use strict';

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    tabs: { type: Array, value: [] },
    current: { type: Number, value: 0 },
    scrollable: { type: Boolean, value: false }
  },

  methods: {
    onTabTap: function (e) {
      var raw = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index;
      var index = Number(raw) || 0;
      this.setData({ current: index });
      this.triggerEvent('change', { index: index });
    }
  }
});
