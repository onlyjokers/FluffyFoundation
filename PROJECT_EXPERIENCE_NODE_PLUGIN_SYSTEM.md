<!--
Purpose: 用自然语言重新定义 ShuGu 项目的产品体验、功能边界、Node 系统全景与插件体系（重点：音频与 AI），帮助团队在同一目标下推进后续架构与产品决策。
-->

# ShuGu 项目全景说明（体验版 + Node 全量 + 插件体系）

> 基于最新总计划与当前实现的综合整理。
> 本文重点不是接口和实现细节，而是“项目到底在做什么、用户能感受到什么、Node 与插件系统如何支撑体验”。

---

## 1. 这个项目到底是什么

ShuGu 本质上不是单一的“控制台”或“播放器”，而是一套面向现场互动演出/沉浸式体验的 **实时互动控制系统**。

它要解决的核心问题是：

1. 如何把导演级编排、表演者控制、观众设备互动、多屏输出整合成一套可协作系统。
2. 如何在高实时场景下保持响应速度、稳定性和清晰责任边界。
3. 如何让“创作逻辑”可以复用、可转交、可收回、可演进，而不只是一次性脚本。

一句话定义：

`ShuGu = 演出控制平面 + 互动执行网络 + 可编排内容引擎`。

### 1.1 开发组织方式

本项目采用 **Monorepo（单仓多包）** 的方式开发：

1. 多个应用与核心能力在同一仓库协同迭代。
2. 协议、Node、执行、媒体、UI 可以统一演进，减少跨仓库漂移。
3. 适合你现在这种“控制平面 + 执行端 + 插件生态”高度耦合但又要分层治理的系统。

---

## 2. 从体验角度看，用户能感受到什么

### 2.1 Root（总控/导演）体验

Root 是“幕后总控位”：

1. 编排互动逻辑与结构。
2. 把演出内容分组，指定每组归谁负责。
3. 定义哪些组允许转交、哪些不允许。
4. 在失控时一键止损（收权、停演、回到安全状态）。

体验关键词：`全局视角`、`可仲裁`、`可回退`。

### 2.2 Manager（表演者）体验

Manager 是“台上操作位”：

1. 不需要改底层结构就能完成实时表演（切场景、调控件、触发内容）。
2. 可以把某些组的控制权让渡给观众端，形成接力式互动。
3. 可一键收回，保证节奏重新回到演出者掌控。

体验关键词：`即时控制`、`低学习负担`、`接力控制`。

### 2.3 Client（观众设备）体验

Client 平时是执行端，被控制播放/渲染/反馈；被授权后会出现“是否接管”的明确提示：

1. 接受后成为当前控制者，驱动互动链路。
2. 可在规则允许时再转交给下一位。
3. 断线或退出后控制权按规则自动回退，不会永久失联。

体验关键词：`参与感`、`临时控制权`、`责任清晰`。

### 2.4 Display（大屏输出）体验

Display 是独立输出位：

1. 可单屏，也可多屏并行。
2. 可接收媒体与视觉控制，形成舞台外显层。
3. 与 Client 分离管理，支持不同输出路由策略。

体验关键词：`多路输出`、`稳定播放`、`舞台可视化`。

### 2.5 一场典型演出闭环

1. Root 预先编排并分配 Group。
2. Manager 实时演出，按节奏切场景和参数。
3. 某时刻将 Group 让渡给 Client A。
4. A 接受后成为控制者，观众互动直接影响效果。
5. A 可转交给 B（若该 Group 可转交）。
6. 发生断线时自动回退到上级控制者。
7. Root 随时可收回或终止全局，确保可止损。

---

## 3. 功能地图（用户感知层）

### 3.1 编排与复用

1. 用节点图定义互动逻辑、媒体关系、控制链路。
2. 用 Group 组织复杂逻辑，提升排练与演出可维护性。
3. 支持把结构沉淀为可复用单元，降低重复搭建成本。

### 3.2 实时控制与调制

1. 控件驱动（旋钮/推子/场景触发）。
2. 设备输入驱动（传感器、音频特征、MIDI）。
3. 多端联动（Client、Display、可能的混合目标）。

### 3.3 媒体与资产

1. 音频、视频、图片统一资产化管理。
2. 资源预加载与就绪管理，减少临场卡顿。
3. 按角色/归属分发资源，保证正确端拿到正确内容。

### 3.4 权限与控制权

1. 控制权可让渡、可转交、可收回。
2. 有回溯链和安全模式，不靠“默认信任”。
3. 保留全局紧急通道，避免演出事故扩大。

---

## 4. Node 系统（核心中的核心）

### 4.1 Node 系统在项目中的定位

Node 系统不是“一个编辑器功能”，而是 ShuGu 的创作与执行语言：

1. 互动逻辑通过节点表达，不再分散成多处硬编码。
2. 同一套图既能描述创作结构，也能描述现场执行关系。
3. 通过节点把“感知输入 -> 处理 -> 控制输出”串成闭环。

### 4.2 Node 的体验价值

1. 创作者可视化地拼装复杂行为。
2. 表演时可在不破坏结构的前提下做实时调制。
3. 复杂逻辑可打包复用，避免每场重搭。
4. 把控制责任明确到 Group 和节点链路，而非口头约定。

### 4.3 Node 运行语义（用户层）

从体验层看，一条链路通常是：

`对象节点（谁） -> 感知/逻辑节点（怎么变） -> 处理节点（变成什么命令） -> 输出节点（发到哪里）`

你在舞台上看到的是“效果变化”，而系统内部用 Node 保证这条变化可重现、可解释、可回滚。

### 4.4 Group / 自定义节点 / 执行分层

1. Group：把大图拆成可管理的小责任单元。
2. 自定义节点（Nodalization）：把一段结构封装成可复用“积木”。
3. 执行分层：编排层与执行层分离，保证现场可控且高性能。
4. 接管与转交：控制权操作围绕 Group 发生，语义清晰。

### 4.5 全量节点目录（当前仓库口径）

以下清单已尽量合并核心节点定义与编辑器节点定义，用于“全景认知 + 选型查阅”。

> 统计口径：当前仓库可解析到 **76** 个节点类型（核心节点 + 编辑器节点合并口径）。

### AI（AI 能力节点，1）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| AI Model | `ai-model-ref` | 声明并输出 AI 模型资产引用。 | - | ref:string | enabled:boolean<br>model:asset-picker |

### Assets（素材与媒体引用，7）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Load Audio Asset From Remote | `load-audio-asset-from-assets` | 仅输出音频资产引用。 | - | ref:asset | assetId:asset-picker |
| Load Audio From Local(Display only) | `load-audio-from-local` | 加载本地音频（Display/本地场景）。 | asset:string<br>startSec:number<br>endSec:number<br>cursorSec:number<br>loop:boolean<br>play:boolean<br>reverse:boolean<br>playbackRate:number<br>detune:number<br>volume:number | ref:audio(sink)<br>ended:boolean | assetPath:local-asset-picker<br>playbackRate:number<br>detune:number<br>volume:number<br>timeline:time-range |
| Load Audio From Remote | `load-audio-from-assets` | 从资产库加载远程音频并输出引用。 | startSec:number<br>endSec:number<br>cursorSec:number<br>loop:boolean<br>play:boolean<br>reverse:boolean<br>playbackRate:number<br>detune:number<br>volume:number | ref:audio(sink)<br>ended:boolean | assetId:asset-picker<br>playbackRate:number<br>detune:number<br>volume:number<br>timeline:time-range |
| Load Image From Local(Display only) | `load-image-from-local` | 加载本地图片引用。 | asset:string | ref:image(sink) | assetPath:local-asset-picker |
| Load Image From Remote | `load-image-from-assets` | 从资产库加载远程图片引用。 | - | ref:image(sink) | assetId:asset-picker |
| Load Video From Local(Display only) | `load-video-from-local` | 加载本地视频引用（含时间线）。 | asset:string<br>startSec:number<br>endSec:number<br>cursorSec:number<br>loop:boolean<br>play:boolean<br>reverse:boolean<br>volume:number<br>muted:boolean | ref:video(sink)<br>ended:boolean | assetPath:local-asset-picker<br>timeline:time-range<br>fit:select |
| Load Video From Remote | `load-video-from-assets` | 从资产库加载远程视频引用（含时间线）。 | startSec:number<br>endSec:number<br>cursorSec:number<br>loop:boolean<br>play:boolean<br>reverse:boolean<br>volume:number<br>muted:boolean | ref:video(sink)<br>ended:boolean | assetId:asset-picker<br>timeline:time-range<br>fit:select |

### Audio（音频合成与处理，9）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Audio Data | `audio-data` | 把音频流分析成 RMS/BPM/频段特征。 | in:audio(sink) | out:audio(sink)<br>rms:number<br>peak:number<br>low:number<br>mid:number<br>high:number<br>centroidHz:number<br>bpm:number<br>beat:boolean | enabled:boolean<br>fftSize:select<br>smoothing:number<br>lowCutoffHz:number<br>highCutoffHz:number<br>detectBPM:boolean |
| Play Media | `play-media` | 一站式生成音频/图片/视频播放命令。 | audioUrl:string<br>imageUrl:string<br>videoUrl:string<br>trigger:number<br>volume:number<br>loop:boolean<br>fadeIn:number<br>muted:boolean<br>imageDuration:number | cmd:command | audioUrl:string<br>imageUrl:string<br>videoUrl:string<br>volume:number<br>loop:boolean<br>fadeIn:number<br>muted:boolean<br>imageDuration:number |
| Tone Delay | `tone-delay` | 延迟效果器。 | in:audio<br>time:number<br>feedback:number<br>wet:number | out:audio | time:number<br>feedback:number<br>wet:number |
| Tone Granular | `tone-granular` | 颗粒合成播放器。 | url:asset<br>gate:number<br>loop:boolean<br>playbackRate:number<br>detune:number<br>grainSize:number<br>overlap:number<br>volume:number | value:audio | url:asset-picker<br>loop:boolean<br>playbackRate:number<br>detune:number<br>grainSize:number<br>overlap:number<br>volume:number |
| Tone LFO | `tone-lfo` | 低频振荡调制器。 | in:number<br>frequencyHz:number<br>min:number<br>max:number<br>amplitude:number<br>waveform:string | value:number | frequencyHz:number<br>min:number<br>max:number<br>amplitude:number<br>waveform:select |
| Tone Osc | `tone-osc` | 基础振荡器声源。 | frequency:number<br>amplitude:number<br>waveform:string<br>loop:string | value:audio | waveform:select<br>loop:string |
| Tone Pitch | `tone-pitch` | 音高偏移处理。 | in:audio<br>pitch:number<br>windowSize:number | out:audio | pitch:number<br>windowSize:number |
| Tone Resonator | `tone-resonator` | 共振/滤波类效果器。 | in:audio<br>resonance:number<br>dampening:number<br>wet:number | out:audio | resonance:number<br>dampening:number<br>wet:number |
| Tone Reverb | `tone-reverb` | 混响效果器。 | in:audio<br>decay:number<br>wet:number | out:audio | decay:number<br>wet:number |

### Effect（视觉后处理特效，2）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Effect ASCII | `effect-ascii` | 叠加 ASCII 风格特效。 | in:effect<br>resolution:number | out:effect | resolution:number |
| Effect Convolution | `effect-convolution` | 叠加卷积核特效（锐化/模糊等）。 | in:effect<br>preset:string<br>mix:number<br>scale:number<br>bias:number<br>normalize:boolean<br>kernel:string | out:effect | preset:select<br>mix:number<br>scale:number<br>bias:number<br>normalize:boolean<br>kernel:string |

### Gate（布尔门控逻辑，6）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| AND | `logic-and` | 布尔与。 | a:boolean<br>b:boolean | out:boolean | - |
| NAND | `logic-nand` | 布尔与非。 | a:boolean<br>b:boolean | out:boolean | - |
| NOR | `logic-nor` | 布尔或非。 | a:boolean<br>b:boolean | out:boolean | - |
| NOT | `logic-not` | 布尔非。 | in:boolean | out:boolean | - |
| OR | `logic-or` | 布尔或。 | a:boolean<br>b:boolean | out:boolean | - |
| XOR | `logic-xor` | 布尔异或。 | a:boolean<br>b:boolean | out:boolean | - |

### Image（图像参数调制，4）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Img Fit | `img-fit` | 调整图片铺放模式（contain/cover等）。 | in:image | out:image | fit:select |
| Img Scale | `img-scale` | 调整图片缩放。 | in:image<br>scale:number | out:image | scale:number |
| Img Transparency | `img-transparency` | 调整图片透明度。 | in:image<br>opacity:number | out:image | opacity:number |
| Img XY Offset | `img-xy-offset` | 调整图片位置偏移。 | in:image<br>offsetX:number<br>offsetY:number | out:image | offsetX:number<br>offsetY:number |

### Internal（画布结构/兼容节点，4）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Activate | `group-activate` | 旧版组激活节点（兼容层），用于组启停门控。 | active:boolean | - | groupId:string |
| Group | `group-frame` | 用于画布分组与组织，不直接产生演出控制。 | - | - | groupId:string<br>name:string<br>disabled:boolean |
| Group Gate | `group-gate` | 分组门控内部节点（系统结构节点）。 | active:boolean | - | groupId:string |
| Group Proxy | `group-proxy` | 跨 Group 边界的代理端口节点（系统结构节点）。 | in:any | out:any | groupId:string<br>direction:select<br>portType:select<br>pinned:boolean |

### Logic（通用逻辑与数值计算，12）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| -- | `logic-subtract` | 数值减法/透传。 | number:number<br>any:any | number:number<br>any:any | - |
| ** | `logic-multiple` | 数值乘法/透传。 | number:number<br>any:any | number:number<br>any:any | - |
| // | `logic-divide` | 数值除法/透传。 | number:number<br>any:any | number:number<br>any:any | - |
| ++ | `logic-add` | 数值加法/透传。 | number:number<br>any:any | number:number<br>any:any | - |
| Array Filter | `array-filter` | 数组差集筛选。 | a:array<br>b:array | difference:array | - |
| for | `logic-for` | 循环计数序列。 | run:boolean<br>start:number<br>end:number<br>wait:number | index:number<br>running:boolean<br>loopEnd:boolean | - |
| if | `logic-if` | 布尔分流。 | input:boolean<br>condition:boolean | false:boolean<br>true:boolean | - |
| Math | `math` | 二元数学运算。 | a:number<br>b:number<br>operation:string | result:number | operation:select |
| Number Script | `number-script` | 按曲线/时长生成数值轨迹。 | run:boolean<br>loop:string<br>duration:number<br>start:number<br>end:number | value:number<br>running:boolean<br>finished:boolean | loop:select<br>duration:number<br>start:number<br>end:number<br>curve:curve |
| Number Stabilizer | `number-stabilizer` | 平滑数值抖动。 | in:number<br>smoothing:number | out:number | smoothing:number |
| Number to Boolean | `logic-number-to-boolean` | 数值阈值转布尔。 | number:number<br>trigger:number | out:boolean | - |
| Sleep | `logic-sleep` | 延时透传。 | input:any<br>sleepTimeMs:number | output:any | - |

### MIDI（MIDI 输入映射，5）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Boolean Bind | `midi-boolean` | 把 MIDI 输入映射为开关布尔值。 | threshold:number | value:boolean | source:midi-source<br>buttonize:boolean<br>threshold:number |
| Color Mapping | `midi-color-map` | 把 MIDI 值映射为颜色渐变。 | in:fuzzy<br>from:color<br>to:color<br>invert:boolean | out:color | from:string<br>to:string<br>invert:boolean |
| Fuzzy Bind | `midi-fuzzy` | 绑定 MIDI 输入，输出 0~1 的模糊值。 | - | value:fuzzy | source:midi-source |
| Numeral Mapping | `midi-map` | 把 MIDI 模糊值映射为数值区间。 | in:fuzzy<br>min:number<br>max:number<br>invert:boolean<br>round:boolean<br>integer:boolean | out:number | min:number<br>max:number<br>invert:boolean<br>round:boolean<br>integer:boolean |
| Selection Mapping | `midi-select-map` | 把 MIDI 值映射为离散选项。 | in:fuzzy<br>invert:boolean | out:string | invert:boolean |

### Objects（控制对象与命令路由，4）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Client | `client-object` | 选择/聚合目标客户端，并把命令发送到这些客户端。 | loadIndexs:array<br>index:number<br>range:number<br>random:boolean<br>in:command(sink) | out:client<br>indexOut:number<br>indexs:array<br>imageOut:image | clientId:client-picker |
| Client Count | `client-count` | 输出在线客户端数量与索引列表。 | - | allIndexs:array<br>number:number | - |
| Cmd Aggregator | `cmd-aggregator` | 把多路命令输入合并为一路输出，便于集中下发。 | in1:command<br>in2:command<br>in3:command<br>in4:command<br>in5:command<br>in6:command<br>in7:command<br>in8:command | cmd:command | - |
| Display | `display-object` | 把命令直接发送到 Display 输出端。 | in:command(sink) | - | - |

### Other（辅助显示/注释，2）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Note | `note` | 仅用于注释说明。 | - | - | text:string |
| Show Anything | `show-anything` | 把任意输入转成可视文本。 | in:any | value:string | - |

### Parameters（全局参数系统，2）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Get Parameter | `param-get` | 读取全局参数值。 | - | value:number | path:param-path |
| Set Parameter | `param-set` | 写入全局参数值（支持模式）。 | value:number<br>bypass:boolean<br>mode:string | value:number | path:param-path<br>mode:select |

### Player（输出层播放器，6）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Dynamic Image Player | `proc-show-image` | 把图像输入转换成 show/hide image 命令。 | in:image | cmd:command | - |
| Effect Layer Player | `effect-out` | 把视觉效果链输出为特效控制命令。 | in:effect(sink) | cmd:command | - |
| Scene Layer Player | `scene-out` | 把场景链输出为视觉场景控制命令。 | in:scene(sink) | cmd:command | - |
| Static Audio Player | `audio-out` | 把音频链作为播放器命令输出。 | in:audio(sink) | cmd:command | - |
| Static Image Player | `image-out` | 把图像链作为播放器命令输出。 | in:image(sink) | cmd:command | - |
| Static Video Player | `video-out` | 把视频链作为播放器命令输出。 | in:video(sink) | cmd:command | - |

### Processors（把输入处理成控制命令，5）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Client Sensors | `proc-client-sensors` | 读取目标客户端的传感器与麦克风特征，作为互动输入。 | client:client | accelX:number<br>accelY:number<br>accelZ:number<br>gyroA:number<br>gyroB:number<br>gyroG:number<br>micVol:number<br>micLow:number<br>micHigh:number<br>micBpm:number | - |
| Flashlight | `proc-flashlight` | 生成手电控制命令（开/关/闪烁）。 | active:boolean<br>mode:string<br>frequencyHz:number<br>dutyCycle:number | cmd:command | active:boolean<br>mode:select<br>frequencyHz:number<br>dutyCycle:number |
| Push Image Upload | `proc-push-image-upload` | 触发客户端截图上传命令流。 | trigger:boolean | cmd:command | format:select<br>quality:number<br>maxWidth:number<br>speed:number |
| Screen Color | `proc-screen-color` | 生成屏幕颜色与透明度调制命令。 | active:boolean<br>primary:color<br>secondary:color<br>waveform:string<br>frequencyHz:number<br>maxOpacity:number<br>minOpacity:number | cmd:command | active:boolean<br>primary:string<br>secondary:string<br>maxOpacity:number<br>minOpacity:number<br>waveform:select<br>frequencyHz:number |
| Synth (Update) | `proc-synth-update` | 生成合成器实时更新命令（音高/波形/调制）。 | active:boolean<br>waveform:string<br>frequency:number<br>volume:number<br>modDepth:number<br>modFrequency:number<br>durationMs:number | cmd:command | active:boolean<br>frequency:number<br>volume:number<br>waveform:select<br>modDepth:number<br>modFrequency:number<br>durationMs:number |

### Scene（视觉场景层，4）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Scene Back Camera | `scene-back-camera` | 启用后置摄像头场景层。 | in:scene | out:scene | - |
| Scene Box | `scene-box` | 启用 Box 场景层。 | in:scene | out:scene | - |
| Scene Front Camera | `scene-front-camera` | 启用前置摄像头场景层。 | in:scene | out:scene | - |
| Scene Mel Spectrogram | `scene-mel` | 启用 Mel 频谱场景层。 | in:scene | out:scene | - |

### Values（基础值节点，3）

| 节点 | Type | 体验作用 | 输入 | 输出 | 关键配置 |
|---|---|---|---|---|---|
| Bool | `bool` | 输出固定或输入布尔值。 | value:boolean | value:boolean | value:boolean |
| Number | `number` | 输出固定或输入数值。 | value:number | value:number | value:number |
| String | `string` | 输出固定或输入字符串。 | value:string | value:string | value:string |


---

## 5. 插件系统设计（开放扩展版）

### 5.1 为什么插件系统重要

你这个项目要长期演进，就不能把所有能力都塞在一个执行体里。插件系统的价值是：

1. 把重能力（音频引擎、视觉渲染、AI 推理）从控制逻辑中解耦。
2. 让能力可替换、可扩展，不用每次改核心框架。
3. 让不同设备按需加载能力，控制性能与能耗。

### 5.2 能力域开放原则（不要定死）

这里明确一条总原则：

**插件体系不应被“当前能力列表”定死。**

1. 音频、视频、视觉、AI 只是当前重点能力域，不是系统上限。
2. 未来可持续新增能力域（例如更多感知、空间交互、装置联动等），不需要推翻现有产品定义。
3. 需要被固定的是“插件治理边界”，而不是“插件能力类型”。
4. 插件治理边界包括：统一协议、统一生命周期、统一质量门槛。

### 5.3 插件准入与演进机制

为了保证“可扩展”不变成“不可控”，新增能力域进入正式演出环境时，至少要满足：

1. 协议兼容：能进入统一命令与作用域体系。
2. 可观测：能被看见运行状态和异常状态。
3. 可降级：异常时不会拖垮全局演出链路。

插件协议后续演进遵循：

1. 向后兼容优先，避免一次升级让既有演出资产失效。
2. 用渐进替换而不是一次性推倒，降低现场风险。

### 5.4 插件体系分层（当前基线）

#### A. 插件协议层

职责：统一插件元数据、命令消息、上下文约束。

1. 所有插件命令用统一结构表达（pluginId + command + payload + scope）。
2. 支持作用域（scope）概念，便于后续授权审计。
3. 定义了“插件是能力单元，不是散落脚本”的基础边界。

#### B. 系统执行插件层

职责：把编排好的执行单元部署到客户端并运行。

1. 支持部署、启动、停止、移除、覆盖参数。
2. 使“局部逻辑下沉到客户端”成为可控机制。
3. 这是去中心化互动能力的关键执行器。

#### C. 媒体与特效插件层（当前示例域）

1. 音频特征插件：Mel 频谱、频段拆分、节拍估计等。
2. 视觉场景插件：多场景渲染与场景叠加。
3. 多媒体核心负责资产、预载、媒体状态机，与插件协作。

#### D. AI 能力层（当前示例域）

1. 把 AI 当成独立能力域，而不是硬编码在节点引擎里。
2. 支持未来的本地推理、远程推理、混合推理路径。
3. 当前重点是“模型资产化 + 按需启用 + 不启用零负担”。

### 5.5 音频设计（重点）

#### 5.5.1 单一音频引擎原则

核心目标：避免多套音频上下文并存导致不可控。

1. 使用统一音频入口管理启用状态。
2. 把音频启动放在用户手势上下文，兼容移动端限制。
3. 在系统层追踪 loaded/enabled/error，便于现场判断状态。

#### 5.5.2 音频图与控制图协作

1. Node 图负责“控制语义”。
2. 音频适配层负责“真实音频连接与参数变化”。
3. 音频连接使用明确端口语义，减少“看起来是数字，实际上是音频”的认知混乱。

#### 5.5.3 音频特征插件（互动输入）

1. Mel 频谱插件：输出 Mel 频谱、RMS、频谱重心等特征。
2. 频段拆分插件：输出低中高能量、RMS、节拍/BPM 估计。
3. 这些特征可直接回流到 Node 逻辑作为调制输入。

#### 5.5.4 音频资产与预加载

1. 资产通过统一引用进入图，不走大体积消息直传。
2. 多媒体核心负责解析、缓存、并发预加载。
3. 在演出前尽量把“会用到的音频”准备到可立即触发状态。

#### 5.5.5 演出稳定性取向

1. 高频控制允许策略性丢帧，但保持最新值语义。
2. 优先保证“体感连续”，而不是保证每一帧都可靠送达。
3. 目标是舞台表现稳定，而不是实验室式绝对精确。

### 5.6 视频/图像设计

1. 媒体状态机统一管理播放、停止、静音、循环、区间、反向等语义。
2. 图像链支持 fit/scale/offset/opacity 等参数化控制。
3. Display 与 Client 都可复用相同媒体能力，但职责分离（输出端与体验端）。

### 5.7 视觉插件设计

1. 场景管理支持多场景并行启用，而非单一场景切换。
2. 场景层与效果层可叠加，形成更丰富舞台表达。
3. 场景生命周期统一管理（注册、启停、更新、销毁）。

### 5.8 AI 功能设计（模型资产化 + 低负担）

1. AI 节点通过模型引用接入图，不强绑具体推理实现。
2. 模型作为资产管理，可按 Group/归属策略分发。
3. 未启用时不初始化重资源（避免额外算力与电量开销）。
4. 启用后可把推理结果作为调制输入，纳入同一演出链路。

---

## 6. 体验质量标准（全生命周期）

### 6.1 质量总则

1. 质量标准覆盖排练、正式演出、演后复盘三个阶段。
2. 全角色统一覆盖：Root、Manager、Client、Display。
3. 在关键演出场景中，优先级是“同步一致性”高于“极限低延迟”。

### 6.2 规模与并发目标（当前基线）

1. 单场并发规模按 100-300 台终端定义。
2. 同时高频控制者按 1-3 个定义。
3. 同时活跃 Group 常见为 5-10 个（参考项，不作为硬门槛）。

### 6.3 同步一致性标准（核心）

1. 多端同一事件的时间偏差目标：不高于 30ms，越小越好。
2. 单次事件同步合格线：至少 95% 终端在阈值内执行。
3. 系统允许“以适度延迟换取同步”，而非盲目追求最低时延。
4. 事件提前量默认 120ms，可按场次/Group 调整。
5. 晚到超窗默认阈值 30ms，可按场次/Group 调整。
6. 对晚到超窗终端：直接跳过当次事件，等待下一次事件重新对齐。

### 6.4 关键事件与高频事件标准

1. 关键事件（开关、切换、关键触发）执行成功率目标：不低于 99.9%。
2. 高频调制事件有效参与率目标：不低于 95%。
3. 当高频参与率持续低于 95% 时，系统应自动增强节流。
4. 增强节流优先限制连续高频调制输入，优先保住关键事件稳定性。

### 6.5 控制平面一致性标准

1. Client 作为执行端，不承担控制权判定，只执行服务端合法命令。
2. 当出现冲突控制请求时，服务端必须单一裁决，只下发胜者命令。
3. 被拒绝方需要快速得到明确反馈，Manager 端反馈时效目标为 P95 不高于 200ms。

### 6.6 可观测与告警标准

1. 默认观测粒度为按 Group 汇总（可关闭）。
2. 同步质量告警门槛：同步率连续 3 秒低于 95%。
3. 正式演出模式下，触发质量告警后应自动进入处置流程。
4. 非正式模式下，触发告警后以提示为主，由操作者手动决定是否切换策略。

### 6.7 正式演出模式治理

1. 正式演出模式只能由 Root 显式开启。
2. 正式模式开启后，中途不允许降回非正式模式。
3. 正式演出结束也只能由 Root 触发。
4. Root 结束演出时，系统广播全局结束信号，所有终端当前行为立即终止。

### 6.8 四角色最小质量看板

#### Root

1. 全局同步率
2. 告警状态
3. 关键 Group 健康状态

#### Manager

1. 当前 Group 同步率
2. 命令拒绝反馈
3. 当前节流状态

#### Client

1. 连接状态
2. 同步状态
3. 是否被临时静默

#### Display

1. 输出同步状态
2. 当前场景状态
3. 延迟健康状态

---

## 7. 现在可以如何定义这个项目

如果要对团队做一句清晰共识：

**ShuGu 是一个“可编排、可协作、可转交、可止损”的实时互动演出系统。**

它的灵魂是 Node 系统，扩展能力靠插件体系，并且插件能力域保持开放扩展，不被当前能力清单定死。

---

## 8. 这份文档怎么用

1. 给新成员：先看 1-3 节建立产品认知，再看 4-6 节进入系统认知与质量认知。
2. 做需求评审：先判定需求属于 Node 语义、插件能力还是控制权语义，再对照第 6 章质量标准判断是否可入场。
3. 做架构决策：把“是否提升体验稳定性、同步一致性与演出可控性”作为第一判断标准。
