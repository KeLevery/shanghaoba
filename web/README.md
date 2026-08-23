# 上号吧 · 网页运行时

在浏览器里直接运行本小程序项目：**页面代码与云函数代码都是仓库里的真实源码**，
微信 `wx` API 与云开发由本地 Node 服务模拟（云函数后端复用 `tests/helpers/wxServerSdkMock`
的内存数据库）。

## 启动

```bash
npm run web        # 或 node web/server.js
```

默认地址 <http://localhost:8787>（可用 `PORT=xxx` 改端口），Windows 下会自动打开浏览器。

## 它跑了什么

- `miniprogram/` 下的页面 JS / WXML / WXSS / 组件原样加载执行（浏览器端轻量运行时）
- `cloudfunctions/` 下的云函数在本地 Node 进程真实执行（`wx-server-sdk` 被 require 钩子
  指向内存 mock），与单测共用同一套后端模拟
- 房间详情页的 3 个数据库 watcher 通过 1.2s 轮询 `/api/db` 实现，因此**两个浏览器窗口
  用不同玩家身份可以近实时联动**（准备、聊天互相同步）

## 外壳功能

| 功能 | 说明 |
| --- | --- |
| 当前玩家 | 切换 u-kele / u-awei / u-xiaomei / u-laowang 四个演示身份 |
| 双开第二玩家 | 新窗口以另一个身份打开，模拟联机 |
| 重置演示数据 | 重新跑一遍种子（通过真实云函数生成 3 个房间与聊天记录） |
| 回到大厅 | reLaunch 回首页 |

## 目录

```
web/
  server.js            # Node 服务：静态文件 + /api/cloud/* + /api/db + 种子
  public/index.html    # 手机外壳 + 控制条
  public/runtime/      # 浏览器运行时
    expr.js            # {{}} 表达式求值
    wxml.js            # WXML 解析 + vnode 构建 + DOM 增量 patch
    wxapi.js           # wx API 模拟（toast/modal/存储/云函数/数据库 watcher）
    loader.js          # 小程序文件拉取 + CommonJS 模块系统
    core.js            # App/Page/Component、页面栈、TabBar、样式注入、下拉刷新
    testdrive.js       # ?scenario= 自动化驱动（自测用，平时不加载）
```

## 自动化自测

带 `?scenario=` 打开页面会在页面内用真实 DOM 事件驱动并输出结果条：

- `?scenario=room-flow&route=pages/room-detail/index&roomId=rooms_5` — 准备 + 聊天（watcher 回显）
- `?scenario=create-room` — TabBar 切页 + 发起上号 + 自动进入房间
- `?scenario=dual-user&route=pages/room-detail/index&roomId=rooms_5` — 另一身份发消息，本页同步

## 已知边界

- 只实现了本项目用到的小程序语法子集（wx:if/for、插值、自定义组件、常用事件等）
- 订阅消息、分享到微信等平台能力为本地模拟（分享按钮会展示可复制的分享路径）
- 数据在服务器内存中，重启服务即还原
