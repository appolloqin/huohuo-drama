---
name: drama-image-prompt
description: 火火短剧 · 宫格/立绘/场景提示词 Agent 技能规范
---

# 火火 · 宫格与单帧提示词

本技能服务于工作台 **宫格/立绘/场景提示词** Agent（`drama_image_prompt`），通过**工具**输出三类**英文**生图 prompt：宫格母图、角色立绘、场景背景。

## 流水线位置

| 方向 | 说明 |
|------|------|
| **上游** | **分镜拆解**后的角色 / 场景 / 分镜数据 |
| **本步产出** | 英文 `prompt`（由工具返回，供生图 API 使用） |
| **下游** | 图片生成、宫格切分 |

## 核心目标

- **必须调用工具**生成 prompt，不要手写字符串代替工具返回值
- 全部输出均为英文，且与项目 `style`（艺术风格）一致
- 宫格母图严格满足 `rows × cols` 格数，禁止合并 / 缺格 / 分割线
- 场景背景类 prompt 中**不含任何人物**，避免生成路人

## 推荐工具流（按任务类型）

### 角色立绘

1. `read_characters` — 读取项目角色列表
2. `generate_character_prompt(character_id)` — **逐角色**生成英文 prompt
3. 将工具返回的 `prompt` 呈现给用户或用于生图

### 场景背景

1. `read_scenes` — 读取项目场景列表
2. `generate_scene_prompt(scene_id)` — **逐场景**生成无人物英文 prompt

### 宫格母图

1. `read_shots_for_grid(shot_ids)` — 读取选中镜头详情
2. `generate_grid_prompt` — 传入：
   - `shots`（来自上一步）
   - `rows` / `cols`（用户指定）
   - `mode`：`first_frame` | `first_last` | `multi_ref`
   - `reference_legend`（可选；用户消息含「参考图映射：图片1=…」时原样传入）
3. 使用返回的 `grid_prompt` 与 `cell_prompts`

## 输出契约

| 类型 | 工具 | 关键返回字段 |
|------|------|-------------|
| 角色立绘 | `generate_character_prompt` | `prompt`, `character_name` |
| 场景背景 | `generate_scene_prompt` | `prompt`, `location` |
| 宫格母图 | `generate_grid_prompt` | `grid_prompt`, `cell_prompts` |

通用要求：

- 全部英文
- 无水印、无文字
- 与项目 `style` 一致（如 `consistent art style: cinematic wuxia`）
- 宫格图严格保证格数

---

## 宫格图（优先阅读）

参考：`reference/shot-prompt.md`

### 三种模式

**首帧 `first_frame`** — 每格为镜头开场画面，总格数 = `rows × cols`：

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style, [style],
格1: [opening], 格2: [opening], ... 格N: [opening],
high quality, cinematic lighting, no merged panels, no missing panels, no text, no watermark
```

**首尾帧 `first_last`** — 奇偶格交替开场 / 收束，仍须满格：

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style,
格1: [opening], 格2: [closing], 格3: [opening], 格4: [closing], ...
high quality, cinematic, continuous motion implied, no merged panels, no missing panels, no text
```

**多参考 `multi_ref`** — 同场景多角度，仍须满格：

```
[rows x cols grid layout], exactly [rows*cols] visible panels, same scene different angles,
格1: wide establishing, 格2: medium focus, 格3: close-up, 格4: dramatic angle, ...
consistent lighting and color palette, no merged panels, no missing panels, no text
```

### 宫格硬约束

1. 必须写明 `rows x cols grid layout` 与 `exactly N visible panels`
2. 禁止合并格、缺格、画分割线
3. 有参考图映射时用 `图片1 / 图片2 / ...`，勿与 `格1 / 格2 / ...` 混用
4. 竖屏项目可在格描述中暗示 `vertical 9:16 framing`

---

## 角色立绘

参考：`reference/character-prompt.md`

句式骨架：

```
[appearance], [personality], [role], portrait, [expression], high quality, detailed, character concept art, [project style], no text, no watermark
```

- `expression` **必填**（如 `with a determined expression`），避免中性脸
- `[project style]` 必须来自项目 `style`（真人写实 / 动漫等），禁止混用冲突风格词

---

## 场景背景

参考：`reference/scene-prompt.md`

句式骨架：

```
[location], [time], [lighting], [scene detail], high quality, consistent art style: [project style], no people, no figures, no text, no watermark
```

---

## 输出前自检清单

- [ ] 已通过对应 **tool** 生成，非纯手写
- [ ] 全部输出均为英文
- [ ] 宫格 prompt 含 `exactly N visible panels` 且 N = `rows × cols`
- [ ] 角色立绘含 `expression`
- [ ] 场景背景至少 1 次强调无人物
- [ ] 全部 prompt 结尾含 `no text, no watermark`

## 反例（不要这样做）

| 反例 | 问题 | 改法 |
|------|------|------|
| 不调工具，直接输出 prompt 字符串 | 未走标准生成链路 | 调用 `generate_*_prompt` |
| 中文 prompt | 模型理解不稳 | 工具输出英文 |
| `3x3 grid, 6 panels` | 格数不一致 | `exactly 9 visible panels` |
| 场景背景含人物 | 生成路人 | `no people, empty scene` |
| 宫格 9 格只写 6 格描述 | 缺格 | 补足每格 |
