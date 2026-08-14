# 朱雀式 AI 检测增强设计（一期+二期）

**日期：** 2026-08-14  
**状态：** 已批准（用户确认：一期体验 + 二期降率一并做）  
**参考：** [腾讯朱雀 AI 检测助手](https://matrix.tencent.com/ai-detect/) 公开产品逻辑（非复刻闭源模型）

## 问题

本站 AI 率检测已有全文 PPL + 统计指纹，但相对朱雀公开体验仍缺：

- 无**段落级 AIGC 分 / 高危段高亮**
- PPL 仅采**前 3k 字**，长文中后段漏检
- 写作模型与检测模型同系时易顶到 ~97%
- Humanize 常改词不改节奏，**降不了 PPL/高危段**

## 目标

在**不宣称与朱雀分数一致**的前提下，提供朱雀式报告体验，并让章节/Hub 去 AI 味更能压低 overall 与高危段。

## 非目标

- 复刻朱雀闭源权重或保证数值对齐朱雀  
- 一期/二期上线图像 AIGC（朱雀有图，另立需求）  
- 强制依赖朱雀开放 API（若无稳定公开接口则不做）

## 架构

```
正文
  → segmentTextForAiDetect（自然段合并过短段）
  → 每段：statistical 局部信号 → segment.aigc / band
  → 全文：multi-window PPL（头/中/尾）+ Top-K 高危段局部 PPL（可选）
  → fuse → overall probability + segments[] + highlights
  → humanize：优先改 high/suspected 段节奏 → 复检
```

结果扩展现有 `AiDetectionResult`，向后兼容旧字段。

## 一期：检测体验

### 分段

- 按空行自然段切分；过短段（**&lt;80 字**，与 `detectAiText` 最小有效窗口对齐）与下一段合并，避免落入统计 stub（&lt;80 → 固定 50% → 误标 suspected）  
- 单段上限约 800 字可再切句组  
- 每段记录 `char_start` / `char_end` / `paragraph_index` / `text`

### 段分（0–1 `aigc`）

- 主：该段 `detectAiText` 统计概率 /100（或段级加权信号）  
- 辅：若该段进入 Top-K 高危且跑了局部 PPL，则与统计分融合（如 `0.55*pplProb + 0.45*stat`）  
- **band**（对齐朱雀公开口径语义，非其模型）：  
  - `human`: aigc &lt; 0.5  
  - `suspected`: 0.5 ≤ aigc &lt; 0.85  
  - `ai`: aigc ≥ 0.85  

### 全文采样（替换仅前 3k）

- 窗：头 2k + 中 2k + 尾 2k（按字；短文去重合并）  
- 各窗 PPL → 概率后取 **max** 作为保守 overall 主信号（或均值，实现取 max 更贴「有一段很 AI 就抬高」）  
- 另对统计 Top-K（默认 3）高危段跑局部 PPL（段长≥80 字），失败则跳过  

### API / 类型

扩展 `AiDetectionResult`：

```ts
segments?: AiDetectSegment[]
sampling?: { windows: Array<{ label: string; char_start: number; char_end: number; perplexity?: number; probability?: number }> }
```

`AiDetectSegment`: `{ index, char_start, char_end, aigc, band, probability?, signals? }`

Hub `/ai-detect/*` 与 `POST .../detect-ai` 同口径返回。

### UI

- `/ai-detect`：圆环/总分旁增加分段列表；正文区高亮 `suspected|ai` 段  
- 章节 AI 率弹层：同步分段列表 + 高亮摘要  

## 二期：降率

### 跨系检测

- 默认优先异系 PPL 模型（沿用/强化 `prefer_cross_model_detect`、host reroute）  
- `same_family_detect=true` 时 UI 强提示；overall 可附 `ai_detect_warning`（已有则保留）  

### Humanize

- 输入 `segments` 中 `band !== human` 的摘录优先（扩展现有 excerpt 路径）  
- Prompt 硬约束：**改句段节奏/拆模板/打断均匀**，禁止同义词堆砌当主手段  
- Pass 顺序：高危段靶向 → burstiness → colloquial → 必要时 PPL perturbation  
- `shouldAcceptHumanizePass`：overall↓ 或 高危段数↓ 或 平均 aigc↓ 或 PPL↑  

### 章节自动 humanize

- 复检使用**同分段+多窗**口径，避免「统计过、UI 仍 97%」历史问题再现  

## 数据流

- Episode `ai_detection` 可存 `segments`（注意体积：可只存 band≠human 或截断 text）  
- 禁止写入 continuity  

## 测试

- 分段边界：短段合并、长文多窗去重  
- 融合：仅统计 / 统计+PPL 段  
- 多窗 max 高于单头窗（构造中后段更「AI」的样例）  
- Humanize mock：高危段优先进入 prompt  
- Verify 脚本：`verify-ai-detect-zhuque-style.ts`  

## 验收

1. 长文检测返回 `segments` 且 UI 可高亮  
2. 采样含头/中/尾（足够长时）  
3. Humanize 后高危段数或 overall 在可接受样本上下降  
4. 文档/UI 文案不声称「与朱雀分数一致」  

## 风险

| 风险 | 缓解 |
|------|------|
| 多窗+段 PPL 成本高 | Top-K=3；窗 2k；可配置关闭段 PPL |
| 分数与朱雀不一致 | 文案标明「本站启发式，非朱雀官方分」 |
| segments 撑爆 metadata | 落库只存摘要字段 |
