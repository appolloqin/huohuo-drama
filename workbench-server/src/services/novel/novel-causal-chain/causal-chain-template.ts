/** causal_chain.md 初始模板 — 只保留上一章末「当前状态 + 未闭合因果」 */

export function causalChainTemplate(chapter = 0): string {
  const head = chapter > 0
    ? `# 当前状态（第${chapter}章末）`
    : '# 当前状态（尚未开写）'
  return `${head}

## 场景
- 位置：（待第1章建立）
- 环境：
- 出口/动线：

## 时间
- 绝对：
- 相对：
- 光线/感知：

## 人物
- 主角：
- 其他关键人物：

## 进行中的动作
- 主线：
- 倒计时/目标：

## 未闭合因果（须在本章或后续交代）
- [ ] （开写后由变更记录维护）

## 环境伏笔
- （未利用的场景元素）
`
}

export const CAUSAL_CHANGE_RECORD_HEADER = '【变更记录】'

export const CAUSAL_CHAPTER_END_FORMAT = `
章末须另附【变更记录】块（紧接正文之后、单独成段；**不是故事正文**，是系统元数据，落库时会拆出存储）。

格式示例：
${CAUSAL_CHANGE_RECORD_HEADER}
- 场景: 甲 → 乙
  因果: 触发因素→过程→结果（必填，不可省略）
  触发: （可选）直接触发事件
  代价: （可选）消耗/损失
  感知: （可选）感官变化
  耗时: （可选）相对时间

- 时间: …
  因果: …

- 人物/某某: …
  因果: …

若无任何状态变化，写一行：${CAUSAL_CHANGE_RECORD_HEADER}
- （无状态变化，因果起点延续）
  因果: 本章未发生场景/时间/人物状态/伤势/物品变更
`.trim()
