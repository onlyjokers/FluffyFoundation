<!--
Purpose: FluffyFoundation 生产级交互演出系统完成计划的中文版。
-->

# FluffyFoundation 生产级 Harness 实施计划

> **给 Claude：** 必需子技能：执行本计划时，使用 `superpowers:executing-plans` 按任务逐项推进。

**目标：** 将 FluffyFoundation 完成到一个真实、安全、可扩展的现场演出操作系统。在这个系统中，Root、Manager、Client、Display、Server、Node Graph、NodeExecutor、Display transport、插件和 AI Operator 都由同一套语义命令模型治理。

**架构：** 本计划首先稳定验证体系、安全边界、协议、Scope、运行时状态和实时语义。随后将语义图操作迁移到 Canvas、CLI/API 与 AI 共享的 command bus 后面，让 Node Registry 成为 agent 可读行为的事实源；在此之后再完成 ControlPlane、分布式执行、Display、插件、AI、可观测性和发布准备。

**技术栈：** pnpm workspace、SvelteKit、NestJS、Socket.IO、TypeScript、`@shugu/protocol`、`@shugu/node-core`、`@shugu/sdk-*`、Playwright、Node test runner、Python harness scripts、Looooper workflow。

完成下面每一项，才表示项目已经可以用于真实运营，而不只是本地 demo。

## 项目规则

1. 在分支名、handoff、PR 和 evidence 中，使用当前活跃的 `FF-*` 项作为任务 ID。
2. 当前面的 P0 修复项还有未解决代码或 review 反馈时，不要开始后面的功能项。
3. 每一项都必须产出可执行检查，或者明确、带日期的风险接受记录。
4. 不接受只存在于 GUI 的语义行为。Canvas、CLI/API 和 AI 必须调用同一层 command/API。
5. 任何 AI 可见的 mutation 都需要 policy、validation、audit、rollback 和 redaction review。
6. 新增 package、外部 provider、持久化引擎或破坏协议兼容性的变更，都需要 ADR，并从 evidence 链接。
7. 每个 phase 退出时，必须更新 `.harness/status/current-phase.md`、`.harness/status/current-task.md`，并在 `.harness/handoffs/` 下留下 handoff。

---

## FF-00 - Harness 切换与基线冻结

**目标：** 将本 harness 安装为当前活跃开发系统，并冻结当前状态。

**交付物：**
- `.harness/`、`.looooper/` 和 `docs/harness/` 处于活跃状态。
- 现有历史计划保留为参考，但本文件成为活跃的完成计划。
- Baseline evidence 记录当前 git 状态、package 列表、scripts、已知 hotspots、当前 CI mismatch，以及外部评估文档路径。

**验证：**
- `pnpm harness:verify`
- `git status --short --branch`
- Baseline handoff 引用 `docs/PLAN_0109_MAJOR_GAPS_AND_SYSTEMIC_ISSUES.md` 和 `docs/PROJECT_STRUCTURE_AND_ARCHITECTURE_DEEP_DIVE.md`。

## FF-01 - 统一 Verify、CI 与 Evidence Artifacts

**目标：** 让验证成为真正的 gate，而不是约定俗成。

**交付物：**
- 根目录 `pnpm verify` 成为本地/CI 的单一命令。
- CI 运行 `pnpm verify`，而不是 `pnpm build`。
- `verify` 包含 dependency guards、lint、build、node-core tests、node spec validation、node-executor offline e2e、harness validation、hotspot ratchet，以及所有 phase-specific checks。
- CI 在可用时上传 logs/traces/screenshots。

**验证：**
- GitHub Actions 在默认分支上显示 required status checks。
- 故意破坏的 boundary import 和破坏的 node spec 在本地失败。

## FF-02 - 拓扑所有权与 No-God-Object Ratchets

**目标：** 在重构推进期间，阻止架构债继续增长。

**交付物：**
- Hotspot allowlist 用 max-line ratchets 冻结当前大文件。
- Boundary guard 从 protocol/node-core 扩展到 Root、Manager、Display、SDK、server、plugin、AI 和 persistence lanes。
- CODEOWNERS 为 architecture、security、AI、server、UI、protocol、runtime 和 release paths 映射真实 owner。
- 新文件/package policy 要求 purpose header；拓扑变更需要 ADR。

**验证：**
- `pnpm harness:hotspots`
- `pnpm guard:deps`
- 无效 deep import fixture 失败。

## FF-03 - Runtime Protocol Schema 与兼容性

**目标：** 在消息进入 routing 或 execution 之前拒绝 malformed messages。

**交付物：**
- 为 `ControlMessage`、`SensorDataMessage`、`MediaMetaMessage`、`PluginControlMessage` 和 `SystemMessage` 建立 runtime schemas。
- 为当前 protocol version 和 migration/error paths 建立 compatibility fixtures。
- 结构化 reject reason，包含 actor、scope、message type、path 和 policy decision。
- `isValidMessage` 变成 schema-backed validator，而不是浅层 type/version check。

**验证：**
- Bad payloads 在 protocol/server tests 中失败。
- Server logs 包含结构化 validation codes。

## FF-04 - Manager/Auth/CORS 安全基线

**目标：** 关闭最容易被利用的 control-plane takeover paths。

**交付物：**
- 默认拒绝 Manager role，除非存在配置好的 secure key，或者显式启用本地 insecure flag。
- 生产 CORS 不是 `*`。
- 移除 hardcoded frontend login secret，或者隔离到显式 dev mode。
- 文档化 HTTP fallback，并阻止它用于 production manager control。

**验证：**
- 缺失 manager key 的 denial test。
- production-like boot test 证明 insecure config 会 fail closed。

## FF-05 - Scope、Audit 与 Command Envelope 修复

**目标：** 让 `scopeGroupId` 成为可信的授权与审计 key。

**交付物：**
- SDK-manager 保留调用方 scope，不再强制写成 `SYSTEM_SCOPE_GROUP_ID`。
- 每个 non-system control command 都携带 `scopeGroupId`、actor、role、correlation ID 和 idempotency key。
- Server 只归一化允许的 envelope fields，并拒绝 ambiguous scope。
- 为每个 mutating command 创建 audit record contract。

**验证：**
- batching/flush scope preservation 的 unit tests。
- missing/wrong scope 的 server authorization tests。

## FF-06 - Server 状态策略与多实例契约

**目标：** 移除当前“Redis broadcast 但 local truth”的歧义。

**交付物：**
- ADR 在显式 single-server production mode 与 registry/selection/ownership/control-plane snapshot shared state 之间作出选择。
- 如果选择 single-server：boot/runtime checks 让该策略可见，并拒绝不支持的 clustered configs。
- 如果选择 shared-state：registry/control-plane updates 通过 publish/subscribe 在实例间收敛。
- Status UI 和 logs 显示当前活跃的 state strategy。

**验证：**
- Single-server guard 或 two-instance convergence test。
- Ownership snapshot 不能 silently diverge。

## FF-07 - Realtime Delivery Contract、Backpressure 与 Final-Value Semantics

**目标：** 让 realtime throttling 可预测，而不是两层都 silent drop state。

**交付物：**
- 明确定义 volatile telemetry、latest-state controls、reliable commands 和 scheduled commands。
- SDK/server throttling 共享一份 delivery contract。
- Latest-state keys 被 replay 或移除；不存在 dead pending map。
- Metrics 追踪 dropped、coalesced、delivered、late 和 rejected messages。

**验证：**
- coalescing 和 last-value delivery 的 deterministic tests。
- Load test 记录 latency/drop budgets。

## FF-08 - Root/Manager 产品形态拆分

**目标：** Root 成为重型 authoring environment；Manager 成为轻量 performance console。

**交付物：**
- `/root` 拥有 graph authoring、Group publishing、permissions、recovery 和 global stop。
- `/manager` 消费已发布 Groups，默认不加载重型 Rete/NodeCanvas bundles。
- Shared stores 拆分为 connection、client registry view、display status、group controls 和 root authoring domains。
- Bundle 和 import guards 防止 Manager 重新吸收 Root code。

**验证：**
- Build/bundle evidence 显示 Manager path 排除 NodeCanvas/Rete。
- Manager 可以通过 published Group controls 执行现有 control paths。

## FF-09 - Semantic Graph Object Model 与 Command Bus

**目标：** 为 Canvas、CLI/API 和 AI 建立同一层语义操作层。

**交付物：**
- `SemanticGraphSnapshot` 排除 UI noise，但包含 nodes、definitions、ports、params、Group boundaries、connections、execution partitions、runtime status、device capabilities、errors、permissions 和 current revision。
- Command bus 支持 add/remove/archive node、connect/disconnect、update params、create/update/archive Group、deploy/stop partition 和 proposal workflow。
- Commands 是 transactional：dry-run validation、policy check、apply、audit、history、rollback token。
- Canvas adapters 将 UI gestures 翻译成 commands，而不是直接 mutation graph internals。

**验证：**
- CLI fixture 执行与 Canvas 相同的 semantic operation。
- UI-only semantic mutation guard 在 direct graph mutation 时失败。

## FF-10 - Node Registry V2 与 Agent-Readable Node Definitions

**目标：** 让每种 node type 都可被发现、验证、迁移，并且 AI 能理解，而不需要 hardcoded logic。

**交付物：**
- NodeDefinition 包含 version、category、platform targets、side-effect class、permission needs、port schemas、param schemas、units、ranges、defaults、compatibility rules、examples、risk notes 和 AI-readable description。
- JSON specs 与 `@shugu/node-core` definitions 在同一 registry loader 后收敛。
- 新 node fixture 证明注册不需要编辑 global switch。
- Registry 为 AI context 输出 compact agent summaries。

**验证：**
- `pnpm validate:node-specs`
- No-global-switch registry test。
- AI context snapshot 自动包含新增 fixture node。

## FF-11 - Graph Validation、Migrations、History 与 Rollback

**目标：** 让 graph state 可以安全演进并恢复。

**交付物：**
- Validator 检查 endpoint existence、port compatibility、param bounds、Group boundaries、execution platform、side effects、cycles、disabled nodes 和 deployability。
- 带 migrations 和 fixtures 的 versioned graph/project schema。
- Semantic history 捕获有意义的变更，但排除 layout-only noise。
- Rollback 恢复之前的 semantic revision，并安全 stop/redeploy partitions。

**验证：**
- 旧 fixtures 迁移到当前版本。
- Bad connections 和 param overflow 以 structured errors 失败。
- Rollback scenario 恢复 output behavior。

## FF-12 - Group Sovereignty 与 ControlPlane V2

**目标：** 让 Group ownership 成为中心授权单位。

**交付物：**
- Group owner、owner stack、transferable flag、public/internal surfaces、visible-but-not-editable policy、reclaim、release、archive、restore。
- Root 永远拥有 emergency authority。
- Manager/client/service/AI operators 拥有明确 capabilities 和 scope。
- Server 对 commands 强制执行 Group ownership。

**验证：**
- Illegal actor denial tests。
- Manager reclaim 和 Root stop-all scenario。
- Group archive 是默认 delete behavior。

## FF-13 - Client-As-Controller Transfer Lifecycle

**目标：** 允许被授权 clients 临时控制 Groups，同时不绕过 safety。

**交付物：**
- Offer/accept/deny transfer，包含 TTL、目标 client UI confirmation、revoke、disconnect fallback 和 owner-stack recovery。
- Client controller commands 携带 actor role 和 scoped capability。
- 为 pending/accepted/revoked/control lost 提供 human-visible status。

**验证：**
- Transfer 未 accept 时会 expire。
- Disconnect 将 ownership 返回给前一个 operator。
- Unauthorized client control 被拒绝。

## FF-14 - Distributed NodeExecutor V2 与 Execution Partitions

**目标：** 将高频行为移动到正确执行目标，并具备可观测 lifecycle。

**交付物：**
- Execution partitions 定义 target platform：manager、client、display、server、worker 或 local-only。
- Deploy/start/stop/remove/redeploy 都是 command-bus operations，并带 validation、capability checks、revision binding 和 status。
- Client/display partitions 只能通过 ControlPlane 控制 allowed targets。
- Watchdog、resource budgets 和 failure reports 都是 structured。

**验证：**
- Deploy bad capability 被拒绝。
- Stop/remove 恢复 manager-side fallback。
- Partition revision mismatch 被检测出来。

## FF-15 - Display Transport 统一与 Multi-Display Routing

**目标：** 消除“看起来已连接但 output 没有变化”的状态。

**交付物：**
- Local MessagePort 和 server fallback 实现同一 transport interface。
- Display status 区分 discovered、paired、reachable、degraded、fallback 和 failed。
- Multi-display routing 支持 groups、named displays、capabilities、local media limits 和 server-deliverable assets。
- Display operations 以 reason 回报 ack/nack。

**验证：**
- Local bridge success scenario。
- 强制 local bridge failure 后通过 server fallback，并可见地更新 output。
- Multi-display routing fixture 向两个 displays 发送不同 outputs。

## FF-16 - Asset、Media、Audio 与 Visual Pipeline Hardening

**目标：** 让演出媒体在 rehearsal 和 show 条件下可靠。

**交付物：**
- Asset manifest 包含 IDs、checksums、MIME、kind、duration/dimensions、variants、cache policy 和 permissions。
- Client/display 的 preload/readiness model，包含 timeout 和 retry。
- 统一 media/audio/visual node side effects 与 cleanup。
- Local-media references 可移植，或者明确标记为 local-only。

**验证：**
- image、video、audio 的 upload/preload/play scenario。
- Missing asset 产生 actionable error。
- Stop-all 清理 media、sound、color、visual scenes 和 node executors。

## FF-17 - Plugin Host 与 Capability Lifecycle

**目标：** 阻止 Tone、multimedia、visual、AI 和未来 integrations 各自发明 lifecycle rules。

**交付物：**
- Plugin contract 覆盖 load、init、start、stop、configure、dispose、status、capabilities、errors、resource budgets 和 side effects。
- Registry-driven plugin discovery 和 version compatibility。
- 没有 plugin 可以绕过 commands/events mutation core state。
- Plugin failure isolation 防止一个 plugin 破坏 show loop。

**验证：**
- Plugin lifecycle tests。
- Failure fixture 证明 dispose/rollback。

## FF-18 - AI Operator Semantic Runtime

**目标：** 在 policy 约束内，让 AI 拥有与 human Manager/Root 相同的 semantic operation power。

**交付物：**
- AI intent pipeline：semantic snapshot pack、registry summary、permission context、validation reports、planner、proposal、dry-run、execute、observe、repair loop。
- AI 可以 add nodes、remove/archive nodes、connect/disconnect、modify params、insert mapping/normalize nodes、adjust Group internals、deploy/stop partitions，并产出等待 human approval 的 proposals。
- AI 永远不把 canvas layout noise 当作 primary context。
- AI 报告精确 command sequence、expected output change、risk、rollback 和 observed result。

**验证：**
- Natural-language scenario：gyro rotation 驱动 tense flashlight rhythm。
- Natural-language scenario：display visual 变成 breathing-like。
- AI repair scenario 使用 validation errors 修复 param overflow 或 incompatible connection。

## FF-19 - AI Safety、Policy、Cost、Redaction 与 Audit

**目标：** 保持 creative AI 强大，同时不让它变成 unbounded mutation engine。

**交付物：**
- Policy engine 将 commands 分类为 auto、approval-required 或 denied。
- Redaction layer 移除 secrets、tokens、raw private media paths 和不必要 UI state。
- AI cost/rate budgets 与 model/provider abstraction。
- 针对 node descriptions 和 external inputs 的 prompt-injection 与 tool-permission tests。
- Audit trail 记录 AI prompt hash、snapshot revision、commands、validation、policy、approval、execution、observation、rollback。

**验证：**
- AI 不能在没有 approval 的情况下执行 destructive/high-risk command。
- Redaction fixture 证明 secrets 不会出现在 model context。

## FF-20 - Observability、Reporting 与 Operator Console

**目标：** 让 failures 在 show 期间可见、结构化且可行动。

**交付物：**
- 为 validation errors、permission denials、transport failures、node executor status、display status、asset readiness、AI proposals 和 rollback 提供 structured events。
- Metrics 覆盖 latency、traffic、errors、saturation、drops、FPS、audio readiness、device capability 和 command outcomes。
- Operator console 显示 health、active partitions、connected devices、failed commands、pending transfers 和 kill-switch state。

**验证：**
- Scenario artifacts 包含 logs/metrics/trace excerpts。
- Reviewer 可以从 structured reports 诊断 failed display update。

## FF-21 - Executable Golden Scenarios

**目标：** 将 product readiness 转换为 tests，而不是 prose。

**交付物：**
- 本 harness 中的 Golden scenarios 变成 Playwright、CLI、contract、trace-replay 或 load-test fixtures。
- Scenarios 覆盖 Manager->Client、Root publish、Display fallback、asset preload、NodeExecutor deploy、ControlPlane transfer/reclaim、AI graph edit、rollback 和 show stop。
- CI 分别标记 slow scenarios 和 release scenarios。

**验证：**
- `pnpm test:golden` 或等价 phase command。
- 每个 scenario 存储 evidence artifacts。

## FF-22 - Performance Budgets、Load 与 Show Mode Resilience

**目标：** 证明系统能承受真实设备数量和失败条件。

**交付物：**
- 为 latency、drop rate、CPU、memory、FPS、startup time、deploy time 和 recovery time 建立 budgets。
- 支持大量 clients 和 displays 的 load harness。
- Rehearsal mode 与 show mode configuration。
- Kill-switch 与 safe-mode drills：stop media、clear screens、stop executors、revoke rogue controllers、reconnect。

**验证：**
- 带 accepted thresholds 的 load test report。
- network interruption、display refresh、client reconnect 和 Root stop-all 的 drill evidence。

## FF-23 - Security、Supply Chain、Release 与 Operations

**目标：** 让 production deployment 可重复且可防御。

**交付物：**
- Security workflows 覆盖 dependency review、secret scanning、CodeQL 或等价方案，以及 provenance notes。
- Production config validation 与 deployment checklist。
- Projects/assets/state 的 backup/restore strategy。
- Release train 包含 version、migration、rollback 和 incident procedure。

**验证：**
- Release candidate checklist 完成。
- Security scans 通过，或存在 accepted issues。

## FF-24 - Dogfood、Documentation 与 Production Launch Readiness

**目标：** 只有在真实 rehearsal workflows 反复通过之后才退出。

**交付物：**
- Root、Manager、Client、Display、AI Operator、rehearsal、show mode、recovery 和 troubleshooting 的 operator manual。
- 添加 nodes/plugins/connectors 的 developer guide，覆盖 registry、validation、tests 和 AI descriptions。
- 跨多个 sessions 的 dogfood rehearsal logs。
- Final launch review 关闭所有 critical risks。

**验证：**
- Full golden suite 在 release candidate 上通过。
- 至少两份 rehearsal/dogfood reports 证明稳定运行和有文档记录的恢复流程。
- Final phase review 声明 production readiness，或列出明确 blockers。
