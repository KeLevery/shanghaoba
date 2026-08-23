'use strict';

// chat-bubble 聊天气泡（V2：本人 = 墨色气泡反白；他人 = 纸底描边气泡）

// 数字补零（如 7 → '07'）
function padZero(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 时间戳格式化为 HH:mm（当天）或 M月D日 HH:mm（跨天）
function formatTime(timestamp) {
  if (!timestamp) {
    return '';
  }
  var date = new Date(timestamp);
  var now = new Date();
  var hm = padZero(date.getHours()) + ':' + padZero(date.getMinutes());
  var sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return hm;
  }
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + hm;
}

Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },

  properties: {
    // 消息内容（≤200 字）
    content: { type: String, value: '' },
    // 发送者昵称（自己发送时可为空，不展示）
    displayName: { type: String, value: '' },
    // 发送时间戳(ms)，组件内格式化为 HH:mm
    createdAt: { type: Number, value: 0 },
    // 是否本人发送：右侧墨色气泡
    isSelf: { type: Boolean, value: false }
  },

  data: {
    timeText: ''
  },

  observers: {
    createdAt: function (createdAt) {
      this.setData({ timeText: formatTime(createdAt) });
    }
  },

  lifetimes: {
    attached: function () {
      this.setData({ timeText: formatTime(this.data.createdAt) });
    }
  }
});
