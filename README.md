# 铜钱六爻（fortune-telling）

一个"先物理、后卦象"的网页六爻起卦应用：三枚铜钱在 3D 桌面上真实抛掷、
碰撞、落定，**卦象完全由铜钱的最终物理朝向读出**——没有随机数决定正反面，
没有一键生成。传统结果（本卦/动爻/变卦/传统依据）在本地即时给出；
AI 白话解读为完全后置的可选项，未配置不影响任何核心流程。

## 设计文档

需求与重构设计（M1–M5 里程碑、架构约束、验收标准）：
[`docs/redesign/2026-07-24-requirements-driven-refactor.md`](docs/redesign/2026-07-24-requirements-driven-refactor.md)

核心原则：

- 物理是唯一真相来源：面朝上只从刚体最终姿态判读（`faceReader`）。
- AI 永远后置：起卦链路不知道 AI 的存在，AI 只消费已成卦的结果与证据。
- 视觉中心始终是铜钱物理运动，不加大面积特效。

## 命令

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器（Vite）
npm run build        # tsc 类型检查 + 生产构建（dist/）
npm test             # 全部单元/集成测试（vitest, jsdom）
npm run test:stats   # 物理分布统计测试（node 环境，单独配置）
npm run lint         # 仅 tsc 类型检查
```

## 架构分层

```
src/
├── domain/        # 纯领域规则：三枚记爻、六爻成卦、卦典与传统依据
│                  #   coinToss / interpretation / hexagrams / types
├── casting/       # 起卦流程状态机（castingMachine）与会话（castingSession）
│                  #   相位: idle→charging→released→simulating→settled→ready→result
│                  #   结果后 AI 相位: reading→reading-ready/reading-error
│                  #   evidence.ts 记录每一爻的输入与落定证据
├── physics/       # Rapier 物理：tossSimulation（WASM 动态加载）、
│                  #   settlement 判停、faceReader 判面、seededRandom 扰动
├── render/        # three.js 渲染：scene（灯光/阴影/色调映射）、
│                  #   materials（PBR 贴图）、coinView（姿态同步）
├── input/         # 输入：pointerChamber（按住摇动）、keyboardToss（空格）、
│                  #   deviceShake（移动端摇晃→静止掷出）
├── ai/            # 后置 AI 解读：openaiReading（OpenAI 兼容协议）、
│                  #   aiSettings（localStorage 持久化）
├── app/           # 组合根：App、useCastingController（手势→事件→物理）、
│                  #   useAiReading（自动触发/中止/重试）、useDeviceShake
└── ui/            # 视图组件：TabletopView、CastingHud、ResultPanel、
                   #   AiSettingsPanel 等；只读状态，不做流程决策
```

数据流：输入手势 → casting 事件 → 状态机 → 物理模拟 → 落定判面 →
domain 计分成卦 → 传统结果；AI 解读在 `result` 相位之后异步追加。

## 关键工程事实

- **Rapier 动态加载**：`initTossPhysics()` 内 `import()` 按需加载，
  不进首屏 bundle；`three` 单独 chunk（vite `codeSplitting` 配置）。
- **PBR 资产**：`public/textures/pbr/`（albedo/normal/roughness/metalness/ao，
  每张 ≤500KB），由 `scripts/generate-pbr-textures.py` 生成。
- **AI 配置仅存本机**：localStorage `fortune-telling:ai-settings`；
  前端直连会暴露 API Key，仅适合个人自用。
- **可访问性**：空格/回车可完成完整六爻流程；全站 `:focus-visible`
  焦点可见；`prefers-reduced-motion` 下静置/蓄力动画降级。
- **物理统计验收**：`test:stats` 校验落定时长、正反面分布、
  三正（老阳）不过度偏置，参数调整必须通过该测试。

## 真机验证待办

以下条目无法在 jsdom/CLI 环境验证，需真机/真人确认：

- [ ] 移动端 Safari/Chrome：摇晃→静止掷出的手感与灵敏度
- [ ] iOS `DeviceMotionEvent.requestPermission` 权限弹窗流程
- [ ] 首帧曝光与铜钱正反面辨识度（PBR 贴图 + 暖色侧光的实机观感）
- [ ] 低端机 Rapier 物理帧率（必要时加性能档位）
- [ ] AI 解读真实 API 联调（OpenAI / Anthropic / DeepSeek）
- [ ] 屏幕阅读器走查结果页信息层级
