# 上号吧 · 微信小程序

喊朋友一起打游戏的熟人上号工具。支持：无畏契约、三角洲行动、CS2、英雄联盟、永劫无间。

## 功能（MVP）
- 发起上号：选游戏、模式/地图、人数、开打时间、备注
- 房间管理：成员列表、准备状态、房主移除队员、解散/退出房间
- 简单聊天：房间内文字聊天（实时）
- 资料：设置游戏昵称
- 房间 2 小时无活动自动过期（列表不再显示）

## 技术栈
- 原生微信小程序 + 微信云开发（Cloud Functions + Cloud Database）
- 实时能力：云数据库 watch（客户端实时监听）

## 目录结构
```
├─ project.config.json          # 开发者工具项目配置
├─ miniprogram/                 # 小程序前端
│  ├─ app.js                    # 云环境初始化（需替换 env）
│  ├─ app.json
│  ├─ app.wxss
│  └─ pages/
│     ├─ index/                 # 首页：正在召集的房间列表
│     ├─ create-room/           # 发起上号
│     ├─ room-detail/           # 房间详情（成员/准备/聊天）
│     └─ profile/               # 我的（游戏昵称）
└─ cloudfunctions/              # 云函数
   ├─ createRoom/               # 创建房间（自动成为房主）
   ├─ listRooms/                # 列出招募中的房间
   ├─ listMyRooms/              # 列出我的全部未解散房间
   ├─ getRoom/                  # 房间详情（成员+消息+我的状态）
   ├─ joinRoom/                 # 加入房间
   ├─ toggleReady/              # 切换准备状态（全员准备进入「待开打」）
   ├─ startRoom/                # 房主正式开始，锁房并发送提醒
   ├─ leaveRoom/                # 退出 / 房主移除队员
   ├─ dissolveRoom/             # 房主解散房间（软删除）
   ├─ sendMessage/              # 发送聊天消息
   ├─ getProfile/               # 获取游戏昵称
   └─ saveProfile/              # 保存游戏昵称
```

## 部署步骤（微信开发者工具）
1. 导入项目：目录选本仓库，填入你自己的小程序 AppID。
2. 开通云开发：工具栏「云开发」→ 开通，记下**云环境 ID**。
3. **替换 env**：打开 `miniprogram/app.js`，把 `wx.cloud.init({ env: '请替换为你的云环境ID' })` 里的占位串改成第 2 步的环境 ID。
4. 创建数据库集合（云开发控制台 → 数据库）：
   - `rooms`、`participants`、`messages`、`users` 共 4 个集合。
5. 设置集合权限（关键，否则实时监听会失败）：
   - `rooms`、`participants`、`messages`：权限选择 **「所有用户可读，仅创建者可读写」**（客户端实时 watch 需要读权限）。
   - `users`：权限选择 **「仅创建者可读写」**（昵称隐私）。
   - 说明：云函数走服务端权限不受此限制，前端展示/监听靠集合读权限。
6. 部署云函数：在 `cloudfunctions` 下对每个函数目录「右键 → 上传并部署：云端安装依赖」。
   （共 12 个：createRoom、listRooms、listMyRooms、getRoom、joinRoom、toggleReady、startRoom、leaveRoom、dissolveRoom、sendMessage、getProfile、saveProfile）
7. 建议为以下字段建索引（云开发控制台 → 数据库 → 索引）：
   - `rooms`：`status + expireAt`（首页列表）
   - `participants`：`roomId`（房间成员查询）
   - `messages`：`roomId + createdAt`（聊天记录排序）
8. 编译运行即可。

### 全员准备提醒（订阅消息）
- 房间至少 2 名成员且所有成员都准备后，房间状态会变为 `pending`（待房主开始）。此时**不锁房**，新成员仍可加入；**也不发通知**，避免反复打扰。
- 房主在 `pending` 时点「开始游戏」，房间才进入 `ready`（全员就绪 · 可以开打）：此时锁房、拒绝新成员加入，并通过订阅消息通知所有成员。
- 任一成员取消准备、退出房间或被移除后，房间会恢复为 `recruiting`；其余成员的准备状态会保留。
- 成员点击准备时不请求订阅授权；只有房主点「开始游戏」触发发送。若希望按微信单次订阅额度授权，可在 `miniprogram/config/notification.js` 的 `roomReadyTemplateId` 已配置时由小程序在开始前请求授权。
- 在云函数 `cloudfunctions/startRoom/notificationConfig.js` 中填入微信公众平台创建的精确 `templateId`，并按模板实际字段实现 `buildData` 后，云函数会通过 `cloud.openapi.subscribeMessage.send(...)` 尝试发送提醒。
- 未配置模板时，开始仍正常生效，页面会明确提示「开打提醒尚未配置」，不会伪造已推送的结果。
- 推送需要实际小程序 AppID 与云环境关联，且只有已授权的成员能收到本轮消息。

## 已知限制 / 后续规划
- 全员准备订阅消息的代码已接入，但真实发送仍需在小程序后台创建模板，并填写 `miniprogram/config/notification.js` 与 `cloudfunctions/startRoom/notificationConfig.js` 中的模板配置。
- 有人加入/满人/过期提醒尚未接入，属于二期。
- 房间过期只是「列表隐藏 + 前端收到状态变化」，暂无定时清理任务（云函数定时触发器可后续加）。
- 游戏昵称用于房间内展示，不收集任何游戏账号/密码。
