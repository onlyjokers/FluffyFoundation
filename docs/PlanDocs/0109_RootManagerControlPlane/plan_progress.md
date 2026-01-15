# 0109 Root/Manager ControlPlane Plan - 执行进度

> Purpose: 记录本计划（`docs/PlanDocs/0109_RootManagerControlPlane/plan.md`）的执行日志与勾选状态。

## 总进度

- [x] Phase 0：大清洗与新骨架（先解耦/删冗余/拆巨石；不引入新功能）
- [x] Phase 1：功能回归（保证“现有全部能力”在新骨架上跑通）
- [x] Phase 1.5：Pre-Phase2 Gate（基线固化 / 架构地图 / 质量闸门）
- [x] Phase 2：删除旧实现（只保留一套路径）+ 关键护栏落地（防止再变屎山）
- [x] Phase 2.2：组织形式对齐（同层级能力统一入口与目录归属）
- [x] Phase 2.3：Server 语义收敛（Protocol / 最小认证 / Presence）
- [x] Phase 2.5：Nodalization（自定义节点 / 母子节点 / Uncoupled / 循环嵌套防止）+ Group 持久化
- [ ] Phase 3：Root/Manager 形态重构（同一 app：`/root` + `/manager`，强制 code-splitting）
- [ ] Phase 4：ControlPlane v2（授权/转交/回溯/收回/终止；Server 仲裁可开关）
- [ ] Phase 5：分布式执行器 v2（授权 client 运行子图并可控他端）
- [ ] Phase 6：插件体系一致化（Tone / 多媒体 / Visual / AI 统一契约）
- [ ] Phase 7：多 Display 输出与输出路由（多屏、远程/本地通道统一）
- [ ] Phase 8：AI 接口与模型资产化（后台下载；未启用 0 计算开销；手机本地推理）
- [ ] Phase 9：工程化：测试、可观测性、性能预算（演出级稳定性）

---

## 执行日志

### 2026-01-09

- [ ] 初始化：设计冻结（待你确认关键决策点）
- [x] Phase 0 启动：新增依赖护栏脚本 `scripts/guard-deps.mjs`（阻止 deep-import；约束 protocol/node-core 依赖）。
- [x] Phase 0 验证：运行 `node scripts/guard-deps.mjs`（无违规）。
- [x] Phase 0 文档产出：新增 `docs/PlanDocs/0109_RootManagerControlPlane/phase0_artifacts.md`（依赖规则 v0 / 删除清单 v1 / 回归清单 v1）。
- [x] Phase 0 拆分：`packages/node-core/src/definitions.ts` 拆为 `packages/node-core/src/definitions/*` 模块，保留原有导出入口。
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/node-core run lint`（仅 warnings：no-explicit-any / unused-vars，历史问题未处理）。
- [x] Phase 0 拆分：`apps/manager/src/lib/components/nodes/NodeCanvas.svelte` 拆出 runtime 模块 `apps/manager/src/lib/components/nodes/node-canvas/runtime/*`（patch 部署/override、client selection、sleep socket sync）；主文件 3793 → 2295 行。
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/manager run lint`（0 errors；warnings 为历史问题 + TS 版本提示）。
- [x] Phase 0 拆分：继续按职责拆分 `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`，新增 controller/utils 模块：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/focus-controller.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/clipboard-controller.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/frame-drag-controller.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/utils/group-port-utils.ts`

  主文件 2295 → 1573 行。
- [x] Phase 0 格式化：运行 `pnpm exec prettier --write apps/manager/src/lib/components/nodes/NodeCanvas.svelte`（修复 tab/space 混用，避免 eslint `no-mixed-spaces-and-tabs`）。
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/manager run lint`（0 errors；warnings 为历史问题 + TS 版本提示）。
- [x] Phase 0 Transport：新增 Display transport 抽象骨架 `apps/manager/src/lib/display/display-transport.ts`（local MessagePort bridge 优先；未 ready 时 server `group=display` fallback）。
- [x] Phase 0 收敛：`apps/manager/src/lib/stores/manager.ts`、`apps/manager/src/lib/nodes/specs/register.ts` 的 Display 控制发送统一走 `displayTransport.sendControl(...)`（减少重复判断/offset 换算）。
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/manager run lint`（0 errors；warnings 为历史问题 + TS 版本提示）。
- [x] Phase 0 拆分：`apps/client/src/lib/stores/client.ts` 拆为可维护模块（保留 `$lib/stores/client` 单入口导出）：
  - `apps/client/src/lib/stores/client/client-state.ts`（state/permissions/latency）
  - `apps/client/src/lib/stores/client/client-visual.ts`（visual scenes/camera/effects）
  - `apps/client/src/lib/stores/client/client-media.ts`（audioStream + media clip + video/image state）
  - `apps/client/src/lib/stores/client/client-control.ts`（executeControl + plugin control）
  - `apps/client/src/lib/stores/client/client-runtime.ts`（SDK lifecycle + controllers + permissions flow）
  - `apps/client/src/lib/stores/client/client-tone.ts`（Tone enablement + readiness reporting）
  - `apps/client/src/lib/stores/client/client-screenshot.ts`（push-image-upload 截图上传）
  - `apps/client/src/lib/stores/client/client-identity.ts`（device/session identity）
  - `apps/client/src/lib/stores/client/client-utils.ts`（shared utils）
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/client run lint`（0 errors；warnings 为历史问题 + TS 版本提示）。
- [x] Phase 0 拆分：`packages/sdk-client/src/tone-adapter.ts` 拆为可维护模块（保留原入口为薄导出层）：
  - `packages/sdk-client/src/tone-adapter/engine-host.ts`（Tone 加载 / transport / graph wiring）
  - `packages/sdk-client/src/tone-adapter/nodes.ts`（node instances + loop/scheduling + audio-data）
  - `packages/sdk-client/src/tone-adapter/register.ts`（NodeRegistry definitions）
  - `packages/sdk-client/src/tone-adapter/state.ts`（shared state/constants）
  - `packages/sdk-client/src/tone-adapter/utils.ts`（parsing helpers）
  - `packages/sdk-client/src/tone-adapter/types.ts`（shared types）
- [x] Phase 0 验证：运行 `pnpm --filter @shugu/sdk-client run lint`（0 errors；warnings 为历史问题 + TS 版本提示）。

### 2026-01-10

- [x] Phase 1 固定验证命令：
  - `pnpm guard:deps` ✅
  - `pnpm --filter @shugu/node-core run test` ✅
  - `pnpm --filter @shugu/sdk-client run build` ✅
  - `pnpm --filter @shugu/manager run build` ✅（有 chunk size / svelte warnings，历史问题未处理）
  - `pnpm --filter @shugu/client run build` ✅（有 svelte warnings，历史问题未处理）
- [x] Phase 1 回归环境（为避开默认端口占用，统一用一套 dev 端口）：
  - Server：`https://localhost:3002`（`PORT=3002`；`ASSET_WRITE_TOKEN=dev-write`）
  - Manager：`https://127.0.0.1:5176/manager`
  - Client：`https://127.0.0.1:5177/?server=https://localhost:3002&e2e=1`
  - Display：`https://127.0.0.1:5175/display`
- [x] Phase 1 回归 playbook：新增 `docs/PlanDocs/0109_RootManagerControlPlane/phase1_regression_playbook.md`（下次回归复用指南 + 常见坑排查）。
- [x] Phase 1 回归清单 v1（`phase0_artifacts.md:66`）逐项验证：
  - [x] Control chain：Manager -> Server -> Client 控制链路 OK（`screenColor` Play/Stop Selected 生效）。
  - [x] Control chain：Manager -> Display local bridge OK（DisplayPanel `status=connected / ready=yes`；`Send To Display` 开启后 `screenColor` 可镜像到 Display）。
  - [x] Node graph & runtime：编辑/loop/scene OK（构造 `client-object <-> proc-client-sensors` 环；`localLoops=1`；`exportGraphForLoop` OK）。
  - [x] Node graph & runtime：deploy/export/import OK（`exportGraphForPatchFromRootNodeIds(scene-out)` OK；`exportGraph/loadGraph` round-trip OK）。
- [x] Node graph & runtime：功能集冒烟 OK（覆盖 `screenColor / flashlight / showImage/hideImage / visualScenes(mel-scene)` 等关键动作）。
  - [x] Assets & media：manifest 扫描 + 下发 OK（上传 `测试.png` 后 manifest 更新，ClientSelector dot 进入 `ready`；Display 侧 `multimediaCore` preload ready）。
- [x] Assets & media：Client 多媒体层语义 OK（`showImage`/`hideImage`、`visualScenes` 行为正确）。
  - [x] Assets & media：媒体动作 OK（`image upload`、`flashlight on/off`、`mel-scene` 切换、`screenColor`）。
  - [x] Stability：Manager 在 Start/Stop/Deploy/Scene switch 冒烟流程中未崩（tab 仍可切换）。
  - [x] Stability：高频控件 OK：开启 `▶ Stream On` 后，连续改动 ScreenColor 参数可产生多次 `screenColor` 下发（1s 内 `delta=5`）。
- [x] Phase 1 回归中发现并修复的问题（为保证 checklist 全绿）：
  - [x] 修复：Assets `HEAD /content` 500（非 ASCII filename 导致 Node header `ERR_INVALID_CHAR`）→ 改为 ASCII fallback `filename=\"...\"` + RFC 5987 `filename*=`。文件：`apps/server/src/assets/assets.controller.ts`。
  - [x] 修复：Server dev 输出目录权限问题（历史 `dist-dev` 为 root-owned 导致 watch unlink 失败）→ `apps/server/tsconfig.dev.json`：`outDir` 改为 `./dist-dev-local`。
  - [x] 修复：Display 在 server fallback 后无法 Reconnect 回到 local（MessagePort）+ local ready 上报只发一次 → `apps/display/src/lib/stores/display.ts`：允许 late-pair、ready 分通道上报、local 模式忽略 server control/plugin/media、dev 允许同 hostname 任意端口 origin。
  - [x] 修复：Manager 的 `Stream On` 更新路径不触发（reactive deps 缺失）→ `apps/manager/src/lib/features/*/*Control.svelte`：`queueUpdate(...)` 改为显式参数驱动（ScreenColor/Flashlight/Synth）。

- [x] Phase 1.5.A 基线固化：
  - `git status --porcelain` ✅（clean）
  - Tag：`phase1-baseline-20260110` ✅（annotated tag；commit: `01934da3`）
- [x] Phase 1.5.B 质量闸门：
  - `pnpm guard:deps` ✅（`[deps-guard] ok (602 files scanned)`）
  - `pnpm lint` ✅（0 errors；warnings 为历史债，当前共 63 warnings，以 `no-explicit-any`/unused-vars 为主）
  - `pnpm build:all` ✅（通过；有 chunk size / vite-plugin-svelte warnings，作为 Phase 3 code-splitting 的证据锚点）
- [x] Phase 1.5.C 架构地图：新增 `docs/ARCHITECTURE.md` ✅（repo map / 数据流 / 入口索引 / hotspots）。
- [x] Phase 1.5.D 本地生成物治理：新增 `pnpm clean:artifacts` ✅（见 `scripts/clean-artifacts.mjs`）。
  - 注：如果 clean 输出 `EACCES/EPERM`，说明历史生成物是 root-owned（曾用 sudo build）；需要一次性 `sudo chown -R $(whoami) <path>` 修复。
- [x] Phase 1.5.E Phase 2 输入准备：新增“删除清单 v2”✅
  - `docs/PlanDocs/0109_RootManagerControlPlane/phase2_targets.md`
  - 并在 `docs/PlanDocs/0109_RootManagerControlPlane/plan.md` 链接该清单。

- [x] Phase 2 Batch #1（Display routing 去旁路 / section 1；commit: `dbfb1e1`）：
  - [x] 收敛：Manager 内 Display 发送统一经 `apps/manager/src/lib/display/display-transport.ts`（移除 NodeCanvas/patch-runtime 的 local bridge 旁路）。
    - `apps/manager/src/lib/stores/manager.ts`：导出 `displayTransport` 供复用。
    - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：不再直调 `sendLocalDisplayPlugin`。
    - `apps/manager/src/lib/components/nodes/node-canvas/runtime/patch-runtime.ts`：Display 目标发送改为 `displayTransport.sendPlugin(..., { localOnly: true })`。
    - `apps/manager/src/lib/nodes/specs/register.ts`：改为复用 store 的 `displayTransport`（不再自行组装 local sender）。
    - `apps/manager/src/lib/display/display-transport.ts`：新增 `localOnly` 选项，用于需要“仅 paired Display”的 callsite。
  - [x] Acceptance hook：`rg "sendLocalDisplay|targetGroup\\('display'\\)" apps/manager/src` 仅命中 `display-transport.ts` 与 store wiring。
  - [x] Phase 2 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (493 files scanned)`）
    - `pnpm lint` ✅（0 errors；63 warnings 为历史债）
    - `pnpm build:all` ✅（通过；仍有 vite/svelte warnings，留作 Phase 3 证据锚点）
  - [x] 回归（Playbook+自动化）：
    - `pnpm --filter @shugu/node-core run test` ✅（24/24）
    - `pnpm e2e:node-executor:offline` ✅
    - `pnpm e2e:node-executor` ✅（补齐 e2e 环境/脚本与 server allowlist，使 loop deploy 状态可回传）
      - 修复：`apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-controller.ts` 绑定 nodeEngine 方法，避免 `this` 丢失导致 deploy 报错。
      - 修复：`apps/server/src/message-router/message-router.service.ts` 允许转发 `custom.kind=node-executor`，否则 Manager 收不到 deployed/rejected 事件（Loop deploy 会 timeout）。
      - 改进：`scripts/e2e/node-executor.mjs` 在未安装 Playwright Chromium 时 fallback 到系统 Chrome，并补齐 Start/Select All 等前置步骤。
      - 关联计划：PlanB（Client Recursive NodeGroup / NodeExecutor），详见 `docs/PlanDocs/1217_ClientRecursiveNodeGroup/Plan_porgress.md`。
  - [x] 手动回归（Display local bridge）：按 `phase1_regression_playbook.md` 复查 DisplayPanel pairing + Send To Display ✅
    - 过程：Manager 登录/Connect → 打开 Display → 点击 Reconnect 确保 local pairing → 状态 `status=connected` + `ready=yes`。
    - 结果：开启 `Send To Display` 后执行 `Screen Color / Play All`，Display 出现 `.screen-overlay`（opacity=1）。
    - 备注：Assets / Media / 稳定性未在本批复跑（沿用 Phase 1 结论）。

- [x] Phase 2 Batch #2（Audio execution：移除 legacy players / `phase2_targets.md` section 3）：
  - [x] 目标：在 `packages/sdk-client/src/action-executors.ts` 删除 deprecated/legacy player（优先 `ModulatedSoundPlayer`），并确保 Tone 路径覆盖 Phase 1 所需动作。
    - 删除 `ModulatedSoundPlayer`（仅保留 `ToneModulatedSoundPlayer`）。
  - [x] 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (508 files scanned)`）
    - `pnpm lint` ✅（0 errors；63 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass deprecation warnings 仍在）
  - [x] 回归：按 `phase1_regression_playbook.md`（尤其关注移动端音频策略 / user gesture / AudioContext）。
    - 用户手动真机验证：Tone enable/ready 正常；Synth Play/Update/Stop ✅；`Stream On` 下参数更新稳定、不丢声。

- [x] Phase 2 Batch #3（Visual scenes：收敛 legacy single-scene vs multi-scene / `phase2_targets.md` section 4；commit: `42315ec`）：
  - [x] 决策：采用 multi-scene（`visualScenes` 为唯一语义），移除单场景分支。
  - [x] 清理与收敛：
    - Protocol：移除 `visualSceneSwitch`/`visualSceneBox`/`visualSceneMel`/`visualSceneFrontCamera`/`visualSceneBackCamera`。
    - Manager：SceneControl 改为多场景 toggle → 发送 `visualScenes`；bootstrap 改为 `scenes[]`。
    - Client：以 `visualScenes` 为唯一输入，移除 `currentScene`/legacy handlers；启动配置改为应用 `scenes[]`。
    - Visual plugins：SceneManager 移除 `switchTo/getCurrentScene`（只保留 multi-scene）。
    - Node/Core：删除 legacy scene processor nodes + Manager specs（proc-visual-scene-*）。
  - [x] 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (554 files scanned)`）
    - `pnpm lint` ✅（0 errors；63 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass deprecation warnings 仍在）
  - [x] 回归：Phase 1 checklist 中 `visualScenes` / mel-scene / VisualCanvas 相关项全绿（用户手动验证）。
    - 结果（2026-01-10）：Scene Layer（Box/Mel toggle）✅；mel-scene ✅；VisualCanvas ✅。
    - 媒体动作：`showImage` / `hideImage` / `screenColor` ✅。
    - 稳定性：Start/Stop/Deploy/Scene switch loop ✅。

- [x] Phase 2 Batch #4（Media：VideoPlayer 去重复 / `phase2_targets.md` section 2；commit: `98d076a`）：
  - [x] 决策：选 A（抽到 `packages/ui-kit`）。
  - [x] 清理与收敛：
    - `packages/ui-kit` 新增共享 `VideoPlayer` 组件（Client/Display 共用）。
    - 删除 `apps/client`/`apps/display` 内重复的 `VideoPlayer.svelte`。
    - 入口改为从 `@shugu/ui-kit` 引用；`ui-kit` 增加 `@shugu/multimedia-core` 依赖与 `svelte-shims.d.ts`。
  - [x] 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (555 files scanned)`）
    - `pnpm lint` ✅（0 errors；57 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass deprecation warnings 仍在）
  - [x] Acceptance hook：
    - `rg -n "\\$lib/components/VideoPlayer\\.svelte|\\$components/VideoPlayer\\.svelte" apps` 无命中。
    - `rg -n "import \\{ VideoPlayer \\} from '@shugu/ui-kit'" apps` 仅命中 Client/Display 调用点。
  - [x] 回归：Phase 1 checklist 中媒体动作（playMedia/showImage/hideImage 等）全绿（用户手动验证）。
    - 结果（2026-01-10）：`playMedia` / `showImage` / `hideImage` / `screenColor` ✅。
    - 备注：用户反馈 Screen Color 语义更贴近 Scene Layer Player，建议后续重分类。

- [x] Phase 2 Batch #5（Transitional glue：一次性迁移脚本/历史兼容胶水 / `phase2_targets.md` section 5；commits: `347c48a`, `31358d7`）：
  - [ ] 目标：对“无 owner 的过渡脚本/迁移逻辑”做删/收口（删除或改成显式手动导入动作）。
  - [x] 5A DataURL migration：移除 `migrate-dataurls` 与 Assets Manager 入口。
  - [x] 5A 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (543 files scanned)`）
    - `pnpm lint` ✅（0 errors；57 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass warnings 仍在）
  - [x] 5A 回归：Phase 1 checklist 全绿（用户手动验证）。
    - 结果（2026-01-10）：Assets Manager 正常加载；Refresh/Upload ✅（DataURL 迁移入口已移除）。
  - [x] 5B MIDI legacy migrations：移除 legacy MIDI 绑定迁移路径。
    - 删除 `midi-param-bridge`（旧 localStorage 绑定系统）。
    - 删除 `migrateLegacyMidiParamBindings` 与 Registry MIDI Panel 启动迁移。
  - [x] 5B 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (542 files scanned)`）
    - `pnpm lint` ✅（0 errors；57 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass warnings 仍在）
  - [x] 5B 回归：Phase 1 checklist 全绿（用户手动验证）。
    - 结果（2026-01-10）：Registry MIDI 模板导入/导出 ✅；Node Graph 基本操作/Deploy ✅；控制链路 ✅。

### 2026-01-15

- [x] Node Graph 架构收敛（worktree：node-graph-architecture）：
  - [x] 结构拆分：renderer registry、lifecycle cleanup、custom-node handlers、group domain handlers、runtime init（保持行为不变，仅拆分/集中 wiring）。
  - [x] Server 修复以便回归：补 `@types/express`；`LocalMediaFile` 增补 `etag`；validate 返回补 `label`；assets auth HeaderRequest 类型修正。
  - [x] 手动回归（用户验证）：
    - add/connect/disconnect ✅
    - group collapse/expand ✅
    - nodalize/denodalize ✅
    - loop deploy ✅
    - display routing ✅
  - [x] 5C Console 功能拔除：移除 Console 卡片与相关状态（仅保留 Node Graph）。
    - 删除 `apps/manager/src/lib/features/**` 下 Console 卡片（Synth/Media/Flashlight/ScreenColor/Vibration/Scene）。
    - 删除 `apps/manager/src/lib/stores/controlState.ts`、`apps/manager/src/lib/streaming/streaming.ts`。
    - 移除 `Global Sync`/`Stream On`/`Require Tone Ready` 的死 UI（原仅用于 Console 控件的 executeAt/节流路径）。
  - [x] 5C Bootstrap 拔除：删除 Server `bootstrap` module 与 Client 侧 bootstrap 拉取/应用。
    - Server：移除 `/bootstrap/*`（controller/service/module）并从 `apps/server/src/app.module.ts` 删除引用。
    - Client：启动只从 `/geo/fence` 获取围栏（不再拉取 `/bootstrap/config`）。
  - [x] 5C 固定动作（batch after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (542 files scanned)`）
    - `pnpm lint` ✅（0 errors；57 warnings 为历史债）
    - `pnpm build:all` ✅（通过；vite/sass warnings 仍在）
  - [x] 5C 回归：Phase 1 checklist 全绿（重点：Assets/Display/NodeGraph/媒体动作；Console 已移除则不再作为回归入口）。
    - 结果（2026-01-10）：Assets/Display/NodeGraph/媒体动作 ✅；Console 已移除。

- [x] Phase 2.2 对齐清单：新增 `phase2_2_alignment.md`（同层级能力统一入口与目录归属）。
- [x] Phase 2.2-2 Scene 映射统一（registry 替代硬编码）：
  - [x] 新增 `packages/visual-plugins/src/scene-registry.ts` 统一 scene type ↔ plugin id 映射（front/back camera 先标记为 null）。
  - [x] Client `VisualCanvas` 改为 `sceneIdsFromLayer(...)`；去掉 box/mel 的硬编码映射。
  - [x] Acceptance hook：`rg "box-scene|mel-scene" apps/client` 无命中（字符串只在 registry 侧出现）。
- [x] Phase 2.2-3 Camera Scene 决策（选 B：记录为例外）：
  - [x] `docs/ARCHITECTURE.md` 增加说明：Camera 仍为 DOM overlay（尚未插件化）。
  - [x] `phase2_2_alignment.md` 更新状态为“完成（选 B）”。
- [x] Phase 2.2-4 ASCII 命名冲突清理：
  - [x] `packages/visual-plugins/src/ascii-scene.ts` → `packages/visual-plugins/src/mel-ascii-scene.ts`，id 改为 `mel-ascii-scene`。
  - [x] `packages/protocol/src/types.ts`：`VisualPluginId` 更新为 `mel-ascii-scene`。
  - [x] `packages/visual-plugins/src/index.ts` 更新导出入口。
- [x] Phase 2.2-5 ScreenColor 语义归属（选 B：保持 Control Overlay）：
  - [x] `docs/ARCHITECTURE.md` 补充说明：`screenColor` 仍为 control-action overlay（非 Scene/Effect）。
  - [x] `phase2_2_alignment.md` 更新状态为“完成（选 B）”。
- [x] Phase 2.2-1 Visual Effect 旧命令清理（只保留 `visualEffects`）：
  - [x] Protocol：移除 `asciiMode/asciiResolution/convolution` 控制动作与 payload，新增 `ConvolutionPreset` 供 effect 链使用。
  - [x] Client：删除 legacy stores（ascii/convolution）与 `syncLegacyVisualEffects` 胶水；`visualEffects` 成为唯一入口。
  - [x] Manager/SDK：删除 `asciiMode/asciiResolution` 调用入口。
  - [x] Node-core：删除 `proc-visual-effect-*` legacy 节点并停止注册；runtime 连续动作列表去除旧 action。
- [x] Phase 2.2-6 Base Frame 职责边界抽离：
  - [x] 新增 `apps/client/src/lib/features/visual-layer/base-frame.ts`（base layer 合成逻辑）。
  - [x] `VisualCanvas` 仅负责编排，base-frame 由模块实现。

- [ ] Phase 2.2 固定动作（after-delete gates）：
  - `pnpm guard:deps` ✅（`[deps-guard] ok (519 files scanned)`）
  - `pnpm lint` ✅（0 errors；warnings 为历史债）
  - `pnpm build:all` ⛔（TS5033：`packages/visual-effects/dist-visual-effects-out` 为 root-owned，tsc 无法写入；先 `sudo chown -R $(whoami):staff packages/visual-effects/dist-visual-effects-out` 后重跑）
    - 临时 typecheck：`pnpm --filter @shugu/visual-effects exec tsc -p tsconfig.json --noEmit` ✅（仅 emit 被 outDir 权限阻塞）
  - Acceptance hooks：
    - `rg "asciiMode|asciiResolution" apps/client apps/manager packages/node-core packages/sdk-manager` ✅（无命中）
    - `rg "action: 'convolution'|action: \\\"convolution\\\"\" apps/client apps/manager packages/node-core` ✅（无命中）

### 2026-01-11

- [x] Phase 2.3：Server 语义收敛（Protocol / 最小认证 / Presence）
  - [x] 2.3-1 协议形态收敛：Server 端控制消息改为 `createServerControlMessage` + `MessageRouter` 统一下发；新增 `apps/server/src/protocol/server-messages.ts`；移除 `events.gateway.ts` 中 ad-hoc `emit('msg', { type: 'control' ... })`。
    - [x] 类型对齐：新增 `MessageWithoutServerTimestamp`，让 server-side message routing 在 type-level 上与“server 负责打 timestamp”的语义一致（避免 build 被 TS 卡住）。
  - [x] 2.3-1 护栏：新增 `scripts/guard-server-messages.mjs`，并纳入 `pnpm guard:deps`（禁止 server 直接 emit control 字面量）。
  - [x] 2.3-2 最小认证：`SHUGU_MANAGER_KEY` 校验 `handshake.auth.managerKey`；Manager SDK/Manager UI 增加 `managerKey` 传入与保存。
  - [x] 2.3-3 Presence/grace：Registry 引入 `connected/lastSeenAt/disconnectedAt` + 5s grace；断线先标记再延迟移除；`clientList` 携带 connected 状态；manager UI / client picker 显示离线灰态；路由仅向 connected socket 下发。
  - [x] 2.3 固定动作（after-delete gates）：
    - `pnpm guard:deps` ✅（`[deps-guard] ok (523 files scanned)`；`[server-msg-guard] ok (31 files scanned)`）
    - `pnpm lint` ✅（0 errors；warnings 为历史债）
    - `pnpm --filter @shugu/server run build` ✅
    - `pnpm --filter @shugu/protocol run build` ✅
    - `pnpm --filter @shugu/sdk-manager run build` ✅
  - [ ] 2.3 回归：按 `phase1_regression_playbook.md` 全绿（重点：sensor gating、managerKey、有/无 key 下的行为、5s grace 重连/过期）。

- [x] Phase 2.5：Group UX 收尾（Gate 内建 + Proxy 边界端口 + Minimize）
  - [x] Gate：移除 `group-activate` 节点 UI；Gate 输入端口下沉到 Group header 左侧（boolean-only，未连线默认 true；禁止来自 subtree）。
    - [x] 旧图迁移：`group-activate` → `group-gate`（多 Activate 合并 AND；非 boolean 来源插入 `logic-number-to-boolean`）。
  - [x] Proxy：跨边界连线自动规范化为“边界代理端口链”，不再穿墙（含多层嵌套：每层边界都有代理点）。
    - [x] 手动 pin：拖线到 Frame 左/右边缘，边缘高亮，松开创建代理点且线保持连着。
    - [x] 输出代理点限制：规范化时把一个 `group-proxy(output)` 上的多条外连线拆成多个点（1 点 1 条外连线）。
    - [x] 清理策略：auto proxy 在外连线断开后自动移除；pinned proxy 保留。
  - [x] Minimize：frame ⇄ node；最小化隐藏 subtree 内部节点/连线，仅保留边界代理端口与对外连线；展开后可继续编辑。
    - [x] 新增 `group.minimized` 并纳入导入/导出。
  - [x] Copy/Paste：Group 作为“特殊节点”可复制（等价于复制整个 frame/subtree），仅保留代理点，跨边界外连线不复制。
  - [x] 新节点：`logic-number-to-boolean`（`number >= trigger` → `true`）。
- [x] 验证：
    - `pnpm --filter @shugu/node-core test` ✅（先 `pnpm --filter @shugu/node-core clean` 清理 root-owned dist，避免 TS5033）
    - `pnpm lint` ✅（0 errors；warnings 为历史债）

### 2026-01-13

- [x] Phase 2.5 计划 rescope：将 Phase 2.5 更新为 “Nodalization（自定义节点 / 母子节点 / Uncoupled / 循环嵌套防止）+ Group 持久化”（旧版 Phase 2.5：Group UX 收尾 作为历史记录保留，见 2026-01-11 小节）。
- [x] Phase 2.5 启动：开始按新 Phase 2.5 计划落地（以消除“Group 最小化伪 Node”的双轨制问题为目标）。
  - Baseline（环境/代码）：
    - 时间：2026-01-13 05:28 CST
    - 分支：`DecentralizationV1`
    - 基线 commit：`35a691e`（Revamp Assets Manager UI）
    - `git status --porcelain`：仅 `docs/PlanDocs/0109_RootManagerControlPlane/plan.md` 有改动（Phase 2.5 计划文本更新）
- [x] Phase 2.5-0 先修复“Group 刷新后消失”根因：把 Group 元数据纳入 project autosave/restore。
  - 新增 `apps/manager/src/lib/project/nodeGraphUiState.ts`：作为 ProjectManager 与 NodeCanvas 之间的共享 store（groups 先行）。
  - `apps/manager/src/lib/project/projectManager.ts`：snapshot 升级为 version=2，并在 `buildSnapshot()` 保存 groups；`loadLocalProject()` 在 `nodeEngine.loadGraph()` 后立刻恢复 groups（避免 group-proxy 被当作 orphan 清掉）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：双向同步 `groupController.nodeGroups` ⇄ `nodeGroupsState`（带去抖 key，防止回环写入）。
  - 格式化修复：清掉 `NodeCanvas.svelte` / `group-controller.ts` / `GroupFramesOverlay.svelte` 中的 tab（否则 eslint `no-mixed-spaces-and-tabs` 会直接报错）。
  - 验证：`pnpm --filter @shugu/manager run lint` ✅（0 errors；warnings 为历史债；TS 版本 warning 亦为历史环境问题）。
- [x] Phase 2.5-1 Custom Node 数据模型 + 持久化骨架：
  - 新增自定义节点数据模型（definition / ports / instance state）：
    - `apps/manager/src/lib/nodes/custom-nodes/types.ts`
    - `apps/manager/src/lib/nodes/custom-nodes/instance.ts`
  - 新增自定义节点库 store + 注册到 NodeRegistry：`apps/manager/src/lib/nodes/custom-nodes/store.ts`
  - `packages/node-core/src/registry.ts`：新增 `NodeRegistry.unregister()`（支持删除母节点后从 node-picker 移除）。
  - `apps/manager/src/lib/project/projectManager.ts`：snapshot 增加 `customNodes`，并在 `loadLocalProject()` 里先 restore+register 再 `nodeEngine.loadGraph()`（避免 custom node 被当作 unknown type 丢掉）。
  - `apps/manager/src/lib/nodes/engine.ts`：补齐 `updateNodeType(nodeId, nextType)`（Uncoupled 需要原地切换节点类型）。
  - 验证：`pnpm --filter @shugu/manager run lint` ✅（0 errors；warnings 为历史债）。

- [x] Phase 2.5-2 Nodalization（Group → Custom Node 母节点实例）：
  - UI：`apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte` 增加 `Nodalization` 动作入口。
  - Canvas：`apps/manager/src/lib/components/nodes/NodeCanvas.svelte` 新增 `handleNodalizeGroup(groupId)`：
    - 正确收集 Group subtree（含 child groups）并生成 definition（template + ports）。
    - 从主 Graph 移除 subtree 节点/连线/Group-port decoration 节点，并创建 `custom:<definitionId>` 的母节点实例。

- [x] Phase 2.5-3 Copy/Paste/Alt-Drag（Custom Node 实例规则）：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/clipboard-controller.ts`：粘贴 Custom Node 时强制生成新 `groupId`，并降级为子节点（role=child），递归深拷贝 nested custom nodes internal state。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：Alt/Option 拖拽复制同样重写 `groupId` + role。

- [x] Phase 2.5-4 Uncoupled（子节点分叉为新母节点）：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：子节点显示 `Uncoupled` 按钮（触发 `shugu:custom-node-uncouple`）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：实现 `handleUncoupleCustomNode(nodeId)`：fork 新 definition + `updateNodeType` 切换为新 type，并把该实例升级为母节点（role=mother）。
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/picker-controller.ts`：node-picker 侧支持 Custom Node 动态条目。

- [x] Phase 2.5-5 Expand/Collapse（母节点原地展开成 frame）：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：母节点显示 `Expand`（触发 `shugu:custom-node-expand`），并修复 svelte compiler `Cyclical dependency detected`（去除 `$:` width/height 的循环依赖，改为 `style:width/height`）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：接入 `shugu:custom-node-expand` 事件监听；实现 `handleExpandCustomNode(nodeId)` / `handleCollapseCustomNodeFrame(groupId)`。
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`：frame bounds 计算时把 `forcedHiddenNodeIds` 纳入 hiddenNodeIds（避免展开态隐藏母节点影响 Group frame 尺寸）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：刷新时若检测到 `cn:<motherId>:*` materialized 节点则自动 rehydrate 展开态（恢复隐藏母节点 + custom frame actions）。
  - 修复：`cn:*` materialized id 解析支持嵌套母节点（customNodeId 可能包含 `:` 时按最后一个 `:` 分割，避免 nested Expand 失效）。

- [x] Phase 2.5-6 Number to Boolean（node-picker 可搜索）：
  - Spec 已存在：`apps/manager/src/lib/nodes/specs/logic-number-to-boolean.json`（label/category/ports/runtime.kind）。
  - node-picker 搜索容错：`apps/manager/src/lib/components/nodes/node-canvas/controllers/picker-controller.ts` 增加常见拼写纠错（`bollean/boolen/bolean` → `boolean`），避免用户因拼写找不到该节点。

- [x] Phase 2.5-7 母节点结构同步到 coupled 子节点（结构同步/参数独立）：
  - 新增 `apps/manager/src/lib/nodes/custom-nodes/sync.ts`：提供 `syncCustomNodeInternalGraph()`（按 template 同步结构，保留实例参数）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：母节点 Collapse 后更新 definition.template/ports，并调用 `syncCoupledCustomNodesForDefinition(definitionId)`：
    - 更新所有 top-level coupled 子节点实例的 internal graph（保持 config/inputValues，不同步参数）。
    - 同步 nested custom nodes（遍历所有 Custom Node 实例 internal graphs，对内部 coupled 子节点做同样结构同步）。
    - 端口迁移：对已不存在的 portKey 连接直接断线（按 stable portKey 尽量保留能对上的）。

- [x] Phase 2.5-8 循环嵌套防止（禁止 A→A / A↔B 等循环）：
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：
    - 在 `addNode(custom:*)` 时，若落点在展开态母节点 frame 内，则用 `wouldCreateCycle()` 预检查并阻止创建。
    - 在母节点 Collapse 写回 definition 前，用 `definitionsInCycles()` 做兜底校验：检测到 cycle 直接中止 Collapse 并提示。

- [x] Phase 2.5-9 Custom Node 单文件导入/导出（`*.shugu-node.json`）：
  - `apps/manager/src/lib/nodes/custom-nodes/io.ts`：实现 file v1 schema + 递归依赖 closure + 导入时全量 remap（definitionId 重写、nested 引用重写、模板内 custom-node groupId 全量再生）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：Toolbar 新增 Import/Export Custom Node；导入后自动创建缺失的母节点实例（避免 “无母节点=不存在” 的悬空定义）。
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/NodeCanvasToolbar.svelte`：菜单增加 Custom Node 导入/导出入口。

- [x] Phase 2.5-11 deploy/patch：Custom Node 展开编译（flatten）为普通节点图：
  - `apps/manager/src/lib/nodes/custom-nodes/flatten.ts`：实现 Custom Node 递归展开（实例内部子图 materialize 为 `cn:<instanceId>:<templateId>`）+ 移除 `group-proxy`（bypass 成直连）。
  - `apps/manager/src/lib/nodes/engine.ts`：`exportGraphForPatchFromRootNodeIds()` 先对图做 `compileGraphForPatch()` 再走 `exportGraphForPatch`，确保 client patch 不含 Custom Node / group-proxy 类型。

- [x] Phase 2.5 固定动作（gates/build）：
  - `pnpm guard:deps` ✅（`[deps-guard] ok (516 files scanned)`；`[server-msg-guard] ok (31 files scanned)`）
  - `pnpm lint` ✅（0 errors；warnings 为历史债）
  - `pnpm --filter @shugu/node-core test` ✅（28 passed）
  - `pnpm --filter @shugu/manager run build` ✅（有 chunk size / svelte warnings，历史问题未处理）
  - `pnpm --filter @shugu/client run build` ✅（有 svelte warnings，历史问题未处理）
  - `pnpm build:all` ⛔（TS5033：`packages/visual-effects/dist-visual-effects-out` 为 root-owned，tsc 无法写入；可用 `pnpm --filter @shugu/visual-effects exec tsc -p tsconfig.json --noEmit` 先做 typecheck）

- [x] Phase 2.5 补丁：修复 Expand 母节点时报 `Cannot have duplicate keys in a keyed each`：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`：`setGroups/appendGroups` 统一去重并合并 `nodeIds`，避免重复 groupId 进入 index/overlay。
- [x] Phase 2.5 补丁：修复 Uncouple 后仍显示 `Uncoupled` 且不升级为母节点：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：`customNodeState` 依赖 `$graphStateStore`，确保 config 更新后 UI 角色切换为母节点（显示 Expand）。
- [x] Phase 2.5 补丁：修复 Uncouple 后 HMR 崩溃 / Graph 空白：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：显式声明 `customNodeState`，避免运行时 `ReferenceError`。
- [x] Phase 2.5 补丁：Custom 节点列表只显示存在母节点的定义：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/picker-controller.ts`：根据 graphState 过滤 Custom definitions（无母节点则不显示）。
- [x] Phase 2.5 补丁：Collapse 后 Custom Node ports/子节点不更新：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/rete-sync.ts`：Custom Node 若 ports 变化则重建 Rete 节点（同步折叠 socket / 子节点 ports）。
- [x] Phase 2.5 补丁：移除 Custom Node 顶部手动 Gate toggle（与 Gate 语义冲突）：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：删除 `custom-node-gate-toggle` UI 与样式。
- [x] Phase 2.5 补丁：断线后 client 接口仍存在：
  - `apps/manager/src/lib/components/nodes/node-canvas/runtime/client-selection-binding.ts`：仅使用 `connected !== false` 的 client；无在线 client 时清空 `client-object` 输出。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：manager state 里仅统计在线 clients。
- [x] Phase 2.5 补丁：Collapse 后仍残留 `active` collapsed-socket：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：移除已不存在 group 的 `group-gate` 节点。
- [x] Phase 2.5 补丁：断线后 group-proxy 仍残留：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：proxy 必须同时拥有内/外连接，外连断开即移除（即使 pinned）。
- [x] Phase 2.5 补丁：跨边界 proxy 链条断开后残留：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：移除 proxy 后追加一次 normalize，清理被链式断开的相邻 proxy。
- [x] Phase 2.5 补丁：proxy-proxy 误判为外连导致断线后 collapsed-socket 仍残留：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：忽略 proxy↔proxy 作为外连判定，仅当连接到非 proxy 节点时才算外连，并对 proxy 链做外连可达性 BFS，确保断线后清理残留。
- [x] Phase 2.5 补丁：断线后 collapsed-socket 仍残留（normalize 提前 return）：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：即使无 rewrite 也执行 proxy 清理；内/外连以 group 归属判定并加入 internal/external anchor BFS，避免代理链残留。
- [x] Phase 2.5 补丁：collapsed-socket 被非本连接干扰消失/无法创建：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：proxy 清理仅依赖自身外连（不再因内部断线移除），避免无关断线导致 proxy 消失；去除全局 anchor BFS。
- [x] Phase 2.5 补丁：collapsed-socket 仅在内部连接断开时移除：
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`：proxy 清理改为只依赖内部连接是否存在，外侧断线不再移除。
- [x] Phase 2.5 补丁：新增 Denodalization（撤销 Node 化）：
- [x] Phase 2.5 补丁：调整 Denodalization 入口与语义（仅在 Frame 态）：
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte`：Custom Frame 操作栏新增 `Denodalize`（与 `Collapse` 同列）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：`handleDenodalizeGroup()` 将 expanded Custom 恢复为普通 Group Frame（保留内部节点并重写 `cn:` ids），同时删除该 definition 的全部实例（母/子）并移除 definition。
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：移除母节点标题栏上的 `Denodalize`（入口改为 Frame 态）。
- [x] Phase 2.5 补丁：Nodalize 后输出失效：
  - `packages/node-core/src/runtime.ts`：新增 `step()` 以便嵌套 runtime 执行单步。
  - `apps/manager/src/lib/nodes/custom-nodes/store.ts`：Custom Node process 运行内部子图（NodeRuntime），将输出映射到母节点 ports，确保 collapsed 自定义节点在 Manager 侧正常输出。
- [x] Phase 2.5 补丁：Group Frame Header 遮挡 collapsed-socket：
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte`：header 改为 `pointer-events: none`，拖拽仅由标题按钮触发，避免覆盖 collapsed-socket。
- [x] Phase 2.5 补丁：Group Frame Header 内收纳 Gate collapsed-socket：
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：计算 `groupGateNodeIdByGroupId` 并传入 overlay。
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte`：在 header 内挂载 gate socket 容器（action reparent）。
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：为 `collapsed-sockets` 添加 `data-rete-node-id` 便于定位。
- [x] Phase 2.5 补丁：header socket 连接起点偏移：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：当 socket 脱离节点 DOM 时，按 viewport transform 反算 graph 坐标，修正连线起点。
- [x] Phase 2.5 补丁：collapsed-socket 对齐与连线起点偏移：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：collapsed-socket 不再应用 ±12px 偏移，连线从点中心起。
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：group-port sockets 清零 margin 并对称 padding，输入/输出对齐。
- [x] Phase 2.5 补丁：group-port 连线起点偏移与边距：
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：input/output socket 负 margin 缩小为 4px，减少偏移。
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：collapsed socket 偏移调整为 4px，匹配视觉位置。
- [x] Phase 2.5 补丁：group-port 连线起点/对齐改为本地坐标计算：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：统一改为 node-local 位置计算，group-port 取消默认 ±12px 偏移。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：group-port sockets 清零 margin，避免左右不一致。
- [x] Phase 2.5 补丁：group-proxy collapsed sockets 对齐：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：group-port 使用 flex 对齐 collapsed sockets，移除绝对定位/translate，左右等距。
- [x] Phase 2.5 补丁：group-proxy dot 间距与尺寸固定：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：collapsed socket 固定 18px 容器、2px padding + 6px gap，避免挤压导致不对齐。
- [x] Phase 2.5 补丁：socket 连接点改用真实 dot 位置：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：以 `.socket` 子元素的 bounding rect 计算位置，避免 wrapper 尺寸导致连线偏移。
- [x] Phase 2.5 补丁：group-proxy sockets 回到边缘对齐：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：group-port collapsed socket 使用绝对定位并向外偏移，保持端点贴边。
- [x] Phase 2.5 补丁：group-proxy 对齐改回默认 socket 布局：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`：移除 group-port 的 socket margin/尺寸覆写，回到默认边缘布局。
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/NodeCanvasLayout.svelte`：移除 group-port sockets 强制 margin 0。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：移除 group-port sockets margin 0 覆盖。
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：仅对 header gate socket 取消偏移，其余沿用默认。
- [x] Phase 2.5 补丁：group-port 连接点偏移：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：group-port sockets 取消 ±12px 偏移，连线落在圆点中心。
- [x] Phase 2.5 补丁：恢复全局连线准确性（仅 header socket 特判）：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/live-socket-position.ts`：非 header socket 走默认计算，避免影响全局连线。
- [x] Phase 2.5 补丁：Group Frame Actions 仅在空间不足时切换为 icon：
  - `apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte`：根据 overflow 自适应切换文字/图标，避免恒定 icon。
- [x] Phase 2.5 补丁：Custom Node Gate toggle 无效：
  - `apps/manager/src/lib/components/nodes/node-canvas/rete/rete-builder.ts`：自定义节点 `gate` 变化同步到 `manualGate`。
  - `apps/manager/src/lib/nodes/custom-nodes/store.ts`：Custom Node process 以 `inputs.gate` 作为唯一 gate（连线覆盖手动）。
  - `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`：Nodalize/Collapse/Group toggle 时同步 `gate` 输入值，确保手动 gate 一致。

- [x] Phase 2.X 节点图渐进式解耦回归（手动）：完成（2026-01-15）
  - `pnpm lint` ✅
  - `pnpm --filter @shugu/node-core test` ✅
  - `pnpm test:node-canvas` ✅
  - Phase 1 手动回归：已执行（按 `phase1_regression_playbook.md`）
