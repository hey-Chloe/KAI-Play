# 游戏多模态 Agent JD 对齐与现场补习

## 一句话定位

KAI Play 当前是一个可复现的确定性长程 Game Agent 原型：农场环境提供真实状态机，Agent 融合画面、文本、RPC 与最近轨迹，维护固定长程目标和可执行层级计划，调用 Skill，记录 Episode，在失败或视觉冲突后重规划，并用离线对照评测验证行为。VLM 已进入像素观察与安全守卫链路，但目前不是动作策略。

## 证据矩阵

| JD 方向 | 当前可运行证据 | 状态 | 不能声称的部分 |
| --- | --- | --- | --- |
| 画面、文本、RPC、历史融合 | `observeFarmAgent` 生成统一观察包；真实页面可生成 512×340 像素帧 | 已实现原型 | 不是 learned multimodal fusion |
| 长程目标与层级规划 | 九日 330 金币目标；解锁胡萝卜、草莓、金牌收获三阶段 | 已实现 | 目标仍为人工定义，不是 LLM 自主生成 |
| 可执行计划与重规划 | 每步枚举合法候选，计划选中的动作直接驱动环境；失败候选在同状态内排除，随后选择下一候选 | 已实现 | 不是搜索树、MCTS 或 LLM Reflection |
| Skill Library | 收获、清理、照料、播种、推进时间五个可调用 Skill | 已实现 | 初始 Skill 由人定义 |
| Skill 学习 | 成功轨迹压缩为宏；迟播失败触发两种白名单修订候选，隔离试跑、晋级及运行时回退 | 受约束实现 | 不是生成代码、权重训练或通用 Skill Discovery |
| Working / Episodic / Procedural Memory | 最近 8 步、最近 20 局、成功 Skill 序列宏；恢复时清洗不可信数据 | 已实现原型 | 无向量检索、跨设备和跨游戏泛化 |
| MCTS 搜索 | 每步在可克隆规则环境中运行 64 次 UCT rollout；根节点保留全部合法动作，内部折叠对称空地；记录访问数、均值、扩展节点、深度与种子 | 已实现确定性原型 | rollout 使用领域先验，不是 learned policy；只在单一农场环境验证 |
| VLM 与 RPC 协同 | Shadow 记录；Guard 在不一致、缺失、旧帧或结构状态冲突时先阻断再执行 | 已实现接入 | VLM 不负责规划，ScienceQA LoRA 未证明农场域效果 |
| 评测 | 贪心、层级、Skill+Memory 对照；正常、故障恢复、Memory 迁移、Skill 修订场景 | 已实现离线骨架 | 尚无真实玩家在线长程评测 |
| 自主目标生成与未知机制探索 | 无 | 待实现 | 不应把固定目标和规则已知环境称为开放探索 |
| LLM / RL / World Model | 无 | 待实验 | 规则引擎是搜索使用的精确 simulator，但不是从数据学习出的 World Model |

## 当前数据流

```text
真实农场状态机
  ↓
画面帧 + UI 文本 + RPC 真值 + 最近 8 步
  ↓
VLM Shadow / Guard（可选，先校验帧新鲜度）
  ↓
固定高层目标 → 当前阶段 → 合法动作候选集
  ↓（MCTS 策略：Selection → Expansion → Simulation → Backpropagation）
  ↓
选择 Skill 与动作 → 规则引擎校验并执行
  ↓
Trajectory：plan id / trigger / candidate rank / before / after / outcome
  ↓
失败候选排除与替代动作 / Episode Memory / 受约束 Skill 修订
```

环境状态永远由规则引擎结算，Agent 不能自报成功。非法动作失败时不改变游戏状态；视觉帧的 `frameRevision` 必须与当前 RPC revision 一致。

## 面试必须讲透的概念

### ReAct 与当前实现

ReAct 是 Reasoning 与 Acting 交替，并使用新 Observation 继续决策。当前循环在结构上是 Observe → Plan → Act → Feedback → Replan，但 reasoning 文本来自确定性代码，不是 LLM 生成 Thought。因此应称“ReAct-style control loop”，不能称“已实现 LLM ReAct”。

### 层级规划

高层目标被拆成阶段，阶段再落到 Skill 和原子动作。本项目过去只有用于解释的阶段视图；现在计划会枚举合法候选并把 `selectedAction` 交给执行器。失败时记录 action id，在同一状态内排除它，再选 candidate rank 更后的动作。

### Skill 与 Action

Action 是一次原子环境调用，例如给第 2 块田浇水。Skill 是具备启动条件与预期效果的可复用行为，例如“维持成长链”。可用强化学习 Option 的 `(I, π, β)` 理解：启动集合、内部策略、终止条件。

### 三类 Memory

- Working Memory：最近 8 步，帮助维持当前任务一致性。
- Episodic Memory：一局的目标、结果、失败和摘要。
- Procedural Memory：成功轨迹压缩出的 Skill 序列，以及通过验收的策略修订。

当前没有 Semantic Memory 知识库，也没有 embedding 检索。Skill 宏当前用于检索和执行序列核对，不应宣称它直接提高了最终收益。

### VLM 与 RPC 为什么同时存在

RPC 是可靠真值和安全执行边界；VLM 证明像素观察链路并暴露视觉误差。Shadow 适合收集误差，Guard 适合 fail-closed。旧帧即使模型判断“匹配”也必须拦截，否则异步推理会把过去画面应用到新状态。

### MCTS 与 World Model

当前 MCTS 策略完整执行 Selection、Expansion、Simulation、Backpropagation：每个真实动作前用固定种子运行 64 次 UCT rollout，最大深度 72；根节点比较全部合法动作，内部节点将等价空地折叠以控制分支。标准九日场景和一次动作拒绝恢复场景都能达到 346 金币，搜索成本、节点数和根动作价值进入 Trace。rollout policy 使用作物成长与旺需先验，因此它是 prior-guided MCTS，不是无先验的通用搜索，也不是学习出的 World Model。

### 长程 Agent 的五类风险

1. 目标漂移：用不可由 Agent 修改的成功条件约束。
2. 误差累积：每步重新观察，动作由规则引擎校验。
3. 循环行为：限制最多 96 步，后续需增加重复状态指标。
4. 上下文污染：短期只取最近 8 步，长期记忆限 20 局并做 schema 清洗。
5. 奖励投机：金币、XP、终局由环境独立计算，不让模型写结果。

## 高频追问与回答边界

1. **这是不是一段脚本？** 是确定性 Agent baseline，但具备完整控制闭环、可执行计划、Skill、Memory、失败恢复和评测。价值在于可复现，且能作为以后 LLM/MCTS/RL 的对照组。
2. **VLM 真正在做什么？** 它读取当前游戏像素帧并做受约束状态判断；Shadow 收集误差，Guard 在冲突时阻断。动作策略仍由 planner 决定。
3. **层级规划为何优于贪心？** 小麦短期周转快但无法达到长期收益；规划策略先积累 XP 解锁胡萝卜和草莓，再按生长周期完成第九日收获。
4. **失败后如何恢复？** 保留原状态，记录失败候选及 plan trigger，在相同状态中排除原 action id，选择下一合法候选；成功后才计一次 recovery。
5. **自进化到底学了什么？** 从迟播损失轨迹发现收获期限问题，在“停止迟播”和“换成来得及收获的作物”两个数据候选中评测；六个场景无退步且总收益提升才启用。
6. **Memory 如何证明被使用？** 成功轨迹产生 18 步宏，后续运行会检索并逐步核对。它证明了检索路径，不证明 Memory 已提高最终回报。
7. **为什么没有直接上 LLM？** 先冻结可复现 baseline、状态/动作 schema 和评测口径，再让 LLM 只生成受约束计划候选，才能定位提升来自哪里并控制 Token 与错误动作。
8. **下一步如何对齐 JD？** 先跑真实 VLM 消融与真实截图集；再加 schema 化 LLM planner；随后实现真正搜索与 held-out 环境，最后根据轨迹规模决定是否 SFT/RL。

## 下一阶段门槛

1. **真实 VLM 证据**：真实模型、GPU、checkpoint、30–100 张真实或扰动截图；比较 screenshot-only、RPC-only、Shadow、Guard 的准确率、成功率、P50/P95、失败率和 Token。
2. **Planner 对照**：固定确定性 baseline，新增 schema 化 LLM planner；比较任务成功、无效动作、重规划成功率、延迟和 Token，不让 LLM 直接调用未校验工具。
3. **探索环境**：加入隐藏市场规律或未知作物收益，评测机制发现率、状态覆盖、重复动作和机会成本。
4. **搜索扩展**：当前 bounded UCT-MCTS 已作为第四个可运行策略；下一步冻结多起始状态与不同 rollout 预算，比较成功率、收益、节点数和延迟，并增加 held-out 机制。
5. **轨迹与训练**：先导出成功、失败、恢复和 Skill 修订 JSONL，冻结 train/dev/test，再决定 SFT、行为克隆或 RL；没有足够轨迹前不声称训练效果。

## 履历口径

可以写“实现可复现的多模态 Game Agent 研究原型，融合像素观察、文本、RPC 和轨迹；构建可执行层级计划、Skill/Memory、视觉守卫、失败候选排除、受约束 Skill 修订、UCT-MCTS 与离线评测”。

不能写“实现通用自主游戏 Agent”“完成 RL/World Model”“VLM 提升任务成功率”或“跨游戏泛化”。当前 MCTS 只在确定性农场规则和固定预算下验证。
