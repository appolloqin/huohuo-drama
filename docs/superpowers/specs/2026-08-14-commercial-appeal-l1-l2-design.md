# 商业吸引力 L1+L2 融合设计

**日期：** 2026-08-14  
**状态：** 已批准（用户确认：第 1～8 章 + 修写最多 3 轮）  
**范围：** 小说章节生成吸引力（与 continuity 21 维解耦）

## 问题

现有吸引力硬门槛只查「开篇有没有踹门/债额/骂名」。样章可过审，但中段大量重生糊糊、家底/契纸/怯弟妹重复盘点，翻身手段（修柴油机等）过晚，读感平淡。

## 目标

第 1～8 章：结构必杀用启发式；「过审仍平」用短 JSON 观感审；失败则 craft 修写，最多 3 轮（与现有 `chapter_craft_rewrite_max` 默认共用）。

## 非目标

- 不写入 / 不污染 `continuity_check` 与 21 维硬拒  
- 不为第 9 章及以后新增 L2；首版第 9+ 不扩展本设计新增的 L1 维（保留既有开篇硬门槛）  
- 不做长篇 LLM 书评或独立「好看分」排行

## 架构

```
正文 → L1 启发式（第1～8章）
         ├─ 硬失败 → opening_promise=无 / appeal 失败 → craft（不调 L2）
         └─ 通过 → L2 LLM 观感审（第1～8章）
                      ├─ 平淡 → appeal 失败 + 修点 → craft
                      └─ 通过 → 沿用既有 craft/continuity 流程
craft 修写 ≤ resolveChapterCraftRewriteMax（默认 3）
每轮重跑 L1；L1 过后再条件触发 L2
```

吸引力结果仍落在 `chapter_appeal`（经 craft hook），永不写入 continuity。

## L1 启发式（第 1～8 章）

扩展 `novel-commercial-appeal-audit.ts`（或同层纯函数模块），失败则 `listOpeningAppealHardFails` / `buildCommercialAppealAudit` 记硬失败，并令 `drama_gates.opening_promise = 无`（与现有醒炕/压力/卖点首屏同一路径触发 craft）。

| 代码（建议） | 条件（结构启发式，题材尽量中立） | 说明 |
|---|---|---|
| `opening_soft_collapse` | 开篇窗口已有外部压力后，后续仍大段苏醒/记忆灌入且缺少主角反制对白或动作 | 「有冲突但主角软瘫」 |
| `capability_sell_late` | 约前 800 字未见翻身手段/对赌/识破类信号（修/账本/手艺/揭穿等），仅有债额/骂名/夺产 | 催债流水账无爽点 |
| `repeat_inventory` | 同章内家底/骂名/契纸/怯弟妹等关键词簇重复落地 ≥2 且跨较长间隔 | 禁重复盘点 |

既有维保持：`wake_inventory_opening`、`opening_pressure_window`、`opening_sell_point`。

阈值以可单测样章为准（含用户提供的平淡第 1 章应至少命中 soft_collapse / capability_late / repeat 之一）。

## L2 LLM 观感审（第 1～8 章，条件触发）

**触发：** L1 无硬失败，且 `chapterNumber ∈ [1,8]`，且 craft 评分路径开启。

**不触发：** L1 已硬失败；第 9+ 章；craft 关闭。

**输出（短 JSON，禁止长评）：**

```json
{
  "flat": true,
  "mid_cooling": true,
  "missing_payoff": "短句：缺什么爽点",
  "fix_directive": "一句可执行修写指令"
}
```

- `flat === true`（或等价「平淡」判定）→ appeal 未通过；将 `fix_directive` / `missing_payoff` 写入 appeal dimensions / craft 修写提示  
- 建议维码：`llm_feel_flat`（level `无`）  
- 模型失败 / 无正文：不否决通过（与 craft 模型不可用策略一致：避免空转），可记 soft 提示

**调用：** 复用现有文本服务 / craft 同系调用约定；计费 reason 标明吸引力观感审。

## Craft 修写（最多 3 轮）

- 上限：`resolveChapterCraftRewriteMax(meta)`（未配置时默认 **3**）  
- L1/L2 失败与既有 `opening_promise` / drama gate 失败共用同一 rewrite 循环，**不另开计数器**  
- `buildChapterCraftFixPrompt`：优先注入 L1 失败原因与 L2 `fix_directive`（删糊糊、提前撕契/反口、前 800 字内亮能力对赌等）  
- 3 轮仍不过：沿用现有 craft 严格策略（落盘/告警/中止），不新造终止语义

## Prompt 同步（生成侧）

更新 `webnovel-prose-style.ts`、相关 beat / outline HINT（`novel-defaults` 等已有卖点首屏处）：

- 约前 200～400 字：压力方亮出卖点后，主角尽快嘴炮/撕契/拒签；禁止长段嗓子干/脑子糊/记忆锅  
- 约前 800 字：须亮翻身手段或对赌/识破  
- 同章：家底/骂名/契纸/怯怕类信息只落地一次  

## 数据流与落库

- `ChapterCraftResult.appeal` 扩展 dimensions（新 L1 码 + 可选 `llm_feel_flat`）  
- `chapter_appeal` 仍由 `novel-chapter-craft-hook` 写入 episode metadata  
- 禁止写入 `continuity_check`

## 测试

- 单元：用户平淡样章片段 → L1 至少一项硬失败；「紧凑反杀+早亮修机」对照稿 → L1 通过  
- 单元：`repeat_inventory` / `capability_sell_late` 边界  
- 脚本：`verify-commercial-hook-contract.ts` 扩展或新增 `verify-commercial-appeal-l1-l2.ts`  
- L2：对 mock JSON 投影 appeal；不强制联调真模型  

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| L1 误杀慢热 | 仅 1～8 章；阈值用样章校准；可 soft→硬分阶段（首版硬拦已定） |
| L2 贵/慢 | 仅 L1 通过后调用；短 JSON；失败不空转重试刷分 |
| 修写耗积分 | 硬顶 3 轮，与现网默认一致 |

## 验收

1. 用户所贴平淡第 1 章：L1 或 L2 判失败，craft 修写提示含「删糊糊 / 提前能力对赌」类指令  
2. 第 1～8 章 L2 仅在 L1 通过后出现日志/调用  
3. 第 9 章不跑 L2、不跑本设计新增 L1 维  
4. continuity 元数据不被 appeal 污染  
5. 未改 `chapter_craft_rewrite_max` 时修写上限仍为 3  
