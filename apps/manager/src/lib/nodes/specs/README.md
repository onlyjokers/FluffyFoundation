# Node Specs (Manager)

Manager 的 Node Graph 节点通过本目录及子目录下的 `**/*.json` 自动注册。

从 2025-12-22 的 NodeGraph 改造开始：

- `@shugu/node-core` 是 **运行时单一真相源（SOT）**：ports/types/configSchema 默认约束 + process/onSink 实现都在 core 里。
- 本目录 JSON 逐步变为 **UI overlay**：用于覆盖 label/category、以及更严格的 UI 限制（min/max/step 等）。

## 结构

每个 JSON 文件代表一个节点（两种用途）：

### 1) node-core 已存在的 type（推荐）

JSON 作为 UI overlay，只会应用：

- `label` / `category`
- `inputs` / `outputs`：仅应用同名端口的 `label`、`min/max/step`（用于更严格的 UI 限制）
- `configSchema`：仅应用同 key 字段的 `label`、`min/max/step`

注意：

- `runtime` 在 core 类型上会被忽略（将逐步从 JSON 中移除）。

### 2) manager-only type（临时/平台相关）

当 `type` 在 `@shugu/node-core` 不存在时，JSON 会作为完整定义来源，此时必须提供：

- `type` / `label` / `category`
- `inputs` / `outputs` / `configSchema`
- `runtime.kind`（安全内置实现，不使用 `eval`）

## runtime.kind（目前支持）

- `command`: 发送控制命令（适合新增各种 Processor 节点）
- `number`, `math`, `lfo`
- `logic-add`, `logic-multiple`, `logic-subtract`, `logic-divide`, `logic-if`, `logic-for`
- `param-get`, `param-set`
- `client-loader`, `client-executor`, `proc-client-sensors`
- `display-object`
- `midi-fuzzy`, `midi-boolean`, `midi-map`, `midi-select-map`, `midi-color-map`

## 校验

开发期可运行：

- `pnpm validate:node-specs`

它会扫描 `**/*.json` 并报告：

- overlay 是否与 node-core 定义冲突（端口/key 不存在、type 不匹配、min/max 冲突等）
- core 类型仍包含 `runtime`（会提示但不会失败）

## 新增节点

1. 如果节点是通用/跨端（无 DOM/MIDI/Tone.js 依赖）：优先新增到 `packages/node-core`
2. 如果节点是 manager-only：在本目录新增一个 `*.json`，并填写完整定义 + `runtime.kind`
3. 如果只是想改 UI（label/category/约束）：只需在 JSON 里写 overlay（至少 `type`）
4. 重启 `pnpm dev:manager`（或重新 build）即可在 Add 菜单中出现
