---
name: drama-storyboard-breakdown
description: 火火短剧 · 分镜拆解 Agent 技能规范
---

# 火火 · 短剧分镜拆解

本技能服务于**短剧工作台**「拆解分镜」步骤：将格式化剧本拆为可生成的镜头列表，并产出 `image_prompt`、`video_prompt` 等下游字段。每个镜头聚焦**单一动作**，建议时长 **10–15 秒**。

## 流水线位置

| 方向 | 说明 |
|------|------|
| **上游** | `formatted_script` + 本集 **角色/场景**（含 `scene_id`） |
| **本步产出** | 本集 **分镜列表**（`storyboards` 表，含 `shot_number` 与各 prompt 字段） |
| **下游** | 视频/图片生成、**宫格/立绘/场景提示词**（`drama_image_prompt`） |

## 核心目标

- 一场戏拆成多个单一动作镜头，避免单镜承载多个转折
- 每个镜头的视频提示词按 **3 秒分段** 写成机械可解析的形式
- 镜头之间保持时间、地点、因果的连贯性
- 适配**竖屏 9:16**：主体居中、中近景优先，减少依赖超宽画幅的调度

## 竖屏与单集节奏

- 单集 1–3 分钟常见：**约 4–12 镜**，每镜 10–15 秒
- 景别优先中景 / 近景 / 特写；全景仅用于必要建立镜头
- 单镜一个核心动作 + 一句关键对白为宜，长对白拆镜

## 输出契约

每个镜头是一条分镜行，调用 `save_storyboards` 时**必须**包含：

| 字段 | 说明 |
|------|------|
| `shot_number` | **必填**，从 1 起连续编号（本集内不跳号） |
| `title` | 3–8 字镜头主题 |
| `description` | 镜头概述，供前端阅读与编辑 |
| `time` / `location` | 时分 + 光线；场所与空间细节 |
| `shot_type` / `angle` / `movement` | 景别、角度、运镜 |
| `action` / `dialogue` / `result` | 动作、台词、画面结果 |
| `atmosphere` | 光线、色调、声场氛围 |
| `duration` | 秒数，通常 10–15 |
| `image_prompt` | 静帧 / 首尾帧生图提示（英文为佳） |
| `video_prompt` | **必填**，按 3 秒分段 |
| `bgm_prompt` / `sound_effect` | 配乐与关键音效；不需要时置空字符串 `""` |
| `scene_id` | 能匹配已有场景时**必须**填写 |
| `character_ids` | 本镜涉及角色 ID 列表；**无人物空镜可传 `[]`** |

## video_prompt 分段模板

```
0-3秒：<location>便利店</location>，近景，<role>苏野</role>盯着收银屏，眉头紧锁。
<n>3-6秒：<location>便利店</location>，全景，自动门滑开，<role>宋知意</role>撑伞走入。
<n>6-9秒：<location>便利店</location>，中景，两人隔收银台对视，雨声渐大。
```

标签语义：

- `location` 场景
- `role` 角色
- `voice` 画外音
- `n` 时间段分隔符（必须以 `<n>` 起头）

## 视频模型适配

用户消息常含「视频模型：xxx (provider)」。按模型特性调整 `duration` 与分段密度：

| 类型 / 示例 | 建议 |
|-------------|------|
| Seedance / Hailuo / 通用 5–15s | 单镜 `duration` 10–15，`video_prompt` 约每 3 秒一段 |
| 偏短时长模型（≤5s） | 拆成更多短镜，每镜 5–8 秒，分段改为 2–3 秒一段 |
| 偏长时长模型（≥15s） | 仍建议 10–15 秒/镜保节奏；必要时单镜上限不超过模型标注 |

原则：**宁可多镜也不单镜超时**；分段数 ≈ `ceil(duration / 3)`。

## 推荐工具流

1. `read_storyboard_context` — 剧本、角色、场景、已有分镜摘要
2. 按叙事顺序拆镜，从 `shot_number: 1` 递增
3. 逐镜补全字段表的全部字段
4. `save_storyboards` — 批量写入（默认覆盖整集）
5. 局部修改用 `update_storyboard`

## 场景与角色绑定

- 以 `read_storyboard_context` 返回的 `scenes` 为准；`location + time` 可唯一定位时**必须**填 `scene_id`
- 禁止引用不存在的场景 ID
- `character_ids` 只包含本镜出镜或发声的角色；空镜传 `[]`

## 配乐与音效字段语义

- `bgm_prompt`：本镜需要的背景音乐氛围描述。无配乐需求时置 `""`
- `sound_effect`：关键音效，半角逗号分隔时序
- 同集内 `bgm_prompt` 同一氛围段保持一致风格

## 镜头字段填充示例（参考）

```
shot_number: 1
title: "便利店偶遇"
description: "雨夜便利店，苏野与宋知意隔台相遇"
time: "凌晨 0:20"
location: "24 小时便利店收银台前"
shot_type: "近景 → 中景"
angle: "平视"
movement: "固定机位后切"
action: "苏野盯着屏幕；门开后宋知意撑伞走入"
dialogue: "宋知意：你还没走？\n苏野：末班公交没了。"
result: "两人隔台对视，雨水从伞尖滴落"
atmosphere: "冷白荧光，玻璃门外雨幕反光"
duration: 12
image_prompt: "Close-up of a tired young man at a convenience store counter, neon glow outside, rainy night, vertical 9:16 framing"
video_prompt: |
  0-3秒：<location>便利店</location>，近景，<role>苏野</role>盯收银屏，眉头微皱。
  <n>3-6秒：<location>便利店</location>，全景，自动门滑开，<role>宋知意</role>撑伞走入，甩伞水珠。
  <n>6-9秒：<location>便利店</location>，中景，两人隔台对视，<voice>宋知意</voice>「你还没走？」
  <n>9-12秒：<location>便利店</location>，近景，<role>苏野</role>苦笑回话，雨水从伞尖滴落。
bgm_prompt: "低频电子底噪 + 雨声氛围"
sound_effect: "自动门开门声, 雨伞收拢, 硬币落桌"
scene_id: 17
character_ids: [201, 204]
```

## 输出前自检清单

- [ ] 每条分镜都有连续 `shot_number`（1, 2, 3…）
- [ ] 每个镜头都填满了字段表的全部字段（不需要配乐 / 音效也要写 `""`）
- [ ] `video_prompt` 每段时长约 3 秒，分段数 ≈ `ceil(duration / 3)`
- [ ] 每个镜头的 `duration` 落在模型允许范围，竖屏节奏优先 10–15 秒
- [ ] `scene_id` 在 context 的 `scenes` 中可查
- [ ] `character_ids` 来自 context 的 `characters`；空镜为 `[]`
- [ ] 相邻镜头 `location + time` 跳跃需有剧本依据
- [ ] 单镜只承载一个核心动作

## 反例（不要这样做）

| 反例 | 问题 | 改法 |
|------|------|------|
| 缺少 `shot_number` 或跳号 | 工具必填且需连续 | 从 1 递增，不跳号 |
| `duration: 30` 且 `video_prompt` 只写了 3 段 | 时长与分段不匹配 | 拆成两个 15 秒镜头 |
| `scene_id: 99` 但 context 中只有 5 个场景 | 引用不存在 | 删除或改为可定位的 location+time |
| 一镜内「打电话 → 挂电话 → 出门」 | 单镜多转折 | 拆成 3 个镜头 |
| 空镜却硬填无关 `character_ids` | 绑定错误 | 空镜传 `[]` |
| 完全省略 `bgm_prompt` | 与契约不符 | 不需要时填 `""` |
