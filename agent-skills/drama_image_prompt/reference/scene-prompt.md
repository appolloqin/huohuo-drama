---
name: drama-image-prompt-scene
description: 火火短剧 · 场景背景英文 prompt 参考
---

# 火火短剧 · 场景背景提示词参考

> 供 `drama_image_prompt` Agent 生成**无人物**场景图 prompt；强调地点、时段、氛围光，禁止出现人物。

## 英文句式骨架

```
A cinematic [style] pure background scene depicting [location] at [time].
The scene shows [environment details, architecture, objects, lighting].
No characters, no people, no figures.
Style: [art style], rich details, high quality, atmospheric lighting.
Mood: [mood description].
```

## 填写要点

- `location` + `time` 决定主光色温（黄昏暖色、深夜冷色）
- 用具体物件锚定空间（招牌、栏杆、雾气、雨痕）
- 重复强调 **No characters** 避免模型画出路人
- `Mood` 用 2–4 个形容词收束氛围

## 示例（赛博室内）

```
A cinematic cyberpunk pure background scene depicting a cramped hacker den at night.
The scene shows stacked monitors with green code glow, tangled cables, empty energy drink cans,
frosted window with distant city skyline bokeh. No characters, no people, no figures.
Style: blade-runner inspired, rich details, high quality, volumetric haze lighting.
Mood: tense, claustrophobic, electric.
```
