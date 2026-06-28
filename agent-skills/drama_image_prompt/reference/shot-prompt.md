---
name: drama-image-prompt-grid
description: 火火短剧 · 宫格/镜头帧英文 prompt 参考
---

# 火火短剧 · 宫格/镜头帧提示词参考

> 工作台宫格母图与单帧画面共用；**格数必须与用户指定的 `rows×cols` 完全一致**，禁止合并或缺格。

## 英文句式骨架

```
[Shot type] shot, [camera angle], [art style].
[Character(s) description and action].
[Environment and setting].
[Lighting and atmosphere].
Style: cinematic, high quality, [additional style tags].
```

## 填写要点

| 区块 | 说明 |
|------|------|
| Shot type | wide / medium / close-up / over-shoulder 等 |
| angle | eye-level / low angle / high angle / dutch angle |
| action | 用现在进行时描述主体动作与情绪 |
| lighting | 光源方向、色温、对比度 |
| style tags | 与项目 `style` 一致，如 film grain、anime cel shading |

## 示例（都市夜景）

```
Wide establishing shot, eye-level, neo-noir cinematic style.
A woman in a red trench coat walks alone under neon shop signs,
umbrella catching rain streaks, reflection on wet asphalt.
Rainy downtown alley with steam from a ramen stall, blurred pedestrians far background.
Cool blue ambient with warm magenta neon rim light, shallow depth of field.
Style: cinematic, high quality, moody contrast, subtle film grain.
```

## 宫格母图附加约束

- 在母图 prompt 中重复 `exactly [rows*cols] visible panels`
- 每格用 `格1:` `格2:` … 列出，与 `rows×cols` 顺序一致
- 禁止描述分割线、边框、水印或画面内文字
