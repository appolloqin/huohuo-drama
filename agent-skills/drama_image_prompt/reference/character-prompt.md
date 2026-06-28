---
name: drama-image-prompt-character
description: 火火短剧 · 角色立绘英文 prompt 参考
---

# 火火短剧 · 角色立绘提示词参考

> 供 `drama_image_prompt` Agent 输出**英文**角色立绘 prompt；字段语义与数据库 `appearance` / `personality` / `role` 对齐。

## 英文句式骨架

```
A [gender] [age] character, [name], [body type], [facial features].
[Hair description]. [Clothing details].
[Pose and expression]. [Background: simple/gradient].
Style: [art style], high quality, detailed, character concept art.
```

## 填写要点

- `appearance` 为视觉核心：发型、服装、体态、标志性配饰要写具体
- `personality` 决定姿态与表情（confident / shy / cold / playful）
- `role` 决定服装材质与道具（student uniform / business suit / martial arts robe）
- `expression` **必填**，避免模型默认中性脸
- 结尾固定：`high quality, detailed, character concept art, no text, no watermark`

## 示例（都市女主）

```
A young woman in her early twenties, slim build, shoulder-length black hair with soft waves.
Wearing a cream knit sweater and high-waist jeans, minimal jewelry.
Standing with a gentle smile, warm eye contact, relaxed posture against a soft gradient background.
Style: cinematic realism, high quality, detailed, character concept art, no text, no watermark.
Expression: hopeful and determined.
```