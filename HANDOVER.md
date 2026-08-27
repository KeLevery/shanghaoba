# Agent 交接文档（HANDOVER）

> **交接时间**：2026-08-27
> **交接方**：Claude Code 会话（Opus 4.8）
> **用途**：供接手的 agent 快速恢复上下文。
> **注意**：本文档是**会话/任务状态交接**；项目级的业务规则、数据契约、云函数清单请先读 `开发交接文档.md`（其中 🔒 条款为硬性约束，不可偏离）。

---

## 1. 仓库当前状态（2026-08-27 已核实）

- 分支 `main`，**工作区干净**（无未提交改动）。
- **`main` 领先 `origin/main` 2 个提交，均未 push**：
  | 提交 | 说明 | 来源 |
  |---|---|---|
  | `0da29b2` | feat: 邀请码直达进房 + 建房自定义游戏名与人数滑块 + 首页去重与预览运行时补齐（50 文件，+991/−150） | 本会话 |
  | `8f85d9d` | feat: V2 深色电竞风全站重构 + 网页预览运行时 + 交互与状态修复 | 上一会话 |
- 远端：`origin` → `git@github.com:KeLevery/shanghaoba.git`。

## 2. 本会话做了什么

1. 用户要求「把最新版 git 一下」→ 逐文件核实 diff 后提交 `0da29b2`。改动实质：
   - 邀请码进房链路：`createRoom` 云函数生成 4 位 `inviteCode` → `getRoom`/房间详情透传 → 详情页复制 → 首页输入框按码进房（`onJoinByCode`）。
   - 建房页：「其他游戏」自定义游戏名输入（≤20 字）；人数快捷按钮改为可拖拽滑块（2–20 刻度）。
   - 首页「正在召集」区过滤已加入房间（去重）。
   - 网页预览运行时补齐滑块拖拽 / wxapi 支持；新增 `createRoom`、首页测试；更新 `开发交接文档.md`。
2. 回答了技术栈问题（见 §4）。
3. **用户尚未确认是否 push**——见 §3 待办 1。

## 3. 待办（接手后按序处理）

1. **确认是否 push**：`main` ahead 2。上一会话结束时用户未答复是否推送。**推送前必须先问用户**，不要擅自 push。
2. **Trellis 任务 `review-pr-and-test`（status=planning）状态与内容不一致，需要向用户澄清后走流程**：
   - `prd.md` 的验收项**已全部勾选**，审查 findings 已写入 prd.md（并发超员、孤儿房间、测试缺口等，均带文件:行号）。
   - 但任务从未 `task.py start`，也未走 finish/archive 流程，`task.json` 仍为 `planning`。
   - findings 中的**修复项等待用户对修复优先级的指示**（prd.md「Blocking Open Questions」原文）。用户未指示前，不要擅自动手改产品代码。
3. 注意 `prd.md` 中「用户确认无 git 管理」的表述**已过时**——项目自 `b77defb`（initial commit）起已有 git 管理，现在也已有 GitHub 远端。

## 4. 技术栈速览（全部来自配置/源码证据）

| 层 | 技术 |
|---|---|
| 客户端 | 微信**原生**小程序（WXML/WXSS/JS，`Page()` API），基础库 3.5.0，无 Taro/uni-app/React/Vue，客户端零 npm 依赖（`project.config.json` `nodeModules: false`） |
| 后端 | 微信云开发：11 个云函数（Node.js + `wx-server-sdk ~2.6.3`），云端数据库 |
| 网页预览 | `web/server.js` 纯 Node `http`（无 Express）；浏览器端自研 runtime（`web/public/runtime/`：loader/wxapi/wxml）跑真实小程序代码；服务端用 `Module._resolveFilename` 钩子把 `wx-server-sdk` 指向内存 mock（`tests/helpers/wxServerSdkMock.js`） |
| 测试 | Jest ^29.7.0；`tests/cloudfunctions` + `tests/miniprogram` 两套；最近一次全量结果 15 suite / 49 用例全通过（见 prd.md） |

## 5. 常用命令

```bash
npm test                 # 全量 Jest
npm run test:cloud       # 云函数套
npm run test:miniprogram # 页面逻辑套
npm run web              # 网页预览运行时（默认端口 8787）
```

## 6. 关键约定与坑

- **提交风格**：中文 conventional commit（如 `feat: ...`），正文分条列改动；提交尾注带 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **git 的 LF/CRLF 警告**（`LF will be replaced by CRLF`）是 Windows 下自动换行转换的正常提示，可忽略。
- **web 预览运行时并发**：mock 的 openid 是全局态，所有云函数请求走串行队列（`web/server.js:42-48`），改 server 时别破坏这一点。
- **时间比较**：本地运行时 `expireAt` 经 JSON 序列化后是 ISO 字符串，与数字直接比较会得 NaN——需 `new Date(x).getTime()`（参考 `miniprogram/pages/index/index.js` `onJoinByCode` 的注释）。
- **已知未修问题**（审查 findings，等用户定优先级）：
  - `joinRoom` check-then-add 非原子，并发可超员（`cloudfunctions/joinRoom/index.js:23-40`）。
  - `createRoom` 的 rooms.add + participants.add 非事务，可能遗留孤儿房间（`cloudfunctions/createRoom/index.js:21-46`）。
  - 测试缺口：`createRoom` 三条输入校验分支、`toggleReady` 通知主路径未覆盖。
  - ⚠️ 注意 `开发交接文档.md` §2.2 声称 joinRoom 有「二次 count 校验 + 补偿删除」，与上述审查 finding 表述存在张力，动这块代码前先读两处原文。
- **`demo/` 目录**：仅 Playwright 端到端测试用的 HTML 镜像（localStorage 模拟库），**不是**真实应用，勿当作线上实现参考。
- **`AGENTS.md`** 中 `TRELLIS:START/END` 块由 `trellis update` 管理，勿手改块内内容。

## 7. 文档索引

| 文件 | 内容 | 优先级 |
|---|---|---|
| `开发交接文档.md` | 项目级交接：业务规则 🔒、数据契约、12 个云函数入参返回、权限模型 | **先读** |
| `.trellis/tasks/08-12-review-pr-and-test/prd.md` | 当前任务：审查 findings（带文件:行号）+ 待用户决策项 | 接手任务时读 |
| `.trellis/workflow.md` | Trellis 三阶段工作流（Plan/Execute/Finish） | 走流程时读 |
| `tests/UNIT_TEST_PLAN.md` | 测试规划（含 miniprogram-simulate 未接入说明） | 动测试时读 |
| `web/README.md` | 网页预览运行时说明 | 动 web/ 时读 |
