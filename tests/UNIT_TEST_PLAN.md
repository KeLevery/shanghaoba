# 单元测试（已实现）

本项目已搭建 Jest 单测，覆盖 **10 个云函数** 与 **4 个小程序页面** 的核心逻辑。

## 运行

```bash
npm install          # 首次安装 jest（根目录）
npm test             # 全部测试
npm run test:cloud   # 仅云函数
npm run test:miniprogram  # 仅页面
npm test -- --coverage   # 覆盖率
```

当前结果：**14 个 suite / 39 个用例全部通过**。

## 结构

```
tests/
├─ helpers/
│  ├─ wxServerSdkMock.js      # wx-server-sdk 的内存 mock（云数据库 + openid）
│  └─ miniprogramHarness.js   # Page/getApp/wx 全局 mock + createPage() 工厂
├─ cloudfunctions/            # 10 个云函数各自一套用例
└─ miniprogram/pages/         # index / create-room / room-detail / profile
```

## 设计说明

- **云函数**：用 `jest.mock('wx-server-sdk', ..., { virtual: true })` 注入内存 mock，
  模拟 `add/get/update/remove/where/orderBy/limit/count + db.command.gt/in` 查询链路，
  测试不依赖真实云环境。通过 `cloud.__seed()/__setOpenid()/__collection()` 注入数据与身份。
- **页面**：补齐小程序全局运行时，`createPage()` 深拷贝页面 config 实例化，mock
  `wx.cloud.callFunction/database`，断言 toast / 导航 / data 变化。确认弹窗默认自动确认。
- 覆盖重点：非法输入校验（游戏/人数/时间/超长截断）、权限边界（房主/成员/非成员）、
  满员/过期状态流转、软删除、昵称隐私。

## 已知边界

- 云函数 mock 不实现 `watch`（云函数内未使用）；页面 watch 用可 close 的桩代替。
- 页面测试为逻辑冒烟级，不渲染 WXML；如需真渲染需引入 `miniprogram-simulate`。
