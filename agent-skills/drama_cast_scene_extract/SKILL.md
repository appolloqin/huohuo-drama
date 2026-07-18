---
name: drama-cast-scene-extract
description: 火火短剧 · 角色场景提取 Agent 技能规范
---

# 火火 · 短剧角色与场景提取

本技能服务于**短剧工作台**「提取角色场景」步骤：从已格式化的剧本中提取本集出场的角色与场景，去重后写入数据库，供后续分镜与生图复用。

## 流水线位置

| 方向 | 说明 |
|------|------|
| **上游** | **剧本格式化**（`drama_script_formatter`）产出的 `formatted_script` |
| **本步产出** | 本集 **角色**、**衍生形态**、**道具** 与 **场景** |
| **下游** | **音色分配** → **分镜拆解** |

## 推荐工具流

1. `read_formatted_script` — 读取本集格式化剧本
2. `read_existing_characters` — 项目 cast 与本集已关联角色
3. `read_existing_character_forms` — 已有衍生形态（变身/换装等）
4. `read_existing_props` — 已有道具
5. `read_existing_scenes` — 项目 locations 与本集已关联场景
6. 分析剧本，决定本集出场清单
7. `save_dedup_characters` — upsert cast 并关联本集
8. `save_dedup_character_forms` — upsert 衍生形态（须已有基础角色）
9. `save_dedup_props` — upsert 道具（可选关联角色/形态）
10. `save_dedup_scenes` — upsert location 并关联本集

## 角色卡片字段

每条角色记录应包含：

| 字段 | 含义 |
|------|------|
| `name` | 剧本中使用的完整称呼（人、动物、命名生物保留剧本写法，如「墨七」一律写「墨七」） |
| `role` | 主角 lead / 配角 supporting / 群演 extra（需要立绘的宠物 / 反复出镜的动物视作 supporting） |
| `appearance` | 人物：性别、年龄、体型、面容、发型、服装；动物：品种、毛色、体型、特征、配饰（约 200–500 中文字，足以支撑稳定出图）。**必须遵循 `read_formatted_script` 返回的 `visual_style_brief`**：真人写实项目用真实皮肤/服装材质描述，禁止二次元；动漫项目用赛璐璐/漫画感描述，禁止照片级真人 |
| `personality` | 核心性格；动物可用行为标签（胆怯、黏人、机警） |
| `description` | 背景、人物关系 |

### 命名动物 / 非人类角色

- 拥有**固定名字或反复出现称呼**的动物（如「墨七」「煤球」），多次出场、有情感节拍、影响剧情时，必须通过 `save_dedup_characters` **单独建行**
- 不要把命名动物折叠到外形相近的人类身上，除非剧本明确指出二者是同一实体
- 无名字、无个体特征的群居动物可以跳过
- 道具（prop）指无生命的物体；需要形象一致的动物一律走 cast 流程

## 衍生形态（Character Form）字段

当剧本出现同一角色的**变身、觉醒、换装、战甲等不同外观**时，使用 `save_dedup_character_forms`：

| 字段 | 含义 |
|------|------|
| `character_name` | 基础角色名（须已通过 save_dedup_characters 存在） |
| `name` | 形态名，如「觉醒态」「便装」「战甲形态」 |
| `appearance` | 该形态的外观描述（200+ 字） |
| `description` | 何时出现、剧情意义 |
| `prompt` | 可选，英文出图提示 |

同一 `character_name + name` 不重复创建。

## 道具（Prop）字段

武器、法器、关键陈设等使用 `save_dedup_props`：

| 字段 | 含义 |
|------|------|
| `name` | 道具名 |
| `type` | weapon / daily / decor / vehicle 等 |
| `description` | 外观与用途 |
| `prompt` | 英文物品特写 prompt |
| `character_name` | 可选，专属角色 |
| `character_form_name` | 可选，专属形态（须与 character_name 一致） |

通用道具（场景陈设）可不填 character_name。

## 场景卡片字段

每条场景记录应包含：

| 字段 | 含义 |
|------|------|
| `location` | 具体地点名 |
| `time` | 时段与光线 |
| `atmosphere` | 情绪与环境氛围 |
| `prompt` | 面向图片模型的英文背景 prompt（仅环境，无人物）。画风须与项目 `drama_style` 一致，禁止真人/动漫混用 |

## 道具（Prop）说明 — 仅文档参考

~~当剧本中提到手持或场景陈设物件时，可在分析笔记中记录~~

已支持 `save_dedup_props` 写入道具表。有生命或被命名的生物仍走 cast 流程。

## 提取边界

- 仅扫描**当前这一集**；不要无差别地遍历整个项目
- 项目中已存在但本集尚未关联的角色 / 场景，优先复用其 ID
- 同一角色名、同一 `location + time` 组合绝不创建第二张卡片

## 输出前自检清单

- [ ] 本集出现的变身/换装已写入 character_forms（如有）
- [ ] 本集关键道具已写入 props（如有）
- [ ] 角色清单中没有任何「本集未出场」的项
- [ ] 命名动物（墨七 / 煤球等）没有被遗漏到 cast 之外
- [ ] 同一角色名未出现在两张 cast 卡片中
- [ ] 同一 `location + time` 组合未出现两次
- [ ] 每条 `appearance` 字数 ≥ 200，能支撑稳定出图
- [ ] `prompt` 是英文且不包含人物描写（避免生成路人）

## 反例（不要这样做）

| 反例 | 问题 | 改法 |
|------|------|------|
| 把第 1 集配角「邱姐」带到第 3 集一并创建 | 跨集提取，污染 cast | 仅保留第 3 集剧本中实际出场的角色 |
| 「苏野」「苏哥」「小野」各建一行 | 同一实体拆成多行 | 统一为剧本主称呼「苏野」一行 |
| 匿名「几个学生」各建一行 | 群演不需要独立 cast | 不创建；若必须出镜，合并为一行「群演学生」 |
| `prompt: A man walks in` | 含人物 + 非英文 | 改英文且不写人：`A narrow alley at dusk, neon signs flickering, no people` |
| 把「墨七」塞进「苏野」描述里 | 命名动物折叠 | 单独建 `墨七` cast 行，写明动物外形 |
| 尝试调用 prop 写入工具 | 工具不存在 | 使用 save_dedup_props |
