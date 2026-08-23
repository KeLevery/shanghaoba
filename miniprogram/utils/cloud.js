// ============================================================
// cloud.js — 统一云函数调用封装 + 通用格式化工具
// 业务页面一律通过 call() 调云函数，
// 禁止直接 wx.cloud.callFunction、禁止各自手写错误 toast。
// ============================================================

// 默认错误提示文案
const DEFAULT_ERROR_TEXT = '网络开小差了';

/**
 * 统一调用云函数
 * @param {string} name 云函数名（见交接文档 §4.3 的 12 个接口）
 * @param {object} [data] 入参 event
 * @param {object} [options] 调用选项
 * @param {boolean|string} [options.loading=true] 是否展示加载态；
 *   传字符串则作为 loading 文案；传 false 关闭
 * @param {boolean} [options.toastError=true] 失败时是否自动 toast 错误信息
 * @returns {Promise<any>} resolve 云函数返回的 result；reject 原始错误
 */
function call(name, data, options) {
  const opts = options || {};
  const showLoading = opts.loading !== false;
  const toastError = opts.toastError !== false;
  const loadingText = typeof opts.loading === 'string' ? opts.loading : '加载中';

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  return wx.cloud
    .callFunction({ name: name, data: data || {} })
    .then(function (res) {
      return res.result;
    })
    .catch(function (err) {
      if (toastError) {
        wx.showToast({
          title: (err && err.message) || DEFAULT_ERROR_TEXT,
          icon: 'none'
        });
      }
      throw err;
    })
    .then(function (result) {
      if (showLoading) {
        wx.hideLoading();
      }
      return result;
    }, function (err) {
      if (showLoading) {
        wx.hideLoading();
      }
      throw err;
    });
}

/**
 * 数字补零
 * @param {number} n
 * @returns {string}
 */
function padZero(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 格式化时间戳为「HH:mm」；非当天则带「M月D日」前缀
 * @param {number} ts 毫秒时间戳
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) {
    return '';
  }
  const date = new Date(ts);
  const now = new Date();
  const time = padZero(date.getHours()) + ':' + padZero(date.getMinutes());
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return time;
  }
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + time;
}

/**
 * 格式化开打时间标签（§4.1 startTimeLabel 枚举）
 * @param {string} label 现在开打 / 今晚 / 明天 / 自定义时间
 * @returns {string}
 */
function formatStartTime(label) {
  return label || '现在开打';
}

module.exports = {
  call: call,
  formatTime: formatTime,
  formatStartTime: formatStartTime
};
