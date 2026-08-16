# 商业吸引力 L1+L2 融合设计

**日期：** 2026-08-14  
**状态：** 草案修订（用户已确认范围：第 1～8 章 + 修写最多 3 轮；本版补齐评审必改项）  
**范围：** 小说章节生成吸引力（与 continuity 21 维解耦）

## 问题

现有吸引力硬门槛只查「开篇有没有踹门/债额/骂名」。样章可过审，但中段大量重生糊糊、家底/契纸/怯弟妹重复盘点，翻身手段（修柴油机等）过晚，读感平淡。

## 目标

第 1～8 章：结构必杀用启发式；「过审仍平」用短 JSON 观感审；失败则 **必须** 使 `craft.passed === false` 并进入既有 craft 修写循环，最多 3 轮（与 `chapter_craft_rewrite_max` 默认共用）。

## 非目标

- 不写入 / 不污染 `continuity_check` 与 21 维硬拒  
- 第 9 章及以后：不跑 L2、不跑本设计 **新增** L1 三维（既有醒炕/压力/卖点首屏门槛章数不变）  
- 不做长篇 LLM 书评或独立「好看分」排行  
- 续写路径（`continue`）：首版 **不跑 L2**；L1 新三维仅在整章 `checkNovelChapterCraft` 全章正文上评估（与现网 opening 启发式一致）。`buildChapterCraftContinueFixPrompt` 不强制注入 L2（无 L2 结果时可忽略）

## 架构

```
正文 → L1 启发式
         ├─ 硬失败 → 写 opening_promise=无 → craft.passed=false → craft 修写（不调 L2）
         └─ 通过且 chapter∈[1,8] → L2 LLM 观感审
                      ├─ flat=true → 写 opening_promise=无 + llm_feel_flat → craft.passed=false → craft
                      └─ flat=false → 不因 L2 否决
craft 修写 ≤ resolveChapterCraftRewriteMax（默认 3）
每轮重跑 L1；L1 过后再条件触发 L2
```

### 触发 craft 的硬约定（评审必改项）

现网 hook 仅在 `!craft.passed` 时重写；`passed` 看 score / drama_gates / compliance，**不看** `appeal.passed`。

因此 **L1 新三维失败与 L2 `flat===true` 均必须**：

1. 设置 `drama_gates.opening_promise = { level: '无', note: <原因> }`（可与已有 note 合并）  
2. 重算 `drama_gate_passed` / `passed`，使 `craft.passed === false`  
3. 同步写入 `appeal` dimensions（`passed: false`）供 UI / `chapter_appeal`  

禁止只写 `appeal.passed=false` 或 soft_alerts 而不改 `opening_promise`——否则不会进入修写。

`craftModelFailed`（质量审模型无正文）时：与现网一致，**跳过** 本设计 L1→`opening_promise` 硬拦与 L2 调用，避免空转。

## 章数范围

| 规则 | 章数 |
|---|---|
| 既有 `wake_inventory_opening` | 1～3（不变） |
| 既有 `opening_pressure_window` / `opening_sell_point` | 1～5（不变） |
| **新增** L1：`opening_soft_collapse` / `capability_sell_late` / `repeat_inventory` / `emotion_beats_*` / `post_climax_decompress` | **1～8** |
| **叠加** 节奏/同构/新意（见 `2026-08-14-commercial-appeal-rhythm-novelty-design.md`） | **1～8**；emotion 仅管有无与粗顺序；间距/同构/大纲偏转入 `listOpeningAppealHardFails` |
| L2 观感审 | **1～8**，且仅 L1（含既有+新增）全无硬失败时 |

第 6～8 章：只跑新增 L1 + L2；不把既有 1～5 门槛扩展到 6～8。若第 6～8 章开篇无外部压力，`opening_soft_collapse` 不触发（见下），仍可因 `capability_sell_late` / `repeat_inventory` / 情绪四拍 / L2 失败。

### 大纲映射（题材无关，须同步改大纲）

| 拍 | 大纲字段 | 正文要求 |
|---|---|---|
| 恨 | 【本章起因】+【阻碍】 | 欺压/羞辱先可见 |
| 爽 | 【人物选择】/【局面变化】 | 一次硬刚打脸，勿复读 |
| 急 | 【章末问题】 | 具体期限/对赌未决 |
| 盼 | 【信息增量】 | 本事短动作结论 |
| — | 章尾 | 停急/盼钩；禁高潮后温情泄压 |

## L1 启发式 — 可测阈值

字窗均用 `appealOpeningHead` 同款：去空白后按字计。

### `opening_soft_collapse`（1～8）

前置：`hasOpeningExternalPressure(前 400 字) === true`。若无外部压力 → **不判本维**。

在前 **400～900** 字窗口（去空白下标）内：

- `collapseHits`：命中 ≥2 条  
  - `/脑子.{0,4}糊|记忆.{0,6}涌|一睁眼|太阳穴.{0,4}跳|嗓子干|灌了铅|乱七八糟/`  
  - `/原主|穿越|重生|怎么一睁眼/`  
- `counterHits`：主角反制信号 ≥1  
  - `/撕|拒签|不签|滚|拿来|账本|我自己还|嗤笑|对赌|三天|修好/`  
  - 或主角对白后紧跟施压方反应的短冲突（实现可用：主角开口 + `/撕|拍|拒|还债|修/`）

**失败：** `collapseHits >= 2 && counterHits === 0`。

### `capability_sell_late`（1～8）

前置：前 500 字已有卖点冲突物 `hasOpeningSellStake`（债/夺产/骂名等）。若无 → **不判本维**（避免无催债章误杀）。

前 **800** 字须出现能力/对赌/识破信号 ≥1：

- `/修(?:好|柴油|机器|农具)|柴油机|手艺|账本|识破|对赌|三天内|工分归我|揭穿|算盘|图纸|焊接|电路/`

**失败：** 前 800 字上述信号为 0。

> 首版词表偏农文/重生翻身；后续可配置泛化。允许用梗概关键词追加（实现可选，非必须）。

### `repeat_inventory`（1～8）

定义四簇，每簇在全章去空白正文中找匹配区间（首次与末次下标）：

| 簇 | 示例模式（实现可 OR） |
|---|---|
| 契纸 | `/让房契|欠条|那张纸|按手印/` |
| 骂名 | `/懒汉|二流子|打老婆|烂泥/` |
| 怯弟妹 | `/怯怯|像看一头|挤在炕|三个孩子/` |
| 家底瘫瞎 | `/爹瘫|娘瞎|工分债|正屋三间/` |

**失败：** 任一簇出现次数 ≥2，且末次下标 − 首次下标 ≥ **400** 字。

### 既有维

保持现有实现与章数；`listOpeningAppealHardFails` 合并既有 + 新三维（新三维仅 `chapterNumber <= 8`）。

样章验收：用户平淡第 1 章应至少命中新三维之一（预期常中 soft_collapse 与/或 capability_sell_late 与/或 repeat_inventory）。

## L2 LLM 观感审（第 1～8 章）

**触发：** 非 `craftModelFailed`；L1（既有+新增）无硬失败；`chapterNumber ∈ [1,8]`；craft 评分开启。

**输出（短 JSON）：**

```json
{
  "flat": true,
  "mid_cooling": true,
  "missing_payoff": "短句",
  "fix_directive": "一句可执行修写指令"
}
```

**否决规则（消歧）：** 仅当 **`flat === true`** 时否决并触发修写。  
`mid_cooling` / `missing_payoff` 只写入 note / soft 辅助，**单独不足以** 置 `opening_promise=无`。

否决时：

- `drama_gates.opening_promise = { level: '无', note: fix_directive || missing_payoff || '观感审：开篇/中段平淡' }`  
- appeal dimension `llm_feel_flat` level `无`，附带 `fix_directive`  
- `craft.passed === false`

模型失败 / 解析失败：不否决（可 soft），不重试刷分。

**调用：** 文本服务；billing reason 含「吸引力观感审」。

## Craft 修写（最多 3 轮）

- 上限：`resolveChapterCraftRewriteMax(meta)`（默认 **3**），与 drama gate 共用，不另开计数器  
- `buildChapterCraftFixPrompt`：**必须** 注入  
  - 新 L1 失败 message  
  - L2 `fix_directive`（若有）  
  - 优先级仍：opening_promise → hook_on_page → 其余  
- 整章重生路径走上述 fix prompt；续写路径首版不跑 L2（见非目标）  
- 3 轮仍不过：沿用现有 craft 严格策略

## Prompt 同步（生成侧）

`webnovel-prose-style.ts`、beat / outline HINT：

- 前 200～400 字：压力后尽快反制（撕契/拒签/嘴炮）  
- 前 800 字：亮翻身手段或对赌/识破  
- 同章：契纸/骂名/怯怕/家底瘫瞎类信息每簇只落地一次  

## 数据流与落库

- `appeal` dimensions 扩展新码 + `llm_feel_flat`  
- 仅 `chapter_appeal` / `chapter_craft`；禁止写入 `continuity_check`

## 测试 / 验收

| # | 断言 |
|---|---|
| 1 | 平淡样章 → L1 ≥1 硬失败；对照紧凑稿 → 新三维全过 |
| 2 | mock `flat:true` → `opening_promise=无` 且 `craft.passed===false`（可单测投影函数） |
| 3 | L1 硬失败路径不调用 L2（mock spy / 分支单测） |
| 4 | chapterNumber=9 → 新三维与 L2 均不触发 |
| 5 | 修写提示含 L1 note 或 L2 `fix_directive` |
| 6 | `chapter_craft_rewrite_max` 未设时上限为 3 |
| 7 | appeal 结果不写入 continuity 字段 |

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| L1 误杀 | 可测阈值 + 样章校准；仅 1～8 章 |
| 能力词表偏农文 | 文档已声明；可后续配置化 |
| L2 贵/慢 | 仅 L1 通过后；短 JSON；失败不刷重试 |
| 修写耗积分 | 硬顶 3 轮 |
