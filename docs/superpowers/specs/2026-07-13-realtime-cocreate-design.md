# 多人实时在线共创功能设计文档

**日期**: 2026-07-13
**状态**: 已批准

---

## 1. 概述

将现有的本地多人共创功能升级为**异地实时在线协作**模式，支持不限制人数的房间模式，通过 WebSocket 实现双向实时同步，让参与者能清楚看到其他人的在线状态和输入动态。

### 1.1 核心能力
- 房主创建房间，生成 6 位房间号 + 分享链接
- 参与者通过房间号或链接加入
- 实时文字输入同步（300ms 防抖）
- 成员状态可视化（在线/正在输入/已输入/离线）
- 任意成员可触发 AI 融合分析，结果广播全员
- 房主专属踢人权限
- 断线自动重连，房间状态保留

### 1.2 非目标（YAGNI）
- 用户注册登录体系（匿名身份即可）
- 消息聊天系统（非核心，后续可加）
- 历史房间持久化（房间 30 分钟无活动销毁）
- 多实例水平扩展（单实例部署足够）

---

## 2. 架构设计

### 2.1 技术栈
- **实时通信**: 原生 `ws` 库（轻量、零协议膨胀，客户端包体 ~2KB）
- **状态存储**: 内存 Map（单实例，无需 Redis）
- **AI 能力**: 复用现有 `/api/analyze` 逻辑
- **前端模块化**: 新增 `cocreate-client.js` 封装 WS 逻辑，保持页面文件清爽

### 2.2 系统架构图

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Client A   │  │  Client B   │  │  Client N   │
│ (房主/游客) │  │  (游客)     │  │  (游客)     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │   WebSocket    │   WebSocket    │
       └────────────────┼────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Express Server   │
              │  ┌─────────────┐  │
              │  │ ws Server   │  │
              │  └──────┬──────┘  │
              │  ┌──────▼──────┐  │
              │  │RoomManager  │  │
              │  │(内存 Map)   │  │
              │  └──────┬──────┘  │
              │  ┌──────▼──────┐  │
              │  │ aiService   │  │
              │  └─────────────┘  │
              └───────────────────┘
```

---

## 3. 数据模型

### 3.1 Room（房间）

```typescript
interface Room {
  id: string;              // 6位房间号 base36
  hostId: string;          // 房主 userId
  createdAt: number;       // 创建时间戳
  lastActivityAt: number;  // 最后活动时间（用于过期清理）
  status: 'collecting' | 'analyzing' | 'completed';
  members: Map<string, Member>;
  analysis: AnalysisResult | null;
}
```

### 3.2 Member（成员）

```typescript
interface Member {
  id: string;              // userId（localStorage 持久化）
  name: string;            // 昵称（用户可编辑）
  avatar: string;          // 头像 ID（COCREATE_AVATARS 中随机分配）
  text: string;            // 输入的内容
  isTyping: boolean;       // 是否正在输入
  isOnline: boolean;       // 是否在线
  lastActiveAt: number;    // 最后活跃时间
  joinedAt: number;        // 加入时间
}
```

### 3.3 AnalysisResult（AI 融合结果）

```typescript
interface AnalysisResult {
  primaryEmotion: string;
  intensity: number;
  keywords: string[];
  summary: string;
}
```

---

## 4. WebSocket 协议

### 4.1 客户端 → 服务端事件

| 事件 | payload | 说明 |
|------|---------|------|
| `room:create` | `{ name: string }` | 创建房间 |
| `room:join` | `{ roomId: string, name: string }` | 加入房间 |
| `room:leave` | `{}` | 离开房间 |
| `member:update` | `{ name?: string, text?: string }` | 更新自己信息/输入（防抖300ms） |
| `member:typing` | `{ isTyping: boolean }` | 输入状态变化 |
| `member:kick` | `{ targetId: string }` | **房主专属** 踢人 |
| `analyze:request` | `{}` | 请求 AI 融合分析 |
| `room:reset` | `{}` | **房主专属** 重置房间（清空输入和分析结果） |

### 4.2 服务端 → 客户端事件

| 事件 | payload | 说明 |
|------|---------|------|
| `room:created` | `{ roomId: string, self: MemberSnapshot, hostId: string }` | 房间创建成功 |
| `room:joined` | `{ roomId: string, self: MemberSnapshot, hostId: string, members: MemberSnapshot[], analysis }` | 加入房间成功，返回完整快照 |
| `room:error` | `{ code: string, message: string }` | 操作错误（房间不存在、权限不足等） |
| `room:state` | `{ members: MemberSnapshot[], status, analysis, hostId }` | 房间状态广播（任何变更后推送） |
| `member:joined` | `{ member: MemberSnapshot }` | 新成员加入 |
| `member:left` | `{ memberId: string }` | 成员离开 |
| `member:kicked` | `{ byId: string, reason: string }` | 被踢出（通知被踢者） |
| `analyze:started` | `{}` | AI 分析开始（全员） |
| `analyze:result` | `{ analysis: AnalysisResult }` | AI 分析结果（全员） |
| `analyze:error` | `{ message: string }` | AI 分析失败 |
| `ping` | `{ t: number }` | 心跳（30s 间隔） |

### 4.3 MemberSnapshot（简化成员对象，用于广播）

```typescript
interface MemberSnapshot {
  id: string;
  name: string;
  avatar: string;
  text: string;
  isTyping: boolean;
  isOnline: boolean;
  isHost: boolean;
}
```

### 4.4 错误码

| code | 含义 |
|------|------|
| `ROOM_NOT_FOUND` | 房间号不存在或已过期 |
| `ROOM_FULL` | 房间人数上限（理论上不限，但设软上限 50） |
| `NOT_HOST` | 非房主执行房主操作 |
| `NOT_IN_ROOM` | 未加入任何房间 |
| `INVALID_NAME` | 昵称不合法（空或超长） |
| `ALREADY_IN_ROOM` | 已在房间中 |

---

## 5. 核心业务规则

### 5.1 房间生命周期
1. **创建**: 房主调用 `room:create` → 生成 6 位房间号 → 返回房间详情
2. **加入**: 参与者调用 `room:join` → 验证房间存在 → 加入 members → 广播 `member:joined` + `room:state`
3. **活动**: 每次输入/typing 更新 `lastActivityAt`
4. **AI 分析**: 任意成员触发 → status 变 `analyzing` → 广播 `analyze:started` → 调用 aiService → 广播 `analyze:result` → status 变 `completed`
5. **踢人**: 房主发送 `member:kick` → 验证权限 → 广播 `member:left` → 向被踢者单独发 `member:kicked` → 关闭该 WS 连接
6. **离开**: WS 连接关闭触发 leave（断线 5 秒内重连则恢复）
7. **重置**: 房主发送 `room:reset` → 清空所有成员 text、清空 analysis → status 变 `collecting` → 广播 `room:state`
8. **过期**: 定时清理（每 5 分钟）— 房间超过 30 分钟无活动且无在线成员 → 销毁

### 5.2 身份持久化
- 每个浏览器首次访问时生成 `userId`（uuid v4 短版）+ 随机分配头像
- 存储在 `localStorage`，下次打开自动保留身份
- 同一个用户（同 userId）多 tab 加入同一房间：后来的 tab 会顶替前一个（前一个断开）

### 5.3 断线重连
- 客户端 WS 意外断开后，5 秒内自动重连
- 重连时携带 `userId` 和 `roomId`，服务端恢复该成员的 isOnline=true
- 超过 60 秒未重连则标记为离线 isOnline=false，保留成员数据和 text

### 5.4 权限规则
| 操作 | 房主 | 普通成员 |
|------|------|----------|
| 输入/修改自己内容 | ✅ | ✅ |
| 修改自己昵称 | ✅ | ✅ |
| 触发 AI 融合分析 | ✅ | ✅ |
| 重置房间 | ✅ | ❌ |
| 踢人 | ✅（不能踢自己） | ❌ |
| 离开房间 | ✅ | ✅ |

### 5.5 限流
- 单 IP 每分钟最多创建 3 个房间
- 单房间成员数软上限 50（防止滥用）
- typing 事件限频：同一成员 1 秒最多发 2 次
- text 更新限频：同一成员 300ms 防抖后发送

---

## 6. 前端 UI 设计

### 6.1 入口改造

多人共创页增加两种模式切换 Tab：

```
┌─────────────────────────────────────────┐
│  [ 单人创作 ]    [ 多人共创 (实时) ]     │  ← Tab 切换
├─────────────────────────────────────────┤
│                                         │
│  （多人模式内容区）                       │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 创建/加入房间

**默认状态（未加入房间）：**
- 左侧：「创建房间」卡片 — 输入昵称 → 点击「创建共创房间」
- 右侧：「加入房间」卡片 — 输入房间号 + 昵称 → 点击「加入房间」

**创建/加入成功后，顶部显示房间信息栏：**
```
┌─────────────────────────────────────────────────┐
│ 🏠 房间号: ABC123   👥 在线: 3人               │
│ 🔗 复制邀请链接                    [ 退出房间 ] │
└─────────────────────────────────────────────────┘
```
- 房主额外显示「重置房间」按钮（在退出旁边）
- 房间号可点击复制，旁边展示二维码（使用已有的 qrcode 依赖）

### 6.3 成员输入区

```
┌─────────────────────────────────────────────────┐
│ [🎬] 创作者1 (你)  [房主]                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ 写下一句心情或故事…                          │ │ ← 自己的输入框
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [🎭] 创作者2  🟢 正在输入…                       │ ← 他人：typing 状态
│ ┌─────────────────────────────────────────────┐ │
│ │ （半透明显示实时内容）                        │ │ ← 他人的内容只读
│ └─────────────────────────────────────────────┘ │
│   [ 移除 ]（只有房主看到这个按钮）                │ ← 踢人按钮
│                                                 │
│ [🎨] 创作者3  ⚪ 未输入                           │ ← 他人：未输入
│ ┌─────────────────────────────────────────────┐ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│   [ 移除 ]                                      │
│                                                 │
│ [🎤] 创作者4 (离线)                              │ ← 离线：灰度头像
│ ┌─────────────────────────────────────────────┐ │
│ │ 今天加班到深夜，好想家...                     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [ + 我也来写一句 ]（加入为新成员）                 │ ← 新加入者点击
└─────────────────────────────────────────────────┘
```

### 6.4 状态图标说明
- 🟢 + "正在输入…"：用户在打字（typing=true）
- ⚪ + "未输入"：用户在线但 text 为空
- ✅ + 无标签：用户已输入内容，展示内容
- ⚫ 半透明头像 + "(离线)"：用户断线超过 60 秒
- 👑 房主标签：在名字后显示

### 6.5 AI 融合分析区

- 任意成员点击「AI 融合分析 →」按钮后
- 全员界面显示加载状态："AI 正在融合大家的故事..."（按钮禁用 + 加载动画）
- 结果返回后，全员展示相同的情绪/关键词/摘要
- 全员都能点击「选择导演，生成共创海报 →」
- 生成海报后：同单人模式，跳转导演选择页（每个用户在自己的浏览器独立选择导演生成）

### 6.6 被踢提示
- 被踢者看到弹窗：「你已被房主移出房间」
- 确认后回到房间入口页

---

## 7. 文件清单

### 7.1 新增文件

| 文件路径 | 用途 |
|----------|------|
| `server/ws-server.js` | WebSocket 服务初始化、连接管理、消息路由 |
| `server/room-manager.js` | 房间 CRUD、成员管理、过期清理、广播辅助 |
| `js/utils/cocreate-client.js` | 前端 WS 客户端封装（重连、心跳、事件分发） |

### 7.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `server/server.js` | 挂载 WebSocket 服务（使用 http.Server 升级） |
| `server/package.json` | 添加 `ws` 依赖 |
| `js/pages/cocreate.js` | 重构为支持房间模式、单人/多人 Tab、状态可视化 |
| `js/app.js` | 注册多人模式入口、初始化 cocreate-client |
| `js/shared.js` | 导出必要的工具函数（getUserId 等） |
| `index.html` | 添加多人模式 Tab UI、房间信息栏、二维码容器 |
| `css/app.css` | 添加多人模式相关样式（状态指示、房间信息栏、typing 动效） |

---

## 8. 安全与合规

- 所有用户输入内容经过 `escapeHtml()` 转义后再渲染，防 XSS
- 房间号使用加密安全随机生成（crypto.randomBytes）
- 昵称长度限制 1-20 字符，输入内容限制 100 字
- 昵称和输入内容做敏感词过滤（复用现有 compliance 模块）
- WS 连接使用 origin 校验（同 CORS 白名单逻辑）

---

## 9. 测试场景

1. **基础流程**: 房主创建房间 → 两人加入 → 同时输入 → 实时看到对方内容 → 一人触发分析 → 全员看到结果
2. **踢人**: 房主踢掉某成员 → 该成员收到被踢通知 → 其他成员看到该成员消失
3. **断线重连**: 成员断网 → 5 秒内恢复 → 状态保留
4. **房间过期**: 创建房间后所有人离开 → 30 分钟后房间销毁
5. **加入不存在房间**: 提示"房间不存在或已结束"
6. **非房主踢人**: 返回 `NOT_HOST` 错误
7. **多 Tab 同账号**: 第二个 Tab 加入时顶替第一个
8. **复制链接 + 扫码**: 其他设备打开链接直接加入
9. **AI 分析失败**: 全员看到错误提示，可重试

---

## 10. 实施顺序

1. 后端：room-manager.js（房间状态管理）
2. 后端：ws-server.js（WS 协议、事件处理）
3. 后端：server.js 集成 WS
4. 后端：安装 ws 依赖
5. 前端：cocreate-client.js（WS 客户端）
6. 前端：cocreate.js 重构（Tab 切换、房间模式 UI）
7. 前端：index.html + CSS 更新
8. 前端：app.js 集成
9. 端到端测试
