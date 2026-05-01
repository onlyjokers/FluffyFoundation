<!--
Purpose: Provide a deep, code-grounded architecture map of the current ShuGu repository (apps, packages, runtime flows, boundaries, and engineering status) for system-level planning and refactoring.
-->

# ShuGu 项目结构与架构全景（Deep Dive）

> 基于仓库当前代码状态（审阅日期：2026-02-13）。
> 本文描述的是“当前实现”，不是目标蓝图。

---

## 1. 阅读范围与方法

### 1.1 审阅范围

- 应用层：`apps/server`、`apps/manager`、`apps/client`、`apps/display`
- 核心包：`packages/protocol`、`packages/sdk-manager`、`packages/sdk-client`、`packages/node-core`、`packages/plugin-core`、`packages/multimedia-core`、`packages/visual-*`、`packages/audio-plugins`、`packages/ai-core`
- 工程化层：根目录 `package.json`、`.github/workflows/ci.yml`、`scripts/*`、`tests/load/*`
- 参考文档：`docs/ARCHITECTURE.md`、`docs/PlanDocs/0109_RootManagerControlPlane/plan.md`

### 1.2 结论口径

- 以代码行为为准。
- 文档与计划仅用于补充“设计意图”，不作为事实来源。

---

## 2. 仓库级结构

### 2.1 Monorepo 形态

- 包管理：pnpm workspace（`pnpm-workspace.yaml`）
- 工作区范围：`apps/*` + `packages/*`
- 注意：`tests/load` **不在 workspace 中**，其依赖安装与执行是独立路径。

### 2.2 顶层目录职责

- `apps/`: 4 个运行时应用（server/manager/client/display）
- `packages/`: 协议、SDK、运行时核心、插件与 UI 基础库
- `scripts/`: 依赖护栏、部署脚本、e2e 脚本
- `tests/load/`: 压测脚本与结果
- `docs/`: 架构、计划与历史演进文档

---

## 3. 运行时实体与职责边界

### 3.1 实体

- Server：Socket.IO + HTTP API（资产、本地媒体、地理围栏）
- Manager：控制台（`/manager`）
- Root：图编辑与编排台（`/root`）
- Client：观众端执行节点（传感器采集 + 多媒体渲染 + NodeExecutor）
- Display：展示端执行节点（本地桥接优先，服务端回退）

### 3.2 Root/Manager 路由拆分现状

- `apps/manager/src/routes/root/+page.svelte`: Root 页面（NodeCanvas）
- `apps/manager/src/routes/manager/+page.svelte`: Manager 控制页面（ClientSelector / DisplayPanel / PerformanceConsole）
- `apps/manager/src/routes/+page.svelte`: 默认重定向到 `/manager`

这说明“Root/Manager 分页入口”已经落地，但仍属于同一应用进程与同一构建体系。

---

## 4. 应用层架构详解

## 4.1 Server（`apps/server`）

### 4.1.1 入口与模块

- 入口：`apps/server/src/main.ts`
- 模块装配：`apps/server/src/app.module.ts`
  - `EventsModule`（Socket 网关）
  - `MessageRouterModule`（消息路由）
  - `ClientRegistryModule`（连接注册）
  - `AssetsModule`（资产）
  - `LocalMediaModule`（本地媒体）
  - `GeoModule`（地理围栏/逆地理）

### 4.1.2 Socket 控制链路

核心文件：`apps/server/src/events/events.gateway.ts`

职责：

- 连接建立：角色识别（manager/client）、client 注册
- 事件入口：`@SubscribeMessage('msg')`
- 基础校验：`isValidMessage(...)`
- 归一化：覆盖 `actorId`、`actorRole`、`scopeGroupId`
- 控制面判定：safeMode、ownership（ControlPlane）
- 路由分发：交给 `MessageRouterService`

### 4.1.3 消息路由

核心文件：`apps/server/src/message-router/message-router.service.ts`

特点：

- 按 type 路由：`control`/`data`/`media`/`plugin`/`system`
- 高频动作可走 volatile（`VOLATILE_ACTIONS`）
- 高连接数下做最小间隔限频（`minBroadcastIntervalMs=22`）
- 目标解析依赖 client registry 的本地状态

### 4.1.4 ControlPlane

核心文件：`apps/server/src/control-plane/control-plane.service.ts`

当前模型：

- 快照结构：`safeMode`、`policies`、`ownership`（含 `ownerStack` 与 `pendingTransfer`）
- 关键动作：`offerTransfer`、`acceptTransfer`、`denyTransfer`、`reclaim`、`release`
- 持久化：可写 Redis（`persist()`），但运行时快照在进程内内存

### 4.1.5 资产与媒体接口

- 资产 API：`apps/server/src/assets/assets.controller.ts`
  - 上传、元数据、内容流（Range/ETag）
  - 读写鉴权走 `assets.auth.ts`
- 本地媒体 API：`apps/server/src/local-media/local-media.controller.ts`
  - list/validate/content
  - 复用资产读写 token 体系
- 地理围栏：`apps/server/src/geo/geo.controller.ts`
  - `GET/POST /geo/fence`、`GET /geo/reverse`

---

## 4.2 Manager（`apps/manager`）

### 4.2.1 页面层

- `/manager`: 运行控制面板
- `/root`: 图编辑器与编排中心

### 4.2.2 状态与业务汇聚

核心文件：`apps/manager/src/lib/stores/manager.ts`

该 store 当前承担：

- SDK 生命周期与连接
- client 列表、selection、control-plane 状态
- 传感器数据聚合
- display transport 策略
- readiness / screenshot / tone / ai 等衍生状态

该文件在当前仓库中属于关键枢纽（强聚合点）。

### 4.2.3 Node Graph 子系统

核心入口：`apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

配套子域：

- Rete 层：`.../rete/*`
- 控制器层：`.../controllers/*`
- 运行时桥接：`.../runtime/*`
- 组与自定义节点：`.../groups/*` + `.../custom-nodes/*`

### 4.2.4 Display 通道

双通道架构：

- 本地通道：`apps/manager/src/lib/display/display-bridge.ts`（MessagePort + BroadcastChannel）
- 远程通道：`apps/manager/src/lib/display/display-transport.ts`（server group=display fallback/route）

---

## 4.3 Client（`apps/client`）

### 4.3.1 运行时编排

核心文件：`apps/client/src/lib/stores/client/client-runtime.ts`

初始化时会装配：

- `ClientSDK`
- `NodeExecutor`
- `SensorManager`
- `Flashlight/Screen/Vibration` 控制器
- `MultimediaCore`
- `WakeLock` + Tone 音频能力

### 4.3.2 客户端分层模块

`apps/client/src/lib/stores/client/*` 已按子域拆分：

- `client-state.ts`
- `client-control.ts`
- `client-media.ts`
- `client-tone.ts`
- `client-identity.ts`
- `client-runtime.ts`

执行路径仍由 runtime 模块统一协调。

---

## 4.4 Display（`apps/display`）

核心文件：`apps/display/src/lib/stores/display.ts`

特点：

- 支持 local-pair（MessagePort）优先
- 1.2s pair timeout 后回退 server mode
- 同时内置 `ClientSDK + NodeExecutor + MultimediaCore`
- 本地媒体 `displayfile:` 注册/解析链路

---

## 5. Packages 层架构

## 5.1 依赖关系（@shugu/*）

- `@shugu/protocol`: 最底层共享协议
- `@shugu/node-core` -> `@shugu/protocol`
- `@shugu/sdk-manager` -> `@shugu/protocol`, `@shugu/plugin-core`
- `@shugu/sdk-client` -> `@shugu/protocol`, `@shugu/node-core`, `@shugu/plugin-core`, `@shugu/multimedia-core`, `@shugu/ai-core`
- `@shugu/manager` -> `@shugu/node-core`, `@shugu/sdk-manager`, `@shugu/protocol`, `@shugu/plugin-core`, `@shugu/ui-kit`
- `@shugu/client` -> `@shugu/sdk-client`, `@shugu/protocol`, `@shugu/multimedia-core`, `@shugu/visual-*`, `@shugu/audio-plugins`, `@shugu/ui-kit`
- `@shugu/display` -> `@shugu/sdk-client`, `@shugu/protocol`, `@shugu/multimedia-core`, `@shugu/plugin-core`, `@shugu/ui-kit`
- `@shugu/server` -> `@shugu/protocol`

## 5.2 各包职责

### `packages/protocol`

- 协议类型定义（`types.ts`）
- 构造 helper（`helpers.ts`）
- 时间同步 helper（`time-sync.ts`）

### `packages/sdk-manager`

- manager 侧 socket 生命周期
- 控制消息发送（含 batching/throttle）
- client list / control-plane 状态消费

### `packages/sdk-client`

- client 侧 socket 生命周期
- NodeExecutor 封装
- 传感器、tone-adapter、runtime 覆盖逻辑

### `packages/node-core`

- 图执行时核心：NodeRegistry + NodeRuntime
- 节点定义注册体系
- 图变更 helper（graph-state）

### `packages/plugin-core`

- 插件命令构造与基础契约（当前较轻量）

### `packages/multimedia-core`

- 资产 URL 解析
- 媒体状态机（视频/图片）
- Tone 引擎适配辅助

### `packages/ui-kit`

- 共享 UI 组件与样式
- 含共享 `VideoPlayer.svelte`

---

## 6. 核心数据流（现状）

## 6.1 控制消息主链路（Manager -> Server -> Client/Display）

1. Manager UI 调用 `manager store` 方法
2. store 调用 `ManagerSDK.sendControl/sendPlugin/sendMedia`
3. Socket `msg` 到 server `events.gateway.handleMessage`
4. gateway 校验 + 归一化 + control-plane 判定
5. `MessageRouter` 解析 target 并 emit 到目标 socket
6. Client/Display SDK 收到后执行本地行为

## 6.2 ControlPlane 转交流程

1. actor 发 `control-plane` 动作（offer/accept/...）
2. server 更新 ownership snapshot
3. server 回推 `ownershipChanged/snapshot/...`
4. manager/client 根据回推更新本地 UI 状态

## 6.3 Display 双通道

1. manager open display，发 `pairToken`
2. display 等待 local pair（MessagePort）
3. 若超时，切 server mode（group=display）
4. manager 侧通过 `display-transport` 决定 local / server / local+server

## 6.4 NodeExecutor 部署链

1. manager/root 图层生成 deploy payload（graph + meta）
2. payload 以 plugin message 下发到 client
3. client NodeExecutor parse/deploy，创建 runtime
4. runtime 输出 command：本地执行或 remote backend 发回 server（取决于配置）

## 6.5 资产与内容分发

1. manager 上传资产到 server
2. server 生成 metadata + content URL
3. manager/client/display 通过 manifest 与 URL 加载
4. playback/action 仅传引用，不走大体积消息

---

## 7. 工程化与交付面现状

## 7.1 根脚本

- 有：`dev:*`、`build:all`、`lint`、`e2e:node-executor`、`guard:*`
- 无统一 `test` 聚合入口（只有局部 test 命令）

## 7.2 CI

- `.github/workflows/ci.yml` 当前仅 install + `pnpm build`
- 根目录无 `build` script（实际为 `build:all`），导致 CI 不能作为有效门禁

## 7.3 测试分布

- 有若干 `*.spec.ts` 分散在 apps/packages
- `tests/load` 为独立子项目，不在 workspace
- e2e 脚本存在但未纳入 CI 常规门禁

---

## 8. 代码规模与热点（架构维护视角）

以下文件是当前明显热点（行数高、改动风险高）：

- `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteControl.svelte` (~2790)
- `apps/manager/src/lib/components/nodes/NodeCanvas.svelte` (~2707)
- `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts` (~1992)
- `apps/manager/src/lib/components/AssetsManager.svelte` (~1936)
- `apps/manager/src/lib/nodes/specs/register.ts` (~1599)
- `packages/sdk-client/src/action-executors.ts` (~1424)
- `apps/display/src/lib/stores/display.ts` (~1247)
- `packages/sdk-manager/src/manager-sdk.ts` (~991)
- `packages/node-core/src/runtime.ts` (~979)

`@ts-nocheck` 仍存在于多个 NodeCanvas 相关 Svelte 文件中（如 `NodeCanvas.svelte`、多个 overlay/panel 组件）。

---

## 9. 与目标演进（0109 计划）的衔接位置

当前代码已经具备若干基础，但距离计划中的最终态仍有明显差距：

- 已具备：
  - Root/Manager 路由分离
  - ControlPlane 基础状态机（offer/accept/reclaim 等）
  - NodeExecutor 基础框架
  - Display local + server 双通道
- 仍待完善：
  - 多 Display 路由统一能力（Phase 7）
  - AI 模型资产化与“未启用零开销”机制（Phase 8）
  - 工程化门禁、可观测性、性能预算闭环（Phase 9）

---

## 10. 一句话架构结论

ShuGu 当前是一个“功能高度完整、但控制面与执行面仍存在跨层耦合和历史双轨痕迹”的实时系统：

- 优点：能力覆盖广、链路已跑通、模块化比早期明显改善。
- 风险：授权边界、多实例一致性、协议校验、双通道语义和交付门禁仍是系统级风险源。
