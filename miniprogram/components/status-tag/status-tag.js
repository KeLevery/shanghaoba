'use strict';

// status-tag 状态标（V2 纸面风：小方标，进行中=绿实心，其余描边）
// 状态机见开发交接文档 §4.3
var STATUS_MAP = {
  recruiting: { text: '招募中', modifier: 'recruiting' },
  full: { text: '已满员', modifier: 'full' },
  pending: { text: '等待开始', modifier: 'pending' },
  ready: { text: '进行中', modifier: 'ready' },
  dissolved: { text: '已解散', modifier: 'dissolved' }
};

var FALLBACK = { text: '未知状态', modifier: 'dissolved' };

Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    // 房间状态：recruiting/full/pending/ready/dissolved
    status: {
      type: String,
      value: 'recruiting'
    }
  },

  data: {
    text: '',
    modifier: 'recruiting'
  },

  observers: {
    status: function (status) {
      var conf = STATUS_MAP[status] || FALLBACK;
      this.setData({ text: conf.text, modifier: conf.modifier });
    }
  },

  lifetimes: {
    attached: function () {
      var conf = STATUS_MAP[this.data.status] || FALLBACK;
      this.setData({ text: conf.text, modifier: conf.modifier });
    }
  }
});
