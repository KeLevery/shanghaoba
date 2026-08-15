/**
 * 小程序页面测试脚手架。
 *
 * 小程序页面文件依赖全局 `Page()` / `getApp()` / `wx` 运行时，这里在
 * 单测环境中补齐这些全局对象，并提供一个 createPage() 工厂：读取页面文件
 * 注册的 config，深拷贝出可独立调用的页面实例（含 data + setData）。
 *
 * 使用方式（每个页面测试文件）：
 *   const { reset, createPage, wxState } = require('../../helpers/miniprogramHarness');
 *   beforeEach(reset);
 *   const page = createPage();   // 需先 require 对应页面文件
 *
 * 需要在用例里覆写 wx.cloud.callFunction / wx.cloud.database。
 */

let pages = [];
let lastConfig = null;

global.Page = (config) => { pages.push(config); lastConfig = config; };
global.getApp = () => ({ globalData: { user: null } });
global.wx = global.wx || {};

const wxState = {
  toasts: [],
  modals: [],
  navigations: []
};

global.wx = {
  showToast(o) { wxState.toasts.push(o); },
  hideToast() {},
  showLoading() {},
  hideLoading() {},
  navigateTo(o) { wxState.navigations.push(o); },
  redirectTo(o) { wxState.navigations.push(o); },
  navigateBack() { wxState.navigations.push({ back: true }); },
  reLaunch(o) { wxState.navigations.push(o); },
  requestSubscribeMessage: jest.fn().mockResolvedValue({}),
  showModal(o) { wxState.modals.push(o); if (o.success) o.success({ confirm: true, cancel: false }); },
  cloud: {
    callFunction: () => { throw new Error('wx.cloud.callFunction 未在测试中 stub'); },
    database: () => { throw new Error('wx.cloud.database 未在测试中 stub'); }
  }
};

function reset() {
  wxState.toasts = [];
  wxState.modals = [];
  wxState.navigations = [];
  wx.cloud.callFunction = jest.fn().mockRejectedValue(new Error('callFunction 未 stub'));
  wx.requestSubscribeMessage = jest.fn().mockResolvedValue({});
  wx.cloud.database = jest.fn().mockImplementation(() => { throw new Error('database 未 stub'); });
}

// 取已注册的页面 config 实例化（页面文件在模块加载时注册一次，reset 不清空）
function createPage(index) {
  const config = index == null ? lastConfig : pages[index];
  if (!config) throw new Error('没有找到已注册的 Page，请先 require 页面文件');
  const page = { ...config };
  page.data = JSON.parse(JSON.stringify(config.data || {}));
  page.setData = function (obj) { Object.assign(this.data, obj); };
  return page;
}

module.exports = { reset, createPage, wxState };
