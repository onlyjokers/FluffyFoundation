<!--
Purpose: Root/Manager/Client/Display 的下一代“去中心化控制权让渡 + 高性能多媒体 + 稳定插件体系 + AI 接口预留”一步到位重构总计划。
Owner: ShuGu / System Architecture
Created: 2026-01-09
Status: Draft
-->

# 0109 Root/Manager ControlPlane：下一代架构总计划（一步到位）

> 目标：你下一次演出前不需要运行旧系统，因此本计划以“直接达到最终最优态”为导向（允许破坏性变更与大规模结构重组），但仍保持可验证、可回滚、可分阶段落地。

---

# ✅ 进度记录（Checkbox）

> 说明：这是“最终态重构”的总进度面板；每个 Phase 都有明确验收标准与决策点。
>
> - **执行日志与每日勾选状态以** `docs/PlanDocs/0109_RootManagerControlPlane/plan_progress.md` **为准**（真相源）。
> - 本面板用于呈现“计划结构 + 当前阶段完成度”，建议与 `plan_progress.md` 保持一致。

- [x] Phase 0：大清洗与新骨架（先解耦/删冗余/拆巨石；不引入新功能）
- [x] Phase 1：功能回归（保证“现有全部能力”在新骨架上跑通）
- [x] Phase 1.5：Pre-Phase2 Gate（基线固化 / 架构地图 / 质量闸门）
- [x] Phase 2：删除旧实现（只保留一套路径）+ 关键护栏落地（防止再变屎山）
- [x] Phase 2.2：组织形式对齐（同层级能力统一入口与目录归属）
- [x] Phase 2.3：Server 语义收敛（Protocol / 最小认证 / Presence）
- [x] Phase 2.5：Nodalization（自定义节点 / 母子节点 / Uncoupled / 循环嵌套防止）+ Group 持久化
- [x] Phase 3：Root/Manager 形态重构（同一 app：`/root` + `/manager`，强制 code-splitting）
- [x] Phase 4：ControlPlane v2（授权/转交/回溯/收回/终止；Server 仲裁可开关）
- [x] Phase 5：分布式执行器 v2（授权 client 运行子图并可控他端）
- [ ] Phase 6：插件体系一致化（Tone / 多媒体 / Visual / AI 统一契约）
- [ ] Phase 7：多 Display 输出与输出路由（多屏、远程/本地通道统一）
- [ ] Phase 8：AI 接口与模型资产化（后台下载；未启用 0 计算开销；手机本地推理）
- [ ] Phase 9：工程化：测试、可观测性、性能预算（演出级稳定性）

---

# 0. 你已经明确的硬需求（冻结为约束）

## 0.1 运行拓扑（公网单服务器）

- 公网：单 Server + 多手机（clients）+ 1–2 台电脑（Root/Manager/Display）。
- 系统以 **高性能多媒体交互** 为核心：音频/视频/图像/传感器等实时调制；尽量保持“计算在 client 完成，消息轻量”。

## 0.2 角色模型（最终态）

- **只有一个 Root**：永远在线、唯一真相源（SOT）、总控（kill/结束演出、关/开 Group、仲裁冲突）。
- **可有多个 Manager（演出者）**：每个 Manager 控制 Root 发布给它的若干 Group。
- **Client/Display 都是“可被控制的执行节点”**；Client 在被授权后也可以成为“controller”控制其它节点（含 display，甚至可控开启了 client-mode 的 manager）。

## 0.3 Group 语义（沿用现有概念）

- Group = 现有 NodeCanvas 的 group frame（不是新概念）。证据锚点：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`
  - `apps/manager/src/lib/nodes/specs/group-activate.json`（运行时 gate）
- **不允许**把一个 Group 分发给不同 Manager；**不允许**演出中迁移 Group 的所属 Manager。

## 0.4 “让渡控制权 / 再授权”的最终语义（你选定的规则）

- 让渡粒度：**Group 级**（C）。
- 让渡后：Manager 默认 **不能再操纵**该 Group；但 Manager 有按钮可 **收回控制权**。
- client 再授权：**独占转交**（A），且只有 Group 标记为 `transferable=true` 才允许（B）。
- 转交需要：目标 client **弹 UI 并 accept** 才生效（B）。
- 断线/刷新（带重连宽限期）：
  - 默认 **5 秒**（你选定）重连宽限期（grace）。
  - grace 内同一 actor 重连：**自动恢复**控制权（不触发回退）。
  - grace 超时：控制权 **自动回退到上一级 controller**（栈式回溯），一路回退到最初的 Manager。
  - 一旦发生回退：**不自动恢复**（仍符合“责任清晰”的原则）。
- “全部一起转交”规则：
  - 一个 client 可同时握多个 Group（A）。
  - 转交默认是“全部一起转”，并且跨不同 Manager 也一起转（A）。
  - 但若其中包含不可转交 Group：只转 transferable，非 transferable 自动回到各自 Manager（B）。
  - accept 默认一键全接（A），但必须为未来的“部分接管（B）”保留接口。

## 0.5 服务器侧强约束（可选 card，默认开启）

> 你已确认：**取消强校验**（不做 target/action/plugin 级别的逐条越权分析）。

在公网环境里，Server 仍需要保留一个**最小授权门禁**，否则任何 client 都能伪造控制消息导致失控。

- 最小门禁（你选定，必须保留）：controller/client 发出的 `control/plugin/media` 必须携带 `scopeGroupId`，Server 只校验该 actor 当前是否拥有该 `scopeGroupId`（不校验 target/action/plugin 细节）。
- 审计一致性（你选定）：除 `kill/resume` 这类全局系统指令外，**所有** `control/plugin/media`（包括 Manager/Root 发出的）也必须携带 `scopeGroupId`，用于归因与回放。
- Root/Manager 的 `kill/stop-all` 等全局止损指令不受该门禁影响（紧急通道）。
- 预留接口：未来若你改变主意，可在不破坏协议结构的前提下补回“强校验 policy”（但本计划默认不做）。
- 协议版本策略（你选定）：直接升级为 **Protocol v2**（破坏性升级），Server 默认拒绝 v1 消息（不做兼容期双栈）。

## 0.6 多媒体与同步

- 控制链路不发送大体积媒体数据（A）：只传 `url/assetId` 等引用。
- 当授权 client 广播控制/调制消息时，Server **镜像一份（best-effort，可限频/丢包）**给 Root/对应 Manager，用于监控/录制（B）。

## 0.7 Root 数据存储与迁移策略

- Root 的“唯一真相源（SOT）”仍以浏览器本地为主（IndexedDB/localStorage）+ 导入/导出工程文件（与现有 Manager 体验一致）。
- 迁移策略（你选定）：不做旧工程的自动迁移（允许清空/重建；旧工程仅通过手动导入/导出或重做来过渡）。
- 旧导出文件兼容（你选定）：不提供旧格式导入/转换工具；旧工程视为不兼容，直接重做。

---

# 1. 现状架构（基于仓库）与关键缺口

> 目的：列出现状“真实边界”和“必改缺口”，避免凭空设计。

## 1.1 现状主链路（Manager → Server → Client/Display）

- Server 目前把 `role` 从连接 query 中读取，并且 **强制只有 manager 能发 control/media/plugin**。证据锚点：
  - `apps/server/src/events/events.gateway.ts`：`handleMessage(...)` 中 `isManager` 检查。
- MessageRouter 对高频动作做 volatile/限频，但对关键传感器数据直接丢弃（mic/gyro/accel/orientation）。证据锚点：
  - `apps/server/src/message-router/message-router.service.ts`：`routeControlMessage(...)`、`routeSensorDataMessage(...)`。

## 1.2 NodeExecutor 现状：是“本机执行器”，不是“分布式控制器”

- NodeExecutor 的输出通过构造参数 `executeCommand(cmd)` 回调本地执行。证据锚点：
  - `packages/sdk-client/src/node-executor.ts`：constructor `executeCommand`、`registerDefaultNodeDefinitions(... executeCommand: (cmd)=>...)`。
- ClientSDK 目前只有 `sendSensorData`，没有“作为 controller 发控制消息”的 API。证据锚点：
  - `packages/sdk-client/src/client-sdk.ts`：公开 API 侧重连接/收消息/发 sensor。
- 结论：要实现“授权 client 本地执行子图并控制别人”，必须新增：
  - actor/role 模型（client 可以合法发送 control/plugin/media），以及 server 侧授权表；
  - NodeExecutor 的“远程发令后端”（不是只本机执行）。

## 1.3 协议校验太弱，无法支撑公网授权体系

- `isValidMessage` 只校验 `type/version`，不校验 payload/action/target 细节。证据锚点：
  - `packages/protocol/src/helpers.ts`：`isValidMessage(...)`。
- 结论：只要开放 client 发送控制消息，必须升级协议校验与授权校验，否则公网风险极高。

## 1.4 “混乱/冗余”的直接证据（大文件 + 多通路并存）

- Manager NodeCanvas 单文件承载编辑器/UI/部署/循环等多职责：`apps/manager/src/lib/components/nodes/NodeCanvas.svelte`（3793 行）。
- node-core 节点定义集中且巨大：`packages/node-core/src/definitions.ts`（4347 行）。
- Tone 适配器巨大且高度耦合：`packages/sdk-client/src/tone-adapter.ts`（3265 行）。
- Display 有两套 transport：server 的 `group=display` 与本机 MessagePort bridge 并存。证据锚点：
  - `apps/display/src/lib/stores/display.ts`（Socket.io client 模式）
  - `apps/manager/src/lib/display/display-bridge.ts`（本机 MessagePort）

## 1.5 与仓库现有 PlanDocs 的关系（“总规划”如何收敛旧计划）

为避免继续产生“多份计划彼此不一致”的冗余，本计划作为**总规划**，对既有 PlanDocs 的定位如下：

- `docs/PlanDocs/1222_improveNodeGraph/plan.md`：其中关于 **Gate Cascade（权限/执行一致性）**、**MIDI 批量**、**节点注册体系收敛** 的结论仍然有效；
  - 本计划将其提升到 Root/Manager 分层后的最终态，并要求把“执行/权限/部署”能力迁移到 ControlPlane + NodeExecutor v2 上（不再让 NodeCanvas 成为演出主路径）。
- `docs/PlanDocs/1223_display/plan.md`：Display 的“双通道（Local/Server）”方向保留；
  - 本计划要求把两套通道统一为 Transport 抽象，避免旁路语义继续扩散，并把“多 Display 输出路由”提升为系统级能力。
- `docs/PlanDocs/1219_ToneJSFix/plan.md` 与 `docs/PlanDocs/1219_IntegrateToneJS/`：Tone 的问题会在本计划的 **插件契约统一化** 中整体解决；
  - Tone 不再以“散落的 node-adapter 巨石”形式存在，而是收敛为可测试/可替换的 AudioPlugin。
- `docs/PlanDocs/1217_ClientRecursiveNodeGroup/plan.md`：关于“将自循环子图下发到 client 执行”的方向保留；
  - 本计划将其扩展为更通用的“授权后 client 变 controller（可控他端）”的分布式执行器。

---

# 2. 最终态：系统边界与依赖规则（一步到位的“干净版”）

## 2.1 运行实体（Runtime Actors）

- Root（编排/真相源/仲裁/终止）：**只做控制面与控制平面（ControlPlane）**，不承载高频执行。
- Manager（演出控制台）：**只做 UI 与低延迟控制发起**；默认不加载节点编辑器。
- Client（体验节点）：采集（传感器/麦克风/摄像头）+ 渲染/音频/插件执行；在授权后可成为 controller。
- Display（输出节点）：可多台并行；本质是 client 的子类型（能力集合不同）。
- Server：消息总线 + ControlPlane 仲裁 +（最小授权门禁；不做强校验）。

## 2.2 单一真相源（SOT）与双通路下发（低延迟 + 可仲裁）

你要求的最终态是“Root 仍是唯一真相源，但默认 Manager/Client 可直发”：

- 默认：Manager/授权 Client 直发 → Server 路由到目标（低延迟）。
- Root 异步收到镜像/控制事件并保持 SOT；必要时可覆盖/回滚（Root 的最高权限）。
- 可切换：全局切换为 Root-only 下发；并保留“按动作类型自动分流（可选）”。

> 证据锚点（现状可复用的能力）：`packages/sdk-manager/src/manager-sdk.ts` 已对高频 action 做合并/节流（ControlBatch + throttle）；server 也有 volatile emit。

## 2.3 依赖规则（禁止层级倒挂）

目标是把“UI/运行时/传输/插件”彻底解耦：

- `apps/*` 只能依赖 `packages/*` 的公开 API，禁止跨层访问内部实现。
- `packages/protocol` 只定义消息/schema，不依赖任何 runtime。
- `packages/control-plane`（新增）只定义授权/ownerStack 等模型与消息 schema。
- `packages/node-core` 定位（你选定）：承担“节点声明/类型系统 + graph 编译/执行的核心抽象”，但不包含 Tone/Three/AI 等重实现（这些必须插件化）。
- `packages/runtime-*`（新增）提供执行器与宿主环境接口（NodeExecutor v2 / plugin-host 等）。
- `packages/*-plugins` 通过 `packages/plugin-core`（新增）注册，不得反向依赖 app。

（可选）把 Root 与 Manager 拆成两个独立 SvelteKit app，以确保 Manager 的 bundle 不包含 Rete/NodeCanvas 这类重依赖；若你坚持“一套 app 两个 route”，也必须确保 /manager 路由不会加载 NodeCanvas chunk（按路由 code-splitting 验证）。

---

# 3. ControlPlane：授权/转交/回溯/收回/终止（核心）

> 这是你“去中心化整体”的基座：不靠 token，靠 server 维护权责与状态机；Root 永远可收权。

## 3.1 ControlPlane 的核心数据结构（Server SOT）

建议在 Server 侧维护（Redis 可选）：

```ts
type ActorId = string; // managerId / clientId / rootId
type GroupId = string;

type GroupPolicy = {
  groupId: GroupId;
  managerId: ActorId; // 该 Group 固定归属的 Manager（开场前绑定）
  transferable: boolean; // group meta：允许 client 再转交
  // 可选：未来扩展
  allowPartialAccept?: boolean; // 你要求“给 B 留接口”
};

type GroupOwnership = {
  groupId: GroupId;
  ownerStack: ActorId[]; // [managerId, clientA, clientB, ...]（顶部为 current owner）
  pendingTransfer: null | {
    from: ActorId;
    to: ActorId;
    offeredAt: number;
  };
  updatedAt: number;
};
```

关键点：

- ownerStack 是你要求的“回溯链”；断线/刷新触发 pop。
- pendingTransfer 触发目标 client 的 accept UI；accept 后才 push。
- 任何时刻 Root 可以：reclaim（重置 ownerStack=[managerId]）或 kill（停止 group）。

## 3.2 关键状态机（无 token）

### 3.2.1 让渡（Manager → client）

1. Manager 发起 offer：`offerTransfer({ groupIds, toClientId })`
2. Server 校验：
   - 发起者必须是这些 group 的 current owner
   - 这些 group 的 managerId 必须等于该 Manager（开场前绑定的约束）
3. Server 写入 pendingTransfer，并向目标 client 推送 `transferOffered`（带 UI 文本与 group 概览）
4. client UI 弹窗，用户点击 accept：`acceptTransfer({ offerId })`
5. Server 再次校验 offer 仍有效 → push ownerStack → 广播 ownership 变更给 Root/Manager（best-effort 镜像可另走）

### 3.2.2 再转交（client → client）

规则：

- 仅当 group.transferable=true 才能随 owner 一起被转交。
- 触发“全量转交”时：
  - transferable groups：一起 offer/accept 后一起转移
  - non-transferable groups：立即回退到各自 Manager（你选 B）

### 3.2.3 收回（Manager reclaim）

Manager 一键 reclaim：Server 直接把该 Manager 名下 groups 的 ownerStack 重置回 `[managerId]`，并取消 pendingTransfer。

### 3.2.4 断线/刷新（pop & no auto-restore）

- current owner 断线：Server pop ownerStack 到上一级并广播。
- 重新连接不自动恢复（你选 B）：即使识别为同设备/同实例，也必须重新 offer + accept。

## 3.3 “可选强约束 card（默认开）”的实现策略

你要的强约束核心是：即使 client 具备发送 control/plugin/media 的能力，也必须被 server 限制在允许范围。

建议一步到位支持两级策略（满足你“可选 card”的同时未来可增强）：

1. **基础强约束（推荐默认）**：按 ownership + group policy 限制
   - 只有 current owner 才能发送“带 groupContext”的控制
   - `target` 限制在允许的 target group（如 audience/display/manager-client）或具体集合
2. **高级强约束（未来）**：Graph-derived policy
   - Root 在部署 group 子图时，同时生成一份静态 policy（allowedActions/allowedTargetGroups/limits）
   - server 对 controller 外发消息做 schema 校验 + policy 校验

证据锚点（现状需要替换/增强的点）：

- `apps/server/src/events/events.gateway.ts`：现有只允许 manager 发送 control/media/plugin（需改为允许“controller role”并做授权校验）。
- `packages/protocol/src/helpers.ts`：现有 isValidMessage 太弱（需要 schema 校验）。

---

# 4. Graph：从“编辑器真相”到“可部署执行单元”

## 4.1 Root Graph 是唯一真相源（Graph-first）

你明确要求：让渡/转交/收回是 Graph 内的一等公民（节点表达），并且可控/不可控边界由 Root 图预先定义。

建议最终态把 Root Graph 拆成两层：

- **编排层（Orchestration Graph）**：Root 编辑的完整图（包含组、场景、权限节点、宏控件映射）。
- **执行层（Executable Subgraph）**：按 Group 编译出的“可部署子图”（给 manager 或 client executor 运行）。

## 4.2 Group 元数据（你选 A）

在 group frame 的 metadata 上增加：

- `managerId`（固定归属）
- `transferable`（是否允许 client 再转交）
- （可选）`policyPreset`（强约束策略模板，未来扩展）

证据锚点：group frame 已有 metadata/overlay 管理逻辑：

- `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`

## 4.3 编译产物：subgraph + policy + execution config

Root 在发布/让渡时输出：

- `graph`: nodes + connections（已经存在类似结构，证据锚点：`packages/sdk-client/src/node-executor.ts` 的 deploy payload）
- `meta`: `groupId`, `requiredCapabilities`, `tickIntervalMs`, `protocolVersion`, `executorVersion`
- `policy`（用于 server 强约束，可选但建议一步到位做）

执行模型偏好（你选定）：

- 默认采用 **Push/增量模型**：输入变化触发局部计算，尽量避免固定 tick 全量运行（降低 client 计算量与电量消耗）。
- 对于必须恒定更新的节点（例如时间/振荡器/某些音频 LFO），允许声明为“needsTick”，由执行器对最小必要子图 tick（而非全图 tick）。

---

# 5. 分布式执行器：NodeExecutor v2（client 变 controller）

## 5.1 执行位置（你选 B）

当 Group 被让渡给某个 client 后：

- 子图默认在该 client 本地运行；
- 子图产生的控制命令不再是“本机执行”，而是“向 server 发送控制消息以控制目标端”；
- Root/Manager 只接收镜像流用于监控/录制。

补充：高频调制（fast loop，30–60fps）的默认执行方式（你后续确认选 A）

- 当“被授权的 client 用自己的传感器去调制其他设备”时，fast loop 默认由 **controller client 本地执行**；
- controller 直接像 manager 一样，通过现有 `client(controller) → server → targets` 传递链路下发 `control/plugin/media`（同型消息）。
- 这会显著增加高频消息量：必须在 SDK+Server 侧提供 batch/volatile/限频/合并（last-write-wins）等治理策略，避免网络/Redis/Socket 缓冲区背压导致卡顿或断连。
- （可选优化，未来再做）保留 “inputs mirror + targets 本地执行” 的通路作为扩展点。

## 5.2 NodeExecutor v2 的关键变化

现状 NodeExecutor 的设计是“本机执行器”，需要升级为“可插拔执行后端”：

- Local backend：保持现有 `executeControl(...)` 等本机执行路径（用于普通 client 被控行为）
- Remote backend：把 `NodeCommand` 转成 `ControlMessage/PluginControlMessage/MediaMetaMessage` 发给 server

证据锚点（现状入口）：

- `packages/sdk-client/src/node-executor.ts`：`executeCommand(cmd)` 回调
- `apps/client/src/lib/stores/client.ts`：`executeControl(...)` 本机执行实现

## 5.3 controller 身份与“带 scope 的控制消息”

要让 server 能够把“外发控制”归因到某个 Group（用于 ownership/policy 校验），建议在协议中引入显式 scope：

- 每条 controller 发出的 control/plugin/media 都带：
  - `actorId`（谁发的：clientId/managerId）
  - `scopeGroupId`（此消息来自哪个 group 的执行）

你刚确认的额外约束：

- 除 `kill/resume` 这类全局系统指令外，Manager/Root 发出的 `control/plugin/media` 也必须强制带 `scopeGroupId`（用于审计/回放/责任归因）。
- 系统级动作的 scope 表示（你选定）：约定保留值（例如 `scopeGroupId="__system__"`）作为 Root/Manager 的系统域；不强制归属到某个真实 Group。
- `scopeGroupId` 字段策略（你选定）：在协议里作为 **必填字段**（除 `kill/resume` 外都必须携带；缺失即判为无效消息）。

否则 server 无法做“按 group ownership 的授权校验”。

（注：这是一步到位的关键取舍；它会触发 protocol 的破坏性升级。）

## 5.4 client 侧“目标选择器”所需的 client 列表

你截图中的模式依赖“右侧 client-object 能枚举并选择目标集合”（Index/Range/Random）。

现状：

- manager 侧有 clientList（system message `clientList` 只广播给 managers），证据锚点：`apps/server/src/events/events.gateway.ts`、`apps/server/src/message-router/message-router.service.ts`。
- client 侧没有 all client list（NodeExecutor 默认 `getAllClientIds` 只返回自己），证据锚点：`packages/sdk-client/src/node-executor.ts`。

最终态需要：

- server 能把“可见的目标集合”（至少 group=audience/display 的 id 列表或分组索引）下发给 controller client；
- 并与强约束策略一致（即使列表更宽，也要由 server 校验阻止越权）。

---

# 6. Root/Manager UI：从“盯节点”到“演出控制台”

## 6.1 Root UI（编排/真相源/幕后核心）

Root 负责：

- 图编辑（NodeCanvas/节点分类/模板/场景）
- Group 发布（给某个 Manager）
- 权限编排（delegate/reclaim/transferable 等）
- 演出总控（kill、结束演出红点、开关 groups）
- 审计/回放：接收镜像流 + 记录关键事件

## 6.2 Manager UI（演出者控制面板）

你选定的能力边界：

- 不允许自由改图结构
- 允许切换 Root 预先定义的“场景/预设/快照”
- 默认是“控件面板”，可一键展开“只读节点图”用于调试（C）

控件生成规则（你选 C）：

- 自动生成 + 微调 + 宏控件（类似 Ableton 设备宏控件）
- 控件底层绑定到 **Node Graph 的 input/config**（A），而不是协议动作

## 6.3 Client UI（体验端 + 接管/accept）

client 需要新增：

- 接管弹窗（accept/deny）+ 当前握有哪些 groups 的摘要
- controller 模式的可见提示（避免“全责不清”的交互）
- （可选）“允许被当作目标/允许被控制”的开关（你提到 manager 自身可被控要可控）

---

# 7. 插件体系稳定化（Tone / 多媒体 / AI）

## 7.1 一步到位的插件契约（Plugin-first）

目标：让“节点只是声明式配置 + 连接”，真正的重活在插件 host 中完成。

节点 vs 插件的默认边界（你选定）：

- 只要涉及第三方大库/复杂运行时（Tone / Three / AI / 视频处理等）就必须做成插件；
- `node-core` 只保留轻量 glue（声明参数/连接/类型）与必要的运行时编排，不直接承载重实现。

新增 `packages/plugin-core`：

- 插件元数据：id/version/capabilities
- 生命周期：init/start/stop/configure/dispose
- 运行时接口：pull/push 数据、资源加载、时间同步
- 权限：plugin 只能通过 host 提供的受限 API 做 side-effect（屏幕/音频/网络）

## 7.2 Tone 系列治理（稳定、可测试、可扩展）

现状 Tone 实现在 `packages/sdk-client/src/tone-adapter.ts` 过大且职责混杂（3265 行）。

最终态建议：

- Tone 作为一个 AudioPlugin（内部维护自己的 audio graph/bus/transport）
- node-core 的 tone nodes 只负责：
  - 声明参数（delayTime/wet/feedback/clip 等）
  - 声明连接关系（哪些节点连到哪个 bus/chain）
- plugin host 负责：
  - audio wiring（connect/disconnect）
  - resource 管理（cache/abort/retry）
  - 性能预算与 watchdog（音频线程/主线程分离策略）

## 7.3 AI 接口预留（你未来的重点）

你希望：

- RNN 调制音频、CNN 调制图片、通过 API call 接入 LLM。

最终态建议把 AI 做成插件域：

- `ai-plugin-local`：本地推理（WebGPU/WebAssembly），输入/输出是张量或特征（不走网络）
- `ai-plugin-remote`：通过 server 代理调用外部 API（避免在 client 暴露密钥）

Graph 侧只看到：

- `ai-infer`（输入特征/图片帧/音频特征，输出调制参数或纹理）
- `ai-control`（高层指令）

---

# 8. 多 Display 输出（多屏/多路输出/路由）

最终态建议把 Display 作为一等“输出节点集群”：

- 支持多个 display 同时在线（现状已经通过 `group=display` 天然支持多实例，证据锚点：`packages/protocol/src/types.ts` 的 TargetSelector group + `apps/server/src/client-registry/client-registry.service.ts#getClientsByGroup`）。
- Root/Manager 能在 UI 中：
  - 看到 display 列表（按标签/分辨率/布局）
  - 选择路由：某个 group 输出到哪些 display（broadcast 或分配）

同时，把本机 MessagePort bridge 与 server transport 抽象为统一 `Transport`，由策略选择（本机优先、超时回退）。

补充约束（你刚确认）：

- 同机 Display 默认走本机桥（MessagePort），但允许切换到 server `group=display`（用于远程/多机/多屏场景）。
- 同机 Display 在本机桥配对成功后仍保持连接 Server 作为备份：本机桥优先；只有当本机桥断开/超时才启用 server 通路。
- 本机桥配对成功时，Display 仍应接受来自 Server 的紧急指令（`kill/stop-all` 等）用于止损。

证据锚点：

- `apps/manager/src/lib/display/display-bridge.ts`
- `apps/display/src/lib/stores/display.ts`

---

# 9. 工程化：测试、可观测性、性能预算（演出级）

## 9.1 测试策略（现状几乎空白，需要补齐）

现状几乎没有单测（本地检索仅见少量测试入口/脚本），证据锚点：

- 根脚本：`scripts/e2e/node-executor.mjs`、`pnpm e2e:node-executor`（`package.json`）

最终态必须补齐：

- `packages/control-plane`: 单测（ownerStack/pendingTransfer 状态机、断线回溯、不可转交回退）
- `apps/server`: 集成测（Socket.IO 事件：offer/accept/reclaim/disconnect）
- `packages/runtime-*`: 执行器测试（local/remote backend 一致性）
- 关键 e2e：Root→Manager→delegate→clientA→transfer→clientB→disconnect→rollback→reclaim

## 9.2 可观测性

必须具备：

- 每个 group 的 current owner、ownerStack、pendingTransfer 状态可视化（Root/Manager）
- 每条控制消息可追溯：actorId + scopeGroupId + target（用于回放与责任界定）
- client executor 的 status（deployed/running/stopped/error/watchdog）最小回报（现状 NodeExecutor 已有 status/report，可复用：`packages/sdk-client/src/node-executor.ts`）

## 9.3 性能预算（高性能多媒体）

原则：

- 高速调制不依赖 server 透传传感器；而是 client 本地执行子图输出 control（你选择的模型天然满足）。
- Root/Manager 的镜像流是 best-effort，不允许反向拖慢演出链路（你选择 B）。
- 对每种 action/插件都要定义：
  - max Hz（server/SDK 限频）
  - volatile/reliable（路由策略）

证据锚点：现有 server/manager SDK 已有相关基础设施：

- `apps/server/src/message-router/message-router.service.ts`（VOLATILE_ACTIONS/RELIABLE_ACTIONS）
- `packages/sdk-manager/src/manager-sdk.ts`（batch + highFreqThrottleMs）

---

# 10. 最终态验收（Definition of Done）

> 以“演出场景”为验收，而不是以“代码改了”为验收。

## 10.1 典型闭环场景必须跑通（核心）

1. Root 发布多个 Group 给多个 Manager（开场前绑定）。
2. Manager A 将一个或多个 Group 让渡给 client X：
   - X 接到 offer → UI accept → 立即获得控制权；
   - Manager A 无法再操纵该 Group（直到 reclaim）。
3. client X 在本地执行子图，用自身 sensors 调制并控制：
   - audience clients
   - 多个 display
   - （可选）开启了 client-mode 的 manager
4. client X 独占转交给 client Y：
   - Y accept 后生效；
   - 若包含 non-transferable groups：这些 groups 自动回到各自 Manager。
5. Y 刷新页面/断线：
   - ownerStack pop 回到 X（不自动恢复）；如果 X 也断线则继续回退到 Manager。
6. Root 一键结束演出/kill：
   - 所有 groups 停止、side-effect 清理、全端回到安全状态。

## 10.2 插件与 AI

- Tone 系列节点在统一插件契约下稳定工作（无“数值端口冒充音频链”的语义混乱）。
- AI 插件接口可接入（本地/远程两种后端），并能以节点形式参与调制链路。

## 10.3 代码质量

- 删除/拆分现有巨大文件的关键职责：NodeCanvas/definitions/tone-adapter 至少被拆成可维护模块（不再是“单文件巨石”）。
- Protocol/ControlPlane 具备 runtime schema 校验（至少 server 侧）。
- 有可运行的测试集：单测 + 集成 + 关键 e2e。

---

# 11. Phase-by-Phase 执行计划（不按天排期，只按依赖顺序）

> **执行顺序纠正（你明确要求）：先大清洗，再新功能。**
>
> - 在 Phase 0/1/2 完成前：**禁止**引入 ControlPlane/授权/去中心化执行/AI 等“新能力”。
> - Phase 0/1/2 的目标是：把系统从“屎山 + 多通路 + 巨石文件”变成“边界清晰 + 单一真相源 + 可持续演进”的底座，并且保证现有功能全在。

## Phase 0：大清洗与新骨架（先解耦/删冗余/拆巨石；不引入新功能）

目标：把“现有代码”梳理为可维护的模块边界；消灭最主要的混乱源（巨石文件、跨层直连、多通路语义并存），为后续 Root/Manager/ControlPlane/AI 打底。

范围（只做结构与职责清洗，不做能力扩张）：

- **仓库边界与依赖护栏（先立规矩）**
  - 明确 packages 的公开入口（barrel exports）与禁止 deep import 的规则；建立依赖图检查脚本。
  - 证据锚点（需要治理的现状）：
    - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`（3793 行、`@ts-nocheck`，多职责黏在一起）
    - `packages/node-core/src/definitions.ts`（4347 行，节点定义巨石）
    - `packages/sdk-client/src/tone-adapter.ts`（3265 行，Tone 耦合巨石）
    - `apps/client/src/lib/stores/client.ts`（1855 行，客户端职责混杂）
- **Runtime 真相源收敛**
  - Node 定义/端口/运行时类型：只在 TS（`packages/node-core`），JSON specs 降级为 UI overlay（你已同意）。
  - 收敛 “同类能力多通路”：display 的 local bridge 与 server group 模式统一到 Transport 抽象（先抽象，不扩功能）。
    - 证据锚点：`apps/display/src/lib/stores/display.ts` + `apps/manager/src/lib/display/display-bridge.ts`
- **拆巨石（按职责拆分，不设硬上限）**
  - NodeCanvas：拆成 EditorView / RuntimeOrchestrator / Patch&Loop Deployer / Selection&UI 等模块，Rete 降为 view 层。
  - definitions：拆成按域分组的 node packs（math/logic/client/tone/media/visual/...）。
  - tone-adapter：拆成 AudioEngineHost + ToneNodes(plugins) + Scheduling/TimeSync glue。

输出物（写入文档/ADR + 目录骨架）：

- 新骨架的分层图与依赖规则（apps → sdk → runtime/node-core → protocol）。
- “删除清单 v1”：明确哪些旧文件/旧路径会在 Phase 2 删除（避免两套并存继续发酵）。
- “回归清单 v1”（你给的必须保留能力清单转为可验收 checklist）。

验收（不要求全系统可运行，但要可验证）：

- 依赖护栏生效（CI/本地脚本能挡住跨层倒挂）。
- 巨石拆分完成且职责边界清晰（至少把 4 个最大的巨石拆出关键模块）。

固定验证命令（Phase 0 必跑）：

- `pnpm guard:deps`
- `pnpm --filter @shugu/node-core run test`
- `pnpm --filter @shugu/sdk-client run build`
- `pnpm --filter @shugu/manager run lint`
- `pnpm --filter @shugu/client run lint`

## Phase 1：功能回归（保证“现有全部能力”在新骨架上跑通）

目标：在 Phase 0 的新骨架上把“现有能力”完整跑通，形成可作为基线的稳定版本；同时把性能/稳定性最致命的问题（Manager 卡顿/退出）降到可接受。

范围（不新增功能；只迁移与修复结构性问题）：

- **现有能力回归清单（必须全绿）**
  - Manager 操作后 Client 会变化（控制链路）
  - 现有节点的全部功能（实现可重写，但功能不丢）
  - Manager 不通过网络直接同步数据到 Display（保留本地 bridge 能力）
  - Assets 系统（manifest 扫描与下发）：`apps/manager/src/lib/nodes/asset-manifest.ts`
  - Client 分层系统（Visual/Audio/Effect layers 的 Activate/Deactivate 语义）
  - Client 图片上传、闪光灯等效果、mel-spectrum（适配层级系统）
  - Node Graph 操作系统（编辑/导入导出/组/loop/patch）
- **Manager 性能与稳定性基线**
  - 以 NodeCanvas 拆分后的 view 层为中心做性能剖析，去掉最昂贵的渲染路径（例如每条连线一个 SVG + drop-shadow 的模式见旧计划）。
  - 建立“关键操作 smoke flow”：start/stop/部署/切场景/报警不会导致 UI 退出。
  - 性能目标规模（你选定）：节点图达到 **150+ 节点**时仍可用（具体指标在后续问题里继续细化）。
  - 150+ 节点的适用范围（你补充）：Root 的 NodeGraph 编辑器与演出现场的 Manager 控制面板两者都可能遇到该规模，需要分别定义可验收指标。
  - 必须优先保证的“绝不能卡”交互（你选定）：
    - 运行态关键动作：Start/Stop/Deploy/切场景（C）
    - 演出控件高频调制：旋钮/推子 30–60fps（D）
  - 高频调制主策略（你选定）：Controller 侧每帧计算并通过现有 `controller → server → targets` 链路下发控制指令（与 Manager 同型消息）。
    - 约束：必须配套 batch/volatile/限频/最后值覆盖等策略，否则公网环境会把 server 打爆或把控制链路拖垮。
    - 预留：未来可加一条“inputs mirror + targets 本地执行”的模式作为可选优化（不作为默认）。
    - 丢帧策略（你选定）：与现有 Manager 一致——高频动作允许丢帧（volatile + 合并，保证“最新值”即可）。证据锚点：`apps/server/src/message-router/message-router.service.ts` 的 `VOLATILE_ACTIONS` + `packages/sdk-manager/src/manager-sdk.ts` 的 `highFreqThrottleMs` / batching。
    - 默认频率上限（你选定）：30 fps（需要与 SDK 节流 + server 侧限频策略一致）。

验收：

- 你列出的“必须保留能力”在新骨架上全量通过（手动 checklist + 最小自动化 smoke）。
- Manager 的卡顿与“误退出”问题不再是阻断级（至少可稳定跑完整场排练）。

固定验证命令（Phase 1 必跑）：

- `pnpm guard:deps`
- `pnpm --filter @shugu/node-core run test`
- `pnpm --filter @shugu/sdk-client run build`
- `pnpm --filter @shugu/manager run build`
- `pnpm --filter @shugu/client run build`

## Phase 1.5：Pre-Phase2 Gate（基线固化 / 架构地图 / 质量闸门）

目标：在进入 Phase 2 的破坏性删除之前，把 Phase 1 的结果固化成**可回退、可复现、可度量**的基线版本；并补齐“仓库阅读地图”，降低后续重构沟通与维护成本。

范围（不新增功能；只做工程化与可读性治理）：

- **A) 基线固化（避免 Phase 2 删除不可回退）**
  - 形成一个 clean 的基线提交（工作区 `git status --porcelain` 为空）。
  - 打 tag/标记（例如 `phase1-baseline-YYYYMMDD`），便于回滚与对比。
  - Phase 1 回归证据与复跑方式必须完整记录（继续维护 `plan_progress.md` + `phase1_regression_playbook.md`）。

- **B) 质量闸门（必须“可执行”，不是口号）**
  - `pnpm guard:deps` 必须通过（依赖边界不退化）。
  - `pnpm lint` 必须 **0 errors**（warnings 可暂存，但本阶段要明确：哪些 warnings 是历史债，哪些是新增禁止）。
  - （可选但推荐）`pnpm build:all` 通过，确保 Phase 2 删除前的生产构建基线存在。

- **C) 架构地图（解决“我看不懂现在的系统”）**
  - 新增 `docs/ARCHITECTURE.md`，至少包含：
    - Repo Map：`apps/*` 与 `packages/*` 的职责边界 + 依赖方向（与 deps guard 一致）。
    - 关键数据流：Control chain / Assets / Display transport（local+fallback）/ NodeGraph deploy。
    - 入口索引：每个 app 的“入口文件/核心 store/核心网关”（方便快速定位）。
    - Hotspots 清单：>1k 行文件、`@ts-nocheck` 位置、以及“拆分/收敛策略”（不要求本阶段完成拆分，但要写清楚怎么拆、拆到哪）。

- **D) 本地生成物治理（降低目录噪音、提升可读性）**
  - 新增轻量清理命令（例如 `pnpm clean:artifacts`）用于清理 `.svelte-kit*`/`build*`/`dist*`/`vite-cache*` 等本地生成物（不动源码、不删 node_modules）。
  - 明确“哪些输出是部署需要的、哪些只是本地缓存”，并写入 `docs/ARCHITECTURE.md` 或 `DEPLOY.md` 的补充说明。

- **E) Phase 2 输入准备（让 Phase 2 变成“按清单删除”）**
  - 补齐/更新 Phase 2 的“删除清单 v2”（聚焦**仍存在的双通路/重复实现/过渡胶水**）。
    - 当前版本：`docs/PlanDocs/0109_RootManagerControlPlane/phase2_targets.md`

验收：

- 基线可回退：存在明确 tag/标记，且 `git status --porcelain` 为空。
- 质量闸门：`pnpm guard:deps` ✅，`pnpm lint` ✅（0 errors）。
- 可读性：`docs/ARCHITECTURE.md` ✅（包含 repo map / 数据流 / 入口索引 / hotspots）。
- （可选）`pnpm build:all` ✅。

## Phase 2：删除旧实现（只保留一套路径）+ 关键护栏落地（防止再变屎山）

目标：你确认 Phase 1 OK 后，**删除旧代码**，避免双栈并存再次变屎山；同时落地最关键的工程护栏，让后续迭代保持“干净”。

范围：

- **A) 删除旧实现 / 去双通路（只保留一套语义与一套实现）**
  - 按“删除清单 v2”执行删除（聚焦仍存在的：双通路、重复组件、过渡胶水、旁路状态机）。
    - `docs/PlanDocs/0109_RootManagerControlPlane/phase2_targets.md`
  - 明确每个能力的 **Single Source of Truth**：
    - Display：local MessagePort 与 server fallback 必须收敛到统一入口（例如 `display-transport`），旧的直连发送/旁路逻辑不再保留。
    - UI 复用：类似 `VideoPlayer` 这类跨 app 的重复实现，要么抽到 `packages/ui-kit` / `packages/multimedia-core`，要么明确“只保留一份并被复用”。
  - 删除后的行为验证必须立即回归（见验收）。

- **A2) Phase 2.2：组织形式对齐（同层级能力统一入口与目录归属）**
  - 对齐清单：`docs/PlanDocs/0109_RootManagerControlPlane/phase2_2_alignment.md`
  - 目标：消除“同一层级能力却组织/命名/入口分裂”的技术债，为 Phase 3/4 打底。

- **A3) Phase 2.3：Server 语义收敛（Protocol / 最小认证 / Presence）**
  - 对齐清单：`docs/PlanDocs/0109_RootManagerControlPlane/phase2_3_server_hygiene.md`
  - 目标：在不新增演出能力的前提下，清理 server 的协议形态/角色入口/presence 语义混乱，避免 Phase 4/5 被历史债拖死。

- **B) 护栏固化（防止再变屎山）**
  - 依赖护栏升级：在现有 `guard:deps` 基础上，逐步扩展到“关键层级倒挂/循环依赖”的自动检测（保持规则轻量、可维护）。
  - Deep import 禁止：保持当前策略（只允许从 `package.json#exports` 暴露的入口导入）。
  - Hotspot 闸门（建议从 warn 起步）：
    - 对 `@ts-nocheck`、超大文件（例如 >1500 行）建立告警/预算，避免 Phase 3+ 继续发酵。
    - 允许通过“白名单 + owner + 拆分计划”临时豁免，但必须可追踪。
  - 最小测试基线（聚焦，不追求全面）：
    - 继续维持 Phase 1 的手动 checklist 全绿。
    - 能自动跑的部分尽量脚本化（smoke / e2e），避免每次都靠记忆。

- **C) 目录与抽包（为 Phase 3/4 打底，减少未来大迁移风险）**
  - 目标不是“目录更深”，而是把**概念边界变清楚**：
    - 将可复用的 NodeGraph/UI/编辑器模块逐步抽到 `packages/*`（只抽纯模块，app 内保留集成层）。
    - 对历史命名做一次“语义化对齐”（例如 `nodes`/`components/nodes` 的边界通过命名或入口文件变得直观）。
  - 原则：每次迁移都要保证 Phase 1 回归清单仍可跑通（不新增功能、不改行为）。

验收（你的删除门槛要求）：

- 自动化 smoke tests + 手动 checklist 同时通过。
- 代码库中“同类能力两套通路并存”的核心历史包袱被清除（以依赖图与目录结构为证）。
- `pnpm guard:deps` ✅，`pnpm lint` ✅（0 errors）。

## Phase 2.5：Nodalization（自定义节点 / 母子节点 / Uncoupled / 循环嵌套防止）+ Group 持久化

> 背景：此前尝试过“Group 最小化后伪装成 Node（但 ports/行为实际托管在别处）”的方案，属于双轨制伪 Node，复制/撤销/选中/连线等都会持续出 bug。
> 本 Phase 选择把问题一次性做对：**让 Group 通过 Nodalization 生成真正注册到 node-picker 的自定义节点**，从根上消除伪 Node。

目标（Phase 3 引入新能力前必须完成）：

- 让 “用 Group 组装 → 一键变成真实 Node 类型（可复用/可复制/可导入导出）” 成为长期扩展机制。
- 修复“刷新后 Group 消失”的持久化缺口，避免后续 Phase 3/4 再被历史 UI 元数据拖死。
- 清晰冻结：Gate 语义、母/子节点、结构同步/参数独立、以及嵌套与循环限制。

范围（本 Phase 不引入 ControlPlane 新能力；只治理 NodeCanvas + node-core 运行/导出链路的可维护形态）：

### 2.5.1 术语与数据模型（冻结）

- **Custom Node Definition**：一个可复用的子图模板（会出现在 node-picker）。
- **Mother instance（母节点实例）**：definition 的唯一编辑入口（可 Expand / 可改结构）。
  - 约束：复制母节点只会生成 **子节点实例**（避免出现多个母节点同时编辑同一个 definition）。
  - node-picker 只展示“拥有母节点实例”的 definition（没有母节点则视为不存在）。
- **Child instance（子节点实例 / coupled）**：从 node-picker 创建或复制产生；不能 Expand；拥有 `Uncoupled` 一次性按钮。
- **Uncoupled**：子节点分叉为新 definition（新母节点定义）；该实例自身 **groupId 保持不变**，但 `definitionId` 切换为新的。
- **ID 规则（你已确认）**：
  - `groupId` 是**实例级唯一**（复制产生的新实例也必须生成新 groupId；全工程不能重复）。
  - 母子共享结构靠 `definitionId` 关联；普通节点没有 groupId。
  - 命名只有一层：`definitionName`（母节点改名会同步 node-picker 以及所有实例标题）。
- **结构同步 vs 参数同步（你已确认）**：
  - 母节点对已存在子节点：只同步 **结构（节点/连线/端口）**，不同步内部参数。
  - 子节点内部参数是实例独立的；复制子节点实例时，内部参数状态完整复制。
  - 默认参数（defaults）只在你点 `Update Defaults` 时更新；导出时读取 definition 存储的 defaults。

### 2.5.2 Gate 语义（替代 Activate 节点）

- 移除 `Activate` 节点：Gate 变为 Custom Node 的固有属性。
- Gate = `manualToggle AND wiredGateInput`：
  - 折叠形态：Gate 输入作为普通 input port-row；并且母节点/子节点都显示手动 toggle。
  - wired 未连线视为 `true`。
- 旧项目迁移：历史 `group-activate`（可能多个）合并为 AND；若来源非 boolean，自动插入数值阈值转换节点（见 2.5.6）。

### 2.5.3 Nodalization：Group → 真实自定义节点（核心）

- 入口：在 Group frame actions 增加 `Nodalization`。
- 点击 Nodalization 后：
  - **真正封装**：把 Group 内部节点/连线从主 Graph 移走，存入新建 definition 的子图模板；主画布只剩一个 Custom Node（母节点实例）。
  - 该母节点实例保留原 groupId（作为实例号），并成为唯一可 Expand 的编辑入口。
  - node-picker 立即出现该 definition（因为母节点存在）。
- 在“母节点 Expand 的内部编辑环境”里也允许 Nodalization：
  - 新产生的母节点实例在内部原地出现（嵌套母节点）。
  - 复制顶层母节点/从 node-picker 创建子节点实例时，内部嵌套母节点会在该实例里降级为子节点（仍引用各自 definition）。

### 2.5.4 Expand（原地展开成 frame）与交互（冻结）

- Expand 形态：原地展开为 frame（类似 Group frame），但本质是母节点的内部编辑视图。
- **可同时展开多个母节点**；展开时 frame 外部画布保持可交互（不锁外部）。
- 内部坐标系：内部节点坐标存为相对 frame；拖动母节点 frame 时内部节点整体跟着移动。
- 对外端口呈现：Expand 后对外端口挂在 frame 左/右边缘（外部连线连接到边缘端口点）。
- 允许通过拖拽跨边界改变归属：外部节点拖进 frame 变内部节点；内部节点拖出变外部节点；跨边界连线需自动改为边界端口代理（见 2.5.5）。
- Gate 模式下：frame 形态不显示旧的 `group-frame-gate`（保留 Gate 语义即可）。

### 2.5.5 边界端口代理（Proxy Ports）

> 目的：彻底禁止“穿墙连线”，并为 Custom Node ports/compile 提供稳定映射。

- 所有跨边界连线必须挂在边界代理点上（多层嵌套每层都生成代理）。
- 代理点来源：自动生成（已有跨边界连线）+ 手动预置（即使尚未连线）。
- 创建 UX（你已描述）：拖线靠近 frame 左边缘（输入）/右边缘（输出）边缘高亮，松开创建代理点（线保持连着）。
- 连接约束：**输入最多 1 条连接；输出可多条**（与节点系统一致）。
- 代理点行为：
  - 自动生成的代理点：当其不再代理任何内部连线时自动消失。
  - 手动 pinned 的代理点保留（即使暂时没被连线）。
- 类型/命名（你已确认）：
  - 代理点类型必须继承被代理端口类型（不允许显示成 any）。
  - 端口 label 默认继承内部端口名，但允许手动重命名覆盖。
- 布局与拖拽（你已确认）：
  - 边缘代理点可沿边缘上下拖动（只能竖向），位置持久化。

### 2.5.6 新增节点：Number to Boolean（并确保可在 node-picker 找到）

- 新增 Logic 节点 `Number to Boolean`：
  - 输入：`number` 与 `trigger number`
  - 输出：`number >= trigger ? true : false`
- 目标：作为旧 Activate 输入的“数值/any → boolean gate”迁移工具。
- 验收：node-picker 可搜索到并可创建该节点（修复缺失注册的问题）。

### 2.5.7 Uncoupled（子节点分叉）+ 循环嵌套防止

- 子节点点击 `Uncoupled`：
  - 生成新 definition（新 `definitionId`），该实例原地升级为新母节点实例（可 Expand）。
  - 该实例 `groupId` 保持不变。
  - `Uncoupled` 不递归：只作用于当前这个实例本身，不会联动其内部嵌套的子节点/母节点的耦合状态。
- 禁止循环嵌套（你已确认）：包含“自己包含自己”以及 A 包含 B 且 B 包含 A。
  - 一旦检测到会形成循环：直接阻止并提示原因（不创建/不导入/不粘贴）。

### 2.5.8 导入/导出（跨项目复用）

- 导出格式：单文件 `*.shugu-node.json`。
- 导出内容：
  - 递归打包依赖：若 definition 内包含其它 Custom Node 子节点，则必须连带其母节点 definitions 一并打包。
  - defaults：导出使用 definition 存储的 defaults（不取母节点当前参数快照）。
- 导入行为（你已确认）：
  - 导入后：对文件内所有 definitions（含依赖）自动生成各自母节点实例，并出现在 node-picker。
  - 导入冲突：视为“复制品导入”——生成新的 ids（避免覆盖）。
  - 循环检测：若导入会造成循环嵌套，直接拒绝导入并提示。

### 2.5.9 删除语义（母节点 / 子节点 / 嵌套母节点）

- 删除母节点实例时弹确认：
  - 确认后：删除该 definition 以及所有仍 coupled 的子节点实例；已经 Uncoupled 的分支不受影响。
- 若母节点内部包含嵌套母节点：
  - 删除时弹窗列出所有嵌套母节点，逐个选择：
    - 随 A 级联删除（删除其 definition + coupled 子节点实例）
    - 提升保留（把其母节点实例搬到外层画布，保持 node-picker 可见）

### 2.5.10 Project 持久化补齐：Group/CustomNode 刷新后不丢

现状问题：刷新后 Group 消失，说明当前 autosave/restore 没有把 Group 元数据纳入持久化。

- 目标：至少持久化并恢复：
  - Group：`id/parentId/name/nodeIds/disabled/minimized/runtimeActive`（以及边界端口/代理点的状态与布局）
  - Custom Nodes：definitions（子图模板、ports、defaults、依赖信息）+ instances（type/definitionId/groupId/手动 gate 状态等）
- 要求：`loadLocalProject()` 恢复时必须同时恢复 graph + groups + custom definitions，避免 group-port 清理逻辑把 gate/proxy/frame 当成“孤儿节点”删掉。

### 2.5.11 deploy/patch：展开编译（flatten）为普通节点图

- 你已确认：deploy 到 client 时自动展开编译为普通节点图，client 不需要认识 Custom Node 类型。
- 约束：展开编译必须保证：
  - 每个实例的内部节点拥有独立 id（避免实例之间状态串扰）。
  - 子节点实例的内部参数状态正确随实例携带（复制=复制）。
  - 结构变化后端口迁移规则按 stable portKey 尽量保留，匹配不到则断线。

验收（Phase 2.5 结束门槛）：

- **没有伪 Node**：Custom Node 是真实注册节点；复制/撤销/选择/连线行为与普通节点一致。
- Gate 语义稳定：`manual AND wired`；所有实例都有 toggle；旧 Activate 迁移可用。
- Expand/折叠/多重展开/跨边界拖拽都可用，且不会产生穿墙连线；边界代理点类型正确、可沿边缘拖动并持久化。
- 导入/导出单文件可用：递归依赖打包；导入自动生成母节点并出现在 node-picker；循环嵌套会被阻止。
- 刷新浏览器后 Group/Custom Nodes 不丢（autosave/restore OK）。
- deploy/patch 在 client 端运行正确（flatten 后无 Custom Node 类型残留）。

---

> 从这里开始才进入“新能力”阶段（Root/Manager/ControlPlane/去中心化执行/AI）。

## Phase 3：Root/Manager 形态重构（同一 app：`/root` + `/manager`，强制 code-splitting）

范围：

- Root：保留 NodeCanvas 编辑器（幕后核心 / 真相源），并提供：
  - Group 分配给 Manager（开场前绑定）
  - Group policy（transferable）编辑
  - Admin：kill/全局模式切换/监控录制/资产分发策略（Assets Manager，仅 Root）
- Manager：演出控制面板（Ableton-like）：
  - 自动生成控件 + 宏控件 + 场景切换
  - Group reclaim 按钮
  - 只读图调试入口（可选展开）

验收：

- `/manager` 路由不加载 NodeCanvas/Rete chunk（以构建产物分析为证），演出者不必盯节点。

## Phase 4：ControlPlane v2（Server 仲裁 + 授权/转交/回溯/收回/终止）

范围：

- server：新增 control-plane 状态存储；连接/断线驱动 ownerStack；offer/accept/reclaim/kill；并实现“最小授权门禁”（controller/client 发控制必须带 `scopeGroupId` 且归属正确）。
- protocol：新增 control-plane message types + runtime schema 校验；扩展 actor 标识与 scope。
- sdk：按你的选择：
  - 对外仍保持 `ManagerSDK` / `ClientSDK` 两套 API（避免 client 变重）。
  - 对内抽取轻量 `sdk-core` 复用连接/消息收发/时间同步/重连等基础能力；重能力（executor/AI/control-plane）必须按需导入。
  - 授权后 client 侧仍走 `ClientSDK.sendControl/sendPlugin/...` 形态（SDK 内部做“已授权 + scope 校验”，避免误用）。

验收：

- 不依赖 NodeExecutor，单纯在控制平面上可跑通：offer → accept → ownership 更新 → disconnect pop → reclaim。

附加硬要求（你刚确认）：

- Server 重启/崩溃后尽量恢复控制平面状态（而不是全部回收）：
  - Redis **可选**：有 Redis 则持久化并尽量恢复；无 Redis 则退化为安全模式（见下条）。
  - 持久化优先级：Redis（后续若要更强持久化再扩展其它存储）。
- Redis 未配置/不可用时的退化策略：进入安全模式——所有已转交/授权立刻失效、控制权回到 Root/各自 Manager，必须重新授权。
- 安全模式下的副作用处理（你选定）：保留 Client/Display 当前正在发生的效果（音频/视频/屏幕/灯光等不强制停止），但冻结“授权 client/controller”继续下发新的 control/plugin/media（见下条）。
- 安全模式下的冻结范围（你选定）：只冻结 Client Controller（被授权的 client 不再允许发 control/plugin/media）；Manager 仍可继续控制以便快速恢复现场。
- 安全模式下的紧急通道（你选定）：Root 仍可发送 `kill/结束演出/stop-all` 等指令用于止损（不受“控制冻结”影响）。
- 安全模式下 Root 权限（你选定）：Root 也允许发送普通控制（例如 stopMedia/screenColor/关闭 Group）来辅助快速恢复现场。
- 安全模式下的仲裁（你选定）：Manager 的控制不再强制服从 Root 的“唯一真相源/仲裁”（更像临时应急模式）；恢复后再由 Root 重新建立一致性。
- 退出安全模式（你选定）：自动退出——只要 Root 在线并完成一次“重新发布/重新分配 Group”（或初始化完成），系统自动恢复到可控状态。
- 恢复判定信号（你选定）：Root 明确广播一次 `system/control-plane:resume`（最清晰、可审计）。
- 恢复后的重建策略（你选定）：Root 强制覆盖——重新发布 GraphState/Group 分配并统一下发关键状态，必要时会打断现场正在进行的效果以恢复一致性。
- UI 呈现（你选定）：只在 Root/Manager 显示“安全模式”提示与相关禁用；Client/Display 不提示（避免干扰观众）。
- 断线恢复采用 **5 秒 grace**（见 0.4），以避免短暂断网/Server 重启导致控制链路被打散。

决策点（需要你确认）：

- Root 的 kill/结束演出对各类 side-effect 的“清理名单”（声音/视频/屏幕/灯光等）。

## Phase 5：分布式执行器 v2（授权 client 变 controller：执行子图并可控他端）

范围：

- NodeExecutor v2：支持 remote backend（向 server 发 control/plugin/media，带 scopeGroupId）；并支持“只下发子图（A）”。
- client：接入 pendingTransfer UI；accept 后启动 executor；在 relinquish/reclaim/disconnect 时停机并清理。
- server：允许 controller role 发控制消息，并按 control-plane 表做授权/校验（无 token 体系）。
  - 放行策略（你选定）：按 group scope 放行——controller 在某个 `scopeGroupId` 下具备所有权即可发该 group 下产生的动作（仅做 `scopeGroupId` 归属校验；取消强校验）。
- Root/Manager：接收镜像流（best-effort，限频/可丢）用于监控/录制（你选择 best-effort 同步）。

验收：

- 核心闭环跑通（见 10.1），并且“断线不自动恢复”“不可转交回退”行为正确。

## Phase 6：插件体系一致化（Tone / 多媒体 / Visual / AI）

范围：

- plugin-core：统一插件契约与 host；节点只做“声明式配置 + 运行时 binding”。
- Tone：迁移到 AudioPlugin；Tone nodes 变稳定、可测试、职责单一。
- 多媒体：以 Layer 生命周期接口统一 Visual/Audio/Effect（你定义的分层语义）。
- AI：建立统一 AIPlugin 接口：
  - 代码随 app bundle 发布（你选择 A）
  - 模型/权重作为 Asset（后台下载；未启用 0 计算开销）

验收：

- 新增/替换一个插件不需要改巨石文件；Tone 系列不再“实现混乱”。

## Phase 7：多 Display 输出与输出路由（多屏、多路输出、统一 transport）

范围：

- Display 列表/路由 UI；多 display 同时输出；本机/远程 transport 统一抽象。
- 保留本机 MessagePort 时：纳入同一套消息模型与权限语义（不再是旁路）。

验收：

- 任意数量 display 可被 group 控制；路由规则清晰；不产生重复实现/重复状态机。

## Phase 8：AI 接口与模型资产化（后台下载；未启用 0 计算开销；手机本地推理）

范围：

- Assets Manager（Root）可定义模型分发策略（你选择 C），并把模型与其他资产纳入同一 manifest/ready 语义。
- 运行时可插拔：local inference / remote API / hybrid（保留接口，不强行一次做全）。
- 未启用 0 计算开销的实现策略（你选定）：AI 插件在未启用时 **完全不初始化**（不创建 WebGPU/WASM 上下文、不分配 buffer）；只有当 Root 打开对应 Group/节点并确认启用时才 init。

验收：

- 未启用模型时，不产生任何推理计算；启用后能参与节点调制链路且可被停用/回收。

## Phase 9：工程化：测试、可观测性、性能预算（演出级）

范围：

- 测试：control-plane 状态机单测 + server 集成测 + 关键 e2e。
- 可观测性：全链路 trace（actorId/scopeGroupId）；executor status 面板；关键错误告警。
- 性能预算：对高频 action 的预算与限频统一规则（server + sdk）。

验收：

- 你能在 Root 上回答：“现在谁控制哪些 groups？最近 1 分钟发生了哪些转交？为什么某条控制被拒绝？”
