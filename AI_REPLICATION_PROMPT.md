# ShuGu 全量复刻与重构提示词（V2，工程落地版）

你是一个“系统架构 + 全栈工程 + 实时系统 + 交互视觉 + 测试运维”联合 AI 团队。你的任务不是做演示，而是**完整复刻并重做**一个多端实时互动演出系统。

这次任务有两个同等重要目标：

1. 复刻原项目的核心能力、交互链路、视觉风格与运行行为。
2. 在开局阶段规避旧项目的根深蒂固问题，尤其是“巨石文件/职责混乱/难维护”。

你必须交付一个可以长期维护的生产级工程，而不是临时可跑版本。

---

## 0. 你必须遵守的总原则

1. 功能等价：关键能力必须全覆盖，不能阉割。
2. 行为等价：关键执行链路与时序行为保持一致。
3. 体验等价：控制台、移动端、大屏端的交互感受一致。
4. 美学等价：视觉语言必须复刻到位，不能退化成通用后台风格。
5. 架构升级：在不损失能力的前提下，明确分层、拆解巨石、提高可维护性。
6. 先设计后编码：先输出架构蓝图和分阶段实施方案，再进入开发。
7. 禁止偷工减料：不得用静态占位替代真实执行链路。

---

## 1. 项目定位与系统边界

你要构建的是一个“多端实时互动演出系统”，包含四个主应用与一组共享基础包：

1. Manager（控制端，Web 控制台）
2. Client（参与端，移动/浏览器端）
3. Display（大屏端，沉浸式播放端）
4. Server（实时服务端）
5. Shared Packages（协议、SDK、节点运行时、插件体系、媒体核心、UI 基座、AI 扩展）

系统本质是：

- Manager 统一编排和调度
- Server 负责实时路由与控制平面
- Client/Display 负责本地执行和状态回传
- Node Graph 负责复杂逻辑编排、部署与执行
- 视觉和音频能力由插件体系驱动

---

## 2. 强制技术选型（必须明确采用）

你必须按以下技术类别与主要库实现，不要改成其它技术栈。

### 2.1 Monorepo 与语言

- `pnpm workspace` 管理 monorepo
- `TypeScript` 作为全仓主语言
- 前端统一使用 `SvelteKit + Svelte + Vite`
- 后端使用 `NestJS + Socket.IO`

### 2.2 前端与交互

- Manager / Client / Display：`SvelteKit 2.x`
- UI 开发：Svelte 组件化 + 共享 `ui-kit`
- Node 可视化编辑器：`Rete 2.x` + area/connection/history/svelte 插件

### 2.3 实时通信

- 双向实时通信：`Socket.IO 4.x`
- 连接角色：manager/client
- 消息模型：control / data / media / plugin / system / control-plane / time-sync

### 2.4 分布式与扩展

- 多实例广播扩展：`@socket.io/redis-adapter`
- Redis 客户端：`redis`
- 反向代理：`Nginx`
- 进程守护：`PM2`
- HTTPS 证书：`Certbot`

### 2.5 视觉与音频

- 3D/视觉场景：`three`
- 音频运行时：`Tone.js`
- 音频分析：基于 Web Audio + 自定义音频插件
- 后处理效果：ASCII / 卷积等效果管线

### 2.6 测试与质量

- 端到端测试：`Playwright`
- Node/运行时测试：Node 原生 test 或等价单测框架
- 代码规范：`ESLint + Prettier`
- 压测：Socket 客户端仿真脚本（连接数、广播延迟、图像上传压力）

---

## 3. 目标目录结构（必须按职责分层，不要巨石）

你需要构建以下结构（可微调，但职责必须一致）：

```text
apps/
  manager/
  client/
  display/
  server/

packages/
  protocol/
  sdk-manager/
  sdk-client/
  node-core/
  plugin-core/
  audio-plugins/
  visual-plugins/
  visual-effects/
  multimedia-core/
  ui-kit/
  ai-core/

tests/
  load/

docs/
  architecture/
  operations/
  testing/
```

关键要求：

- `protocol` 是跨端协议单一事实源。
- `node-core` 是节点图运行时单一事实源。
- App 不允许私自复制协议与运行时逻辑。
- 插件能力必须收敛到 packages，不散落在 apps 内。

---

## 4. 四端功能复刻清单（必须完整实现）

### 4.1 Manager（控制端）

必须具备：

1. 登录/连接态管理与错误提示。
2. 客户端列表与选择机制（单选、多选、全选、按组）。
3. 多类型控制动作发送与执行反馈。
4. Display 管理能力（本地桥接优先，服务端回落）。
5. 控制平面操作（安全模式、所有权、转移/回收/释放）。
6. 资产管理中心：上传、检索、筛选、排序、预览、标签、备注、删除、引用复制。
7. 本地媒体管理与引用能力。
8. Node Canvas 图形编排系统：
   - 节点增删改连
   - 框选、复制、分组、折叠、聚焦、最小地图
   - 循环识别与部署/停止
   - 执行日志与状态面板
   - 模板导入导出、自定义节点导入导出
   - 模型分发面板
9. 性能/调试控制台。

### 4.2 Client（参与端）

必须具备：

1. 启动页与进入流程（用户手势进入运行态）。
2. 权限系统：运动传感器、麦克风、相机、音频上下文、唤醒锁。
3. 实时连接与断线重连策略。
4. 可见性变化策略（后台视为离线，回前台自动重连）。
5. 控制执行器：屏幕颜色、闪光、震动、声音、媒体、图像、视觉场景、视觉效果。
6. 视觉渲染层叠：场景层 + 媒体层 + 图像层 + 相机层 + 后处理层。
7. 音频特征分析并驱动视觉参数。
8. 截图上传回传链路。
9. 控制平面转移提示与安全模式状态。
10. 地理围栏能力入口（可配置启用/绕过）。

### 4.3 Display（大屏端）

必须具备：

1. 双通道接入：本地桥接优先 + 服务器兜底。
2. 全屏沉浸式视频/图像播放。
3. 覆层颜色控制与状态联动。
4. 节点执行接入与媒体事件回传。
5. 本地媒体引用映射能力（本地桥接场景）。
6. 音频启用与 ready 回传。

### 4.4 Server（服务端）

必须具备：

1. WebSocket 网关与连接鉴权。
2. 客户端注册表与目标路由。
3. 消息路由器（按消息类型和 target 分发）。
4. 控制平面服务（安全模式 + 所有权栈 + 转移状态机）。
5. 高频消息治理（volatile、节流、过滤、广播保护）。
6. 资产服务（上传、去重、索引、鉴权读取、范围请求）。
7. 本地媒体服务（白名单路径访问）。
8. 地理服务（围栏配置 + 地址解析）。

---

## 5. 分布式架构设计（必须给出可落地方案）

### 5.1 运行拓扑

提供两个可切换部署形态：

1. 单实例模式（开发/小规模）
2. 多实例模式（生产扩展）

多实例模式要求：

- Socket.IO 使用 Redis adapter 做跨实例广播。
- 连接通过反向代理进入，WebSocket 路由稳定。
- 控制平面状态要可持久化。
- 高频广播支持降载策略。

### 5.2 逻辑服务边界（即使单进程也要模块化）

将 Server 内部拆成明确模块：

1. Realtime Gateway 模块
2. Message Router 模块
3. Presence/Registry 模块
4. Control Plane 模块
5. Assets 模块
6. Local Media 模块
7. Geo 模块
8. Telemetry/Observability 模块

要求：

- 每个模块有独立职责和最小公开接口。
- 不允许 Gateway 直接塞满业务逻辑。
- 路由、治理、存储、控制策略分离。

### 5.3 路由与高频治理

必须实现：

1. 目标选择语义：全量、指定客户端、按组。
2. 高频动作可选择 volatile 发送。
3. 大规模连接下频率上限与背压保护。
4. 高频 sensor 数据过滤，仅保留关键系统类型。
5. 关键动作（媒体切换等）始终可靠发送。

### 5.4 控制平面状态机

必须实现控制权治理：

1. safe mode 默认收敛能力。
2. ownership stack 支持 push/pop 语义。
3. transfer offer / accept / deny / reclaim / release。
4. actor 断线后的 ownership 修复策略。
5. 全端状态同步广播。

---

## 6. 插件体系设计（必须详细实现）

你必须构建统一插件架构，并且明确生命周期。

### 6.1 plugin-core（通用契约）

必须提供：

1. 插件元信息定义。
2. 插件工厂定义。
3. 插件实例生命周期（create / onCommand / dispose）。
4. 插件命令消息封装工具。

### 6.2 音频插件（必须包含 Tone.js 使用）

音频系统要求：

1. Tone.js 作为音频运行时核心。
2. 统一 AudioPlugin 接口（init/start/stop/onFeature/configure/destroy）。
3. 至少实现两个插件：
   - Mel Spectrogram
   - Audio Split（低中高频 + 节拍/能量）
4. 输出特征可驱动视觉与上报传感。
5. 帧率与 CPU 开销可调，避免移动端过热。

### 6.3 视觉插件（Three.js）

视觉系统要求：

1. 定义 VisualScene 接口（mount/unmount/update/resize）。
2. 定义 SceneManager（注册、启停、并行激活、更新、销毁）。
3. 至少复刻场景：
   - Box 场景
   - Mel 频谱场景
   - 可选：Mel ASCII 场景
4. 支持多场景同时激活与图层排序。

### 6.4 视觉后处理插件

后处理要求：

1. 提供通用 effect pipeline。
2. 至少复刻效果：
   - ASCII
   - Convolution
3. 按效果复杂度动态调节目标帧率。
4. 提供跨域/画布污染失败时的 pass-through 回退。

### 6.5 节点执行插件（node-executor）

必须实现：

1. Manager 端编辑图并导出可部署内容。
2. Client/Display 端执行器接收部署、启动、停止、移除。
3. 支持图变更增量应用（graph-changes）。
4. 支持 runtime override（输入/配置临时覆盖 + TTL）。
5. watchdog 机制（慢 tick、震荡、过载防护）。
6. 状态回传（deployed/started/stopped/error/rejected）。

---

## 7. Node Graph 体系（必须完整复刻）

### 7.1 编辑端（Manager）

1. Rete 画布与交互控制器拆分。
2. 节点 registry 与参数 registry 分离。
3. group、loop、custom node、模板、导入导出能力完整。
4. 本地 loop 检测与部署控制。

### 7.2 执行端（Client/Display）

1. `node-core` 提供图运行时与定义注册。
2. 端侧执行器具备能力门禁（权限/能力不足时拒绝并上报）。
3. 支持远端控制命令转发与本地执行混合。
4. 支持与多媒体核心联动（媒体事件状态回写）。

### 7.3 时间同步与调度

1. Manager 与 Client/Display 维持 time offset。
2. executeAt 类动作采用服务器时间基准调度。
3. 音频调度尽量使用音频上下文时间而非粗粒度定时器。

---

## 8. 资产与媒体体系（必须闭环）

### 8.1 资产服务

必须具备：

1. 上传鉴权（写 token）和读取鉴权（读 token）。
2. 文件去重（内容哈希）。
3. 元数据索引（类型、标签、备注、大小、时间等）。
4. 内容读取支持范围请求（大媒体友好）。
5. 资产 URL 与引用统一解析。

### 8.2 Client/Display 媒体执行

1. 统一 MultimediaCore 管理预加载、缓存、状态。
2. 视频支持起止片段、循环、反向、适配模式。
3. 图像支持展示/隐藏/适配与 data-url 场景。
4. media/image 状态双向可观测。

### 8.3 本地媒体桥接（Display）

1. Manager 可向 Display 注册本地文件引用。
2. Display 可把 `displayfile:` 引用解析为可播资源。
3. 需要配对态与 fallback 态都可运行。

---

## 9. 视觉与美学复刻规范（必须严格）

你要复刻的是一整套视觉语言，不是换一层主题色。

### 9.1 全局气质

关键词：

- 舞台控制系统
- 深色基底
- 霓虹荧光
- 玻璃拟态
- 数字感/信号感

禁止：

- 通用 SaaS 后台观感
- 平白背景 + 默认按钮样式
- 只有颜色变化没有层次和光感

### 9.2 颜色与层次

必须具备：

1. 深色背景层（近黑）
2. 主色梯度（蓝紫 / 洋红 / 青）
3. 发光边缘与阴影
4. 状态色（成功/警告/危险）高可读
5. 背景纹理（网格、点阵、光晕）

建议参考方向：

- 全局主题变量集中在 `ui-kit`，由三端共享
- NodeCanvas 使用多层渐变 + 网格 + 状态高亮

### 9.3 组件风格

1. 顶栏/面板/浮层有玻璃化与模糊。
2. 胶囊工具条、状态 badge、浮动控制条具备舞台控制感。
3. 卡片与边框有轻微发光，避免平面化。
4. 动效短促、服务状态表达，不做花哨噪音。

### 9.4 三端视觉差异

1. Manager：复杂控制台感，信息密度高但层次清晰。
2. Client：启动页有强记忆点（ASCII/终端风），运行态沉浸式全屏。
3. Display：极简全屏黑底输出，媒体切换平稳。

### 9.5 字体与排版

1. 系统正文使用统一无衬线主字体。
2. 数值/状态/调试信息使用等宽字体。
3. 启动页可使用更强风格的等宽字体。
4. 大小层级、字重、间距必须形成控制台信息节奏。

---

## 10. 防巨石设计（这是本次重做的硬约束）

你必须把“避免巨石文件”作为一等目标。

### 10.1 文件与模块硬规则

1. UI 组件文件建议不超过 300 行。
2. 业务 TS 模块建议不超过 280 行。
3. 极限上限 450 行，超过必须拆分。
4. 单文件只允许一个主职责。
5. 不允许“全能 store”承载 transport + control + media + UI。

### 10.2 目录拆分规则（必须执行）

#### Manager

将 NodeCanvas 拆成：

- `ui/`：布局、面板、覆盖层、工具栏
- `controllers/`：组控制、循环控制、选择控制、最小图等
- `rete/`：Rete 适配、渲染、pipe、同步
- `runtime/`：与 node-engine/manager store 的桥接
- `custom-nodes/`：自定义节点定义、展开、导入导出
- `io/`：图与模板文件读写
- `lifecycle/`：初始化与销毁

#### Client

拆成：

- `runtime/`：sdk 生命周期、连接、权限、可见性
- `controls/`：控制分发器 + action handlers + plugin handlers
- `visual/`：场景管理、后处理、相机层
- `media/`：媒体状态、截图、clip 参数解析
- `control-plane/`：offer 与 safe mode 状态

#### Display

拆成：

- `runtime/transport-local`
- `runtime/transport-server`
- `runtime/pairing`
- `controls/dispatcher`
- `media/clip + image-url`
- `local-media/registry`
- `store/` 仅做状态聚合

#### Server

拆成：

- `gateway/`
- `router/`
- `presence/`
- `control-plane/`
- `assets/`
- `local-media/`
- `geo/`
- `telemetry/`

### 10.3 依赖与边界治理

必须建立：

1. 层级依赖规则（低层不可依赖高层）。
2. 深层导入限制（仅允许 package exports）。
3. 循环依赖检测与 CI 阻断。
4. 统一日志与错误边界，防止跨层泄漏实现细节。

### 10.4 旧项目高风险点（要主动规避）

以下类型在旧工程中已形成维护风险，新工程必须拆解：

1. 超大 NodeCanvas 组件及其控制器。
2. Display 单 store 承担全链路逻辑。
3. Client 启动页与运行时混杂。
4. SDK tone/node 执行模块过大。
5. Manager 资产管理 UI 过重。

你的重构版必须从 Day 1 就做边界隔离。

---

## 11. 关键执行链路（逐条实现并验收）

### 链路 A：Manager -> Client 控制闭环

1. Manager 选中目标客户端。
2. 发送控制动作。
3. Server 路由到目标。
4. Client 执行动作。
5. Client 回传关键状态。
6. Manager UI 实时反映。

### 链路 B：Manager -> Display 双通道闭环

1. Manager 打开 Display 并尝试本地配对。
2. 成功则走 MessagePort 本地通道。
3. 失败或超时则回落 Socket 通道。
4. Display 执行控制并回传 ready/媒体事件。

### 链路 C：Node Graph 部署执行

1. Manager 编辑图并检测可下发 loop。
2. 部署到端侧执行器。
3. 执行器按 tick 运行并应用 override。
4. 执行状态与日志回传。
5. Manager 可停止/移除/重部署。

### 链路 D：资产闭环

1. Manager 上传资产并建索引。
2. 资产在 UI 中可筛选与预览。
3. 控制动作引用资产。
4. Client/Display 获取并展示。
5. 播放状态和异常可观测。

### 链路 E：控制平面

1. 管理员配置组策略。
2. 控制权转移 offer 发起。
3. 端侧接收并确认/拒绝。
4. 服务端更新 ownership。
5. 全端同步控制权状态。

### 链路 F：时间同步

1. manager/client 周期性校时。
2. executeAt 调度在多端尽量同步。
3. 音频/视觉触发保持可接受同步误差。

---

## 12. 工程实现方式（你必须按阶段交付）

### 阶段 1：基础骨架与协议层

交付：

1. Monorepo 与 apps/packages 空壳落地。
2. protocol + plugin-core + ui-kit 基础完成。
3. lint/format/build 全链路通过。

### 阶段 2：Server 与 SDK 基线

交付：

1. Server 网关 + 路由 + registry + control-plane。
2. sdk-manager/sdk-client 完成连接与消息分发。
3. 时间同步与基础控制消息可跑通。

### 阶段 3：Client/Display 执行链路

交付：

1. Client 权限、控制执行、媒体执行、视觉渲染。
2. Display 双通道接入 + 媒体播放 + 覆层控制。
3. 本地桥接与 server fallback 可切换。

### 阶段 4：Manager 控制台

交付：

1. 连接、客户端管理、控制操作、状态监控。
2. 控制平面操作 UI。
3. Display 面板与镜像协作。

### 阶段 5：Node Canvas 与执行器

交付：

1. 节点编辑、分组、循环识别、部署控制。
2. node-core runtime + client executor 完成。
3. logs/status/override 能力完整。

### 阶段 6：资产中心与本地媒体

交付：

1. 资产上传/筛选/预览/标签/备注/删除闭环。
2. 本地媒体引用与 display 本地文件注册能力。

### 阶段 7：视觉精修与性能治理

交付：

1. 视觉语言统一打磨。
2. 高频消息治理、负载保护。
3. 压测脚本可产出稳定指标。

### 阶段 8：验证与部署

交付：

1. E2E + 单测 + 压测报告。
2. 生产部署文档（Nginx/PM2/Redis/HTTPS）。
3. 运维排障手册。

---

## 13. 测试与验收门禁（必须全部通过）

### 13.1 功能门禁

1. Manager 可稳定管理并控制多 Client。
2. Display 在本地桥接与服务端模式均可工作。
3. Node Graph 可编辑、部署、运行、停止并回传状态。
4. 资产上传到端侧展示链路可全流程打通。
5. 控制平面转移与回收流程可复现。

### 13.2 质量门禁

1. 无关键路径巨石文件。
2. 无明显层级越界依赖。
3. 关键模块有可读测试与日志。
4. 异常场景可恢复，不会全局崩溃。

### 13.3 性能门禁

1. 中高并发下控制延迟可接受。
2. 高频动作不会引发广播风暴。
3. 移动端长时间运行无明显失控降频。
4. 大图像推送与媒体切换可稳定执行。

### 13.4 视觉门禁

1. 三端视觉语言统一。
2. Manager 具备舞台控制台质感。
3. Client 启动页和运行态有明确风格识别。
4. Display 输出稳定、简洁、沉浸。

---

## 14. 你在实现时必须输出的文档

在编码过程中，你必须同步产出以下文档：

1. `architecture-overview.md`：系统分层图和模块边界。
2. `distributed-design.md`：单实例/多实例策略、Redis adapter、扩展路线。
3. `plugin-architecture.md`：音频/视觉/效果/节点插件生命周期。
4. `anti-monolith-rules.md`：文件上限、拆分标准、依赖约束。
5. `delivery-plan.md`：阶段任务、风险、回滚策略。
6. `verification-report.md`：每阶段验证命令与结果。

---

## 15. 对你（执行 AI）的硬性行为约束

1. 不要只给口头方案，必须给可运行产物。
2. 不要把复杂逻辑塞回单文件。
3. 不要省略控制平面、节点执行、资产中心。
4. 不要用“后续再做”逃避核心能力。
5. 不要用接口字段细节堆砌文档，保持架构与行为粒度。
6. 每阶段先说明设计，再实现，再验证。
7. 每阶段结束给出“已完成/未完成/风险项”。

---

## 16. 交付定义（Definition of Done）

只有满足以下条件，才算完成：

1. 四端应用全部可运行并可联调。
2. 共享 packages 全部实际被使用。
3. 核心执行链路 A-F 全部跑通。
4. 视觉风格达到目标气质而非模板化后台。
5. 项目不存在关键巨石结构，模块边界清晰。
6. 有完整的部署、运维、测试、验收文档。

最终目标：

- 交付一个“可长期维护、可真实演示/排练”的完整系统重做版。
- 在完整复刻能力的同时，提前消除旧架构的维护地雷。
