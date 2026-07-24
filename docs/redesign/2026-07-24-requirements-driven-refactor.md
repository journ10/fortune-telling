# 需求驱动的项目重构设计

日期：2026-07-24
状态：待用户确认后进入实施

> 本文件只从需求目标出发定义目标态，不迁就任何当前实现结构。
> 需求来源：`docs/superpowers/specs/2026-07-06-realistic-3d-coin-casting-redesign.md`（已批准决策）与 `docs/audit/2026-07-13-current-state/audit.md`（用户目标与失焦诊断）。
> 其余历史 spec/plan 与本文件冲突时，以本文件为准，历史文档归档不再维护。

## 1. 产品定义

**一句话：一个物理可信的 3D 铜钱六爻起卦应用。**

用户目标：自然进入一次**可信、有仪式感、可理解**的三枚铜钱六爻起卦，并在 AI 不可用时仍获得完整传统结果。

北极星体验：用户相信"结果来自铜钱真实落定"，并且在六次投掷的任何一刻都知道现在发生了什么、下一步做什么、还要多久。

## 2. 不可协商的需求（硬约束）

以下条目是验收标准，任何实现不得以任何理由绕过：

1. **物理即结果**。正反面只从 Rapier 刚体落定后的朝向读取。禁止预生成 heads/tails、禁止动画目标定面、禁止超时随机判面、AI 不参与起卦。
2. **每爻一次动作**。用户必须为每一爻完成一次投掷动作；不提供一键生成六爻。
3. **AI 完全后置**。首次进入无任何配置阻断；未配置 AI 时起卦与传统结果完整可用；AI 失败不破坏传统结果。
4. **单一默认路径**。PC = 按住钱筒摇动、松手抛出；移动端 = 摇晃蓄势、静止释放；键盘/触控是兜底而不是第二条主路径。摄像头手势不属于主流程（本期移除或降为隐藏实验开关）。
5. **第一屏即桌面**。没有 landing page、没有前置表单墙；问题输入和 AI 设置都是桌面上的可选入口。
6. **每爻有证据**。每爻记录输入来源、输入摘要、落定原因、落定耗时、三枚朝向、分数、爻名。
7. **等待有上限**。单次投掷从释放到可读结果的目标耗时 ≤ 3 秒；超时走 `timeout-readable` 物理路径，绝不让流程卡住。
8. **结果可追溯、可扫读**。传统结果（本卦/动爻/变卦/卦爻辞）是结果页主角；AI 解读是可展开的最后一项。

## 3. 目标用户旅程

```text
进入 → 真实桌面 + 三枚铜钱（第一帧即可信，不过曝、不裁切）
     → （可选）默念/填写问题
     → 按住钱筒摇动（能量反馈）→ 松手抛出
     → 铜钱碰撞、翻转、落定（≤3s）
     → 即时爻反馈：铜钱特写 + "第 N 爻 · 少阳（不变）" + 进度
     → 重复至第六爻
     → 成卦时刻（六爻排盘逐爻点亮的仪式感）
     → 结果抽屉：本卦（主角）→ 动爻/变卦 → 传统依据 → 投掷证据 → AI 解读（可配置/可重试）
```

与当前实现的关键差异：无 AI 配置阻断、无投掷前的模式选择二次决策、每爻有即时反馈、落定时间受预算约束、结果页层级以卦象为中心。

## 4. 目标架构

### 4.1 模块边界

```text
src/
  core/            # 纯领域逻辑，零运行时依赖，纯函数
    coinToss.ts        # 三枚计分 6/7/8/9
    hexagrams.ts       # 成卦、动爻、变卦
    trigrams.ts
    types.ts
  data/            # 64 卦静态数据（卦辞、象辞、爻辞、关键词）
  casting/         # 起卦流程核心，唯一流程事实来源
    castingMachine.ts  # 状态机（见 4.3）
    castingSession.ts  # 六爻会话与证据累积
    evidence.ts        # CastingEvidence 类型与序列化
  input/           # 只负责把"人"变成 PhysicalTossInput
    pointerChamber.ts  # PC 钱筒摇动采样与映射
    deviceShake.ts     # 移动端 shake-then-still
    keyboardToss.ts    # 键盘兜底
  physics/         # headless，可在无 DOM 环境测试
    tossSimulation.ts  # Rapier 世界构建与步进
    settlement.ts      # strict / timeout-readable / 立边扰动
    faceReader.ts      # 刚体 quaternion → heads/tails
  render/          # 只读 casting 状态与物理快照，绝不回写结果
    scene.ts           # 桌面、相机、灯光
    coinView.ts        # 铜钱网格与刚体位姿同步
    materials.ts
    post.ts
  ai/              # 设置存储、OpenAI-compatible 请求、JSON 校验
  ui/              # React HUD、问题入口、结果抽屉、证据面板
  app/             # 组合根（App.tsx / main.tsx）
```

### 4.2 依赖方向（单向，禁止反向）

```text
ui ──┐
render ─┼──> casting ──> physics ──> core
input ──┘        │                    ▲
                 └──────> ai          │
data ─────────────────────────────────┘
```

- `core`、`data`、`physics` 不 import 任何 React / Three / DOM。
- `render` 从物理快照同步网格位姿；物理不知道渲染存在。
- `casting` 是唯一允许编排 input → physics → core 的层。
- `ai` 只消费已成卦的结果，起卦链路不知道 ai 存在。

### 4.3 状态机（唯一流程来源）

```text
idle → charging → released → simulating → settled → line-recorded
                                                        │ 未满六爻 → ready
                                                        ▼ 满六爻
                                                     result → reading → reading-ready
                                                                  └────→ reading-error（传统结果保留）
```

约束（直接进测试）：

- `simulating` 之前不允许展示当前爻结果。
- `settled` 之前不允许调用计分。
- 任何状态下 AI 失败不影响 `result` 的可用性。
- `simulating` 有最大保护时限，超时强制走 `timeout-readable`。

### 4.4 核心契约

```text
PointerSamples / MotionSamples / KeyHold
  → PhysicalTossInput        { source, coins[3] 初始位姿与速度, energy, durationMs, perturbationSeed }
  → SettledToss              { faces[3], settledReason, settledTimeMs }
  → CoinToss                 { score, lineName, isMoving }        （core 计分）
  → CastingEvidence          { throwIndex, inputSource, inputSummary, settledReason, settledTimeMs, faces, score, lineName, isMoving }
  → CastingResult            { 本卦, 动爻, 变卦, lines[6], evidence[6] }
  → AiPromptPayload          { 问题, 投掷记录, 传统依据 }
  → AiReading                { headline, plainText, advice[] }
```

## 5. 保留 / 重建 / 移除清单

保留的是"能力"，不是现有代码结构；保留部分允许改名、移动、精简。

| 处置 | 内容 |
| --- | --- |
| 保留为纯库 | `domain/`（coinToss、hexagrams、trigrams、types）→ `core/`；`data/hexagramCatalog`；`ai/openaiReading` 与设置存储 |
| 重建 | 应用状态机与会话（替代 `useCastingSession`）、全部输入链路（改为只产出 `PhysicalTossInput`）、物理（输入驱动 + 落定读取）、渲染场景与 HUD（替代 1543 行的 `TabletopScene.tsx`）、结果页（层级重做） |
| 移除 | 根目录 `debug_*.ts`、投掷前摄像头/桌面模式选择层、结果预生成/回退判面路径、AI 配置首屏阻断、1024 行 `styles.css`（随 UI 重建重写） |
| 移出主路径 | MediaPipe 摄像头手势（依赖 `@mediapipe/tasks-vision`，本期移除或降为实验开关；保留依赖与否在 M1 决定） |

## 6. 工程基线

- **单基线收敛**：新建 `refactor/from-requirements` 分支一次到位重建；停止主工作区与工作树双线演进；旧分支仅作视觉资产参考，不做合并来源。
- **测试分层**：
  - 纯单测（vitest）：core 计分、成卦、输入映射、AI payload 校验。
  - headless 物理测试：相同 `PhysicalTossInput` + 固定扰动种子可复现；落定读取来自刚体 quaternion；`timeout-readable` 与立边扰动不生成随机面。
  - 统计测试（不进 PR 快速门）：单枚 ≈ 50/50；线值 ≈ 12.5/37.5/37.5/12.5；多种正常输入模式无明显偏向。
  - UI 测试只断言"状态 → 界面"映射，不驱动物理。
- **性能预算**：首屏 JS gzip ≤ 500 KB（three 分包、Rapier WASM 动态加载）；铜钱纹理 ≤ 500 KB；单次落定 ≤ 3 s；移动端 ≥ 30 fps。
- **可访问性**：键盘可完成全流程；对比度达标；`prefers-reduced-motion` 下降低相机与粒子动效；权限失败有文案且可继续。
- **文档**：补 README（启动/构建/测试/产品边界）；本文件为唯一有效设计基线。

## 7. 里程碑（每个都可独立验收）

### M1 · 物理闭环（headless）

定义 `PhysicalTossInput` / `SettledToss` / `CastingEvidence`，实现输入驱动仿真与落定读取。
验收：任一输入路径只能通过物理仿真获得 faces；可复现测试、落定测试、统计测试全部通过。无 UI。

### M2 · 最小垂直切片

程序化材质的桌面与铜钱 + PC 钱筒交互 + 键盘兜底 + 六次成卦 + 传统结果页 + 证据面板。无 AI、无摄像头、无 PBR 资产。
验收：鼠标/键盘完成一次完整六爻；每爻有即时反馈与证据；落定 ≤ 3 s；首次进入零配置阻断。

### M3 · 移动端摇晃

DeviceMotion 权限流程、shake-then-still 检测、权限失败降级触控钱筒。
验收：真机摇晃完成六爻；权限拒绝路径可继续；390px 视口铜钱不裁切、主投掷区不被遮挡。

### M4 · AI 解读后置接入

结果页内配置入口、prompt 组装、JSON 校验、失败保留传统结果并可重试。
验收：未配置时结果页完整可用；失败态文案可行动；AI 内容不改写经典原文。

### M5 · 视觉基线与收尾

PBR 铜钱与桌面资产、灯光/阴影/后处理、音效、性能档位、可访问性审计、README 与验收截图基线。
验收：视觉中心始终是铜钱物理运动；性能预算达标；键盘全流程通过。

## 8. 本期明确不做

- 摄像头手势起卦、纳甲六爻体系（世应/六亲/六神/月建日辰/用神）
- 后端代理、账户、历史云同步、付费
- 医疗/法律/投资等高风险确定性建议
- 一键生成六爻、随机数或动画决定正反面

## 9. 主要风险与对策

| 风险 | 对策 |
| --- | --- |
| 真实物理分布受参数偏置 | 统计测试校准摩擦/弹性/厚度/初始姿态范围，纳入 M1 验收 |
| 移动端 Rapier 性能不足 | 简化碰撞体、固定步长、性能档位（M3/M5） |
| 落定时间过长破坏节奏 | 物理参数预算 + `timeout-readable`，3 秒上限进验收 |
| 前端直连暴露 API Key | UI 明示"仅适合个人使用"，后端代理列入后续路线 |
| 视觉资产制作成本高 | M2 用程序化材质打通闭环，M5 再替换高质量资产 |
