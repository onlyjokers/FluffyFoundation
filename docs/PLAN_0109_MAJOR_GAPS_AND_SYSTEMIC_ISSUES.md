<!--
Purpose: Summarize systemic architecture risks and major gaps in the current codebase, using docs/PlanDocs/0109_RootManagerControlPlane/plan.md as a secondary target-state reference.
-->

# 相对 `0109` 总计划的系统性问题与差距报告

> 参考基线：`docs/PlanDocs/0109_RootManagerControlPlane/plan.md`
>
> 重要说明：本报告把 `plan.md` 当作“目标态参考”，不是绝对真理。判断优先级以当前代码实际行为、线上风险和演出稳定性为准。

---

## 1. 结论摘要（先看这个）

当前项目已经具备较强功能覆盖，但仍存在会直接影响“演出级稳定性/可控性”的系统问题。最关键的不是“某个 bug”，而是以下结构性矛盾：

1. 安全边界与授权模型仍不稳固（可被配置错误轻易击穿）
2. 多实例一致性设计未闭环（状态与路由并非真正分布式）
3. 实时链路采用多层静默丢包策略，缺少端到端一致性保障
4. 协议与运行时校验不足，错误常在深层执行期才暴露
5. Display 双通道在语义上仍有分裂与错觉状态
6. 巨石模块和 `@ts-nocheck` 热区仍是长期演进阻力
7. 工程化门禁与可观测性未达到 Phase 9 目标

---

## 2. 评估方式（如何对齐 0109 计划）

本报告按“目标态 vs 当前态”比较，目标态来自计划中的核心约束：

- 角色与控制权（plan 0.2、3、4、5）
- Scope 审计与授权门禁（plan 0.5、3.3、5.3）
- Display 统一 transport 与多屏能力（plan 8、Phase 7）
- 插件化与 AI 资产化（plan 7、Phase 8）
- 工程化（测试、可观测性、性能预算，plan 9、Phase 9）

---

## 3. 重大问题清单（按严重度）

## P0-1. 控制权安全边界容易失效（配置级单点）

### 目标态（plan）

- 控制权由 ControlPlane 仲裁，公网环境必须有最小授权门禁（plan 0.5 / 3.3 / Phase 4）。

### 当前证据

- `apps/server/src/events/events.gateway.ts:127-134`：未配置 `SHUGU_MANAGER_KEY` 时，请求 `role=manager` 会直接被授予 manager。
- `apps/server/src/main.ts:36-43`：证书缺失时回退 HTTP，且 `cors.origin='*'`。
- `apps/manager/src/lib/stores/auth.ts:16`：前端登录口令是硬编码常量。

### 为什么是系统问题

这不是“某个接口校验遗漏”，而是控制平面根边界（谁可发控制消息）会因部署配置退化。

### 风险后果

- 误配置即可把管理权限暴露给任意连接方。
- 明文链路下 manager key 可被窃取复用。

---

## P0-2. 多实例一致性尚未成立（看似可扩展，实际分裂）

### 目标态（plan）

- Server + ControlPlane 要能支撑稳定仲裁和状态一致（plan 3、Phase 4、Phase 9）。

### 当前证据

- `apps/server/src/client-registry/client-registry.service.ts:27-31`：clients/managers/socket 映射全在本地内存。
- `apps/server/src/message-router/message-router.service.ts:193-209`：目标 socket 解析依赖本地 registry。
- `apps/server/src/control-plane/control-plane.service.ts:108`：snapshot 在本进程内维护。
- `apps/server/src/control-plane/control-plane.service.ts:122-139`：仅初始化时从 Redis 读取一次，无订阅增量同步。

### 为什么是系统问题

路由真相与授权真相都不是全局一致数据源，多实例只能“部分共享消息”，不能“共享控制语义”。

### 风险后果

- manager 看见的 client 列表与可控目标会因实例不同而分裂。
- ownership 判定可能在不同实例上得出不同结果。

---

## P0-3. Scope 语义在发送链路中丢失

### 目标态（plan）

- 除系统指令外，控制消息要强制带 `scopeGroupId`，用于授权与审计（plan 5.3）。

### 当前证据

- `packages/sdk-manager/src/manager-sdk.ts:397`：普通 control 进入队列时未携带 scope。
- `packages/sdk-manager/src/manager-sdk.ts:500-507`：flush 时 scope 固定写入 `SYSTEM_SCOPE_GROUP_ID`。

### 为什么是系统问题

Scope 是授权模型和审计模型的主键；发送端吞掉 scope，后续任何 server 判定与回放都会失真。

### 风险后果

- 分组级控制边界被弱化。
- 归因审计数据不可信。

---

## P1-1. 实时链路“双层丢弃”导致一致性漂移

### 目标态（plan）

- 高频链路允许丢帧，但需受统一预算与策略治理（plan 5.1、9.3、Phase 9）。

### 当前证据

- SDK 侧：`packages/sdk-manager/src/manager-sdk.ts:449-455` 直接跳过更新，且“pending latest”键未被回放使用。
- Server 侧：`apps/server/src/message-router/message-router.service.ts:100-107` 限频 + `:111-113` volatile emit。

### 为什么是系统问题

同一条实时链路在两层各自裁剪，缺少端到端“最终值/一致性”合同。

### 风险后果

- 多端状态随网络/负载条件产生不可预测漂移。
- 演出时表现为“同操作，不同设备不同步”。

---

## P1-2. 协议与运行时的校验能力不足

### 目标态（plan）

- 至少 server 侧具备 runtime schema 校验（plan 10.3 / Phase 4 / Phase 9）。

### 当前证据

- `packages/protocol/src/helpers.ts:268-285`：`isValidMessage` 仅校验 type/version 与少量 meta，不校验 payload 结构。
- `packages/sdk-client/src/node-executor.ts:522-543`：deploy payload 仅做浅层检查。
- `packages/node-core/src/graph-state/validate.ts` 存在，但未接入执行链路。

### 为什么是系统问题

协议层“放行宽、兜底晚”，错误在 executor/runtime 深层暴露，排障成本高且影响不可控。

### 风险后果

- malformed graph 或不兼容 payload 可进入执行层导致运行时异常。

---

## P1-3. Display 双通道仍存在语义分裂与状态错觉

### 目标态（plan）

- Local bridge 与 server transport 统一抽象，多 display 路由清晰（plan 8、Phase 7）。

### 当前证据

- `apps/manager/src/lib/display/display-bridge.ts:595` / `:624`：`controlPort` 缺失时直接 return，错误不外显。
- `apps/manager/src/lib/components/DisplayPanel.svelte:20-23` + `:107-115`：有 display 即可开启镜像，不等价于链路真正可达。
- `apps/manager/src/lib/components/nodes/node-canvas/runtime/node-executor-transport.ts:73-90`：display target 会先做本地文件注册语义，远程 display 不一定可消费。

### 为什么是系统问题

Display 是演出输出面；“看起来已连接”但实际消息没到，属于系统可信度问题。

### 风险后果

- 操作员误判现场状态，导致输出缺失或滞后。

---

## P1-4. 控制平面生命周期策略不完整（pending/恢复）

### 目标态（plan）

- 转交、断线回溯、安全模式、恢复流程可观测且可预测（plan 3、Phase 4）。

### 当前证据

- `apps/server/src/control-plane/control-plane.service.ts:296`：pendingTransfer 无 TTL。
- `apps/server/src/control-plane/control-plane.service.ts:203-215`：仅在当前 owner 断开时清 pending。
- `apps/server/src/control-plane/control-plane.service.ts:142-148`：无 Redis 时 persist 直接跳过。

### 为什么是系统问题

状态机缺少“时间与异常”维度，系统会出现“悬挂状态”与恢复语义不稳定。

### 风险后果

- transfer 卡死、恢复后控制权状态不可预期。

---

## P2-1. 巨石热区仍压在系统关键路径上

### 目标态（plan）

- Phase 0/2 要持续消除巨石与双轨，保持可维护边界（plan 11、10.3）。

### 当前证据

- 关键大文件仍集中在 NodeCanvas、ReteControl、group-controller、display store、sdk 核心。
- `@ts-nocheck` 仍存在于多个 NodeCanvas 子组件。

### 为什么是系统问题

关键路径改动会跨模块连锁，缺少类型保护的区块会放大回归风险。

### 风险后果

- 功能演进速度和稳定性无法同时提升。

---

## P2-2. 工程门禁未达到“演出级”

### 目标态（plan）

- 质量闸门、测试、可观测性、性能预算形成闭环（Phase 1.5、Phase 9）。

### 当前证据

- `.github/workflows/ci.yml:44` 运行 `pnpm build`，但根脚本只有 `build:all`。
- `package.json` 缺少统一 `test` 聚合入口。
- `tests/load` 不在 workspace（`pnpm-workspace.yaml`），且结果文件入库。

### 为什么是系统问题

没有稳定门禁，所有架构目标都会退化成“靠人工记忆执行”。

### 风险后果

- 回归无法提前拦截，线上风险后移。

---

## 4. 与 0109 计划阶段的差距图（简版）

- Phase 0~6：主体框架基本已具备，但存在“实现质量与语义一致性不足”的后遗症。
- Phase 7（多 Display 输出路由）：未完整落地。
- Phase 8（AI 模型资产化 + 未启用零开销）：尚处接口/基础设施阶段。
- Phase 9（测试/可观测/性能预算）：未形成工程化闭环，是当前最大交付风险源。

---

## 5. 对 plan 自身需要二次校准的点（你提醒的重点）

你提到“计划本身也可能有问题”，这点成立。当前建议重点复核：

1. `scope-only` 最小门禁是否足够应对公网对抗场景（是否需要可配置强校验层）
2. “Root SOT 放在浏览器本地”的恢复策略是否满足现场容灾要求
3. 单服务器假设与 Redis/多实例扩展目标之间的运营策略是否统一

---

## 6. 优先级建议（只给系统级）

1. 先修 P0：安全边界、Scope 语义、多实例一致性策略
2. 再修 P1：实时一致性合同、协议校验、Display 语义统一
3. 最后补 P2：巨石治理收尾 + CI/测试/可观测/性能预算闭环

这个顺序对应的是“先防失控，再防失真，再提效率”。
