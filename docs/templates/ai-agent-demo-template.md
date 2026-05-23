<!--
Purpose: 说明如何导入和验证 AI Space Demo 模板。
-->

# AI Agent Demo Template

在 Manager 的 Node Graph 中导入 `ai-agent-demo-template.json`。推荐使用 Node Graph 工具栏里的
`Import Graph`；如果误点 `Import Templates`，Manager 现在也会识别这是 Node Graph 文件并兼容导入。

这个模板会提供：

- 一个绿色的 `AI Space - Traveler Greeting` 框，序列化字段是 `kind: "ai-space"`。
- `agentInterface` 事件绑定：`client.joined`、`client.text.final`、`display.ready`。
- `agentPolicy` 权限边界：server 侧 AI Orchestrator 只能在这个 AI Space 内更新、添加、连接节点。
- Client 反应节点：`client-loader`、`client-executor`、`proc-flashlight`，以及 client 选择辅助节点。
- Display 反应节点：`proc-display-text`、`proc-screen-color`、`display-object`。
- 一个 `string` + `show-anything` 的消息预览节点，AI 可以更新它，用来在 Manager 里看到对话文本状态；`proc-display-text` 会把回答输出到 Display。

它不会做这些事：

- 不在 Canvas 里配置模型。`gpt-5.5` 由 server `.env` 配置，详见 `docs/harness/AI-AGENT-RUNTIME-CONFIG.md`。
- 不使用 `ai-model-ref`。这个节点不是 v1 AI runtime 的控制入口。
- 不让 AI 直接控制普通 Group。只有 `kind: "ai-space"` 且 `agentPolicy.enabled = true` 的绿色 AI Space 才会被 runtime 选中。

推荐验证方式：

1. 导入 JSON。
2. 确认画布上出现绿色框，名称是 `AI Space - Traveler Greeting`。
3. 打开一个 Client 和一个 Display。
4. 在 Client 的 AI 文本输入框里输入一句话。
5. 观察 Manager 是否收到新的 semantic snapshot，同时观察 Client / Display 相关节点是否通过共同语义层发生变化。
