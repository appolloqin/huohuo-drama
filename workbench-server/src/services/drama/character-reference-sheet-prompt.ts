/**
 * 工业级角色 / 衍生形态参考图提示词：LLM 二次提炼 + 固定布局骨架。
 */
import {
  applyDramaStyleToPrompt,
  formatDramaStyleBriefForAgent,
  normalizeDramaStyle,
  resolveDramaStylePromptDirectives,
} from '../../common/drama/drama-style.js'
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'

export type CharacterReferenceSheetInput = {
  name: string
  role?: string | null
  appearance?: string | null
  description?: string | null
  personality?: string | null
  dramaStyle?: string | null
  /** 衍生形态名；有值时按形态参考图处理 */
  formName?: string | null
  baseCharacterName?: string | null
  baseAppearance?: string | null
}

const REFERENCE_SHEET_LAYOUT = `Industrial character reference sheet — image only, no text reply.

ONE image, single canvas (NOT a 2×2 or 4×4 grid, NOT four equal quadrants). Layout:

Top: thin light-gray technical TITLE BAR; title text must be legible (use the character name / title given in the user prompt body).
Main area FIXED SPLIT: LEFT ~1/3 COLUMN = FACE HERO CLOSE-UP (tall vertical hero face; maximize face scale, reduce empty margin).
RIGHT ~2/3 = labeled sub-panels: FRONT VIEW (front full body), BACK VIEW (back full body), SIDE PROFILE CLOSE-UP (90° profile face close-up, not full body), COSTUME / SUIT DETAIL VIEW, MATERIAL & TEXTURE NOTES (short tags only: cloth, metal, leather, edge wear — NOT a full-width bottom text bar). Optional SIGNATURE PROP / EQUIPMENT DETAIL if the user prompt mentions that prop.
NO left-profile full-body panel. FRONT and BACK: same character, same outfit, same proportions, same lighting and scale; neutral standing, head-to-toe, arms at sides, no action pose. SIDE PROFILE CLOSE-UP complements FACE HERO (same identity/age/makeup; profile view, not duplicate front face).
Costume/material only in right-side panels. No color-swatch strip. Fine light-gray dividers. Cinematic industrial reference sheet, 4K detail density — not a poster, not a comic grid, not a photo collage.
Solid white only (RGB 255,255,255). No watermark logos. Panel titles and material tags printed ON the reference sheet are required. No environment/ground beyond minimal foot contact if needed. Follow ART STYLE / 画风 / MANDATORY ART STYLE at the start of the user message if present.`

const REFINE_SYSTEM = `你是短剧工业角色参考图提示词工程师。根据角色卡片字段，输出**一整段可直接用于文生图**的英文为主、关键中文标注可保留的参考图提示词。

硬性要求：
1. 必须以【画风·最高优先级】双语画风块开头（用户消息会给出项目画风约束，必须遵守，禁止真人与动漫混用）。
2. 紧接着输出固定布局契约（Industrial character reference sheet…），与用户消息中的布局说明一致，不可删减关键约束。
3. 然后按下列分区填写（标题可用中英）：
   【基础设定】【标题栏】【FACE HERO CLOSE-UP｜左竖栏】【FRONT VIEW｜右区-正面全身】【BACK VIEW｜右区-背面全身】【SIDE PROFILE CLOSE-UP｜右区】【COSTUME / SUIT DETAIL VIEW｜右区】【MATERIAL & TEXTURE NOTES｜右区小标签】
4. 可选：文末附 visual anchors JSON（face_shape / facial_features / unique_marks / color_anchors / skin_texture / hair_style）。
5. 只写可视觉化细节；原文未写的发型/瞳色等标 unspecified 或省略，禁止编造剧情级设定。
6. 服装时代/材质必须与 appearance 一致；画风是渲染气质，不改变角色时代服装。
7. 若为衍生形态：保持与基础角色同一身份（脸型/年龄/关键特征），只描述该形态外观差异。
8. 禁止输出思考过程、XML 标签、开场套话；直接输出最终提示词正文。
9. 结尾重申性别与画风一致性（GENDER + Reiterate art style）。`

function buildArtStyleBlock(dramaStyle?: string | null): string {
  const directives = resolveDramaStylePromptDirectives(dramaStyle)
  const canonical = normalizeDramaStyle(dramaStyle) || 'realistic'
  if (!directives) {
    return [
      '【画风·最高优先级】统一：干净偏写实三维/影像质感，高细节，禁止水印文字环境杂讯',
      'MANDATORY ART STYLE: clean semi-realistic render, high detail, consistent art style, no watermark text.',
    ].join('\n')
  }
  return [
    `【画风·最高优先级】四格/全板统一：${directives.positiveZh}（canonical: ${canonical}）。${directives.avoidZh}`,
    `MANDATORY ART STYLE (entire sheet): ${directives.positiveEn}. ${directives.avoidEn}`,
  ].join('\n')
}

function buildPortraitFallback(input: CharacterReferenceSheetInput): string {
  const title = input.formName
    ? `${input.baseCharacterName || input.name}·${input.formName}`
    : input.name
  const look = input.appearance || input.description || '人物立绘'
  return applyDramaStyleToPrompt(
    `${title}, ${look}, 高质量, 正面, 白色背景`,
    input.dramaStyle,
    'zh',
  )
}

function sanitizeRefinedPrompt(raw: string): string {
  let text = String(raw || '').trim()
  text = text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```\w*\n?/, '').replace(/```$/, ''))
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/redacted_thinking/gi, '')
    .trim()
  if (!text || text.length < 120) {
    throw new Error('参考图提示词提炼结果过短，请重试')
  }
  return text
}

/** LLM 二次提炼工业参考图提示词；失败抛错（不静默回退立绘）。 */
export async function refineCharacterReferenceSheetPrompt(
  input: CharacterReferenceSheetInput,
  billing?: TextBillingContext,
): Promise<string> {
  const title = input.formName
    ? `${input.baseCharacterName || input.name}·${input.formName}`
    : input.name
  const artBlock = buildArtStyleBlock(input.dramaStyle)
  const user = [
    artBlock,
    '',
    REFERENCE_SHEET_LAYOUT,
    '',
    formatDramaStyleBriefForAgent(input.dramaStyle),
    '',
    `【标题栏文字】${title}`,
    input.formName ? `【类型】衍生形态（基础角色：${input.baseCharacterName || input.name}）` : '【类型】基础角色',
    input.role ? `【身份】${input.role}` : '',
    input.personality ? `【性格气质】${input.personality}` : '',
    `【外貌描述】\n${input.appearance || '（未填写，请仅用简介中可视觉化信息，缺失标 unspecified）'}`,
    input.baseAppearance && input.formName
      ? `【基础角色外貌锚点】\n${input.baseAppearance}`
      : '',
    `【角色简介/关系】\n${input.description || '（无）'}`,
    '',
    '请输出完整参考图提示词（含画风块 + 布局契约 + 各分区）。',
  ].filter(Boolean).join('\n')

  const refined = await chatCompletionText(
    [
      { role: 'system', content: REFINE_SYSTEM },
      { role: 'user', content: user },
    ],
    {
      maxTokens: 4096,
      temperature: 0.45,
      billing,
    },
  )

  const cleaned = sanitizeRefinedPrompt(refined)
  // 确保画风块仍在最前（模型偶发省略时补回）
  if (!/画风|MANDATORY ART STYLE/i.test(cleaned.slice(0, 200))) {
    return `${artBlock}\n\n${REFERENCE_SHEET_LAYOUT}\n\n${cleaned}`
  }
  return cleaned
}

export function buildSimpleCharacterPortraitPrompt(input: CharacterReferenceSheetInput): string {
  return buildPortraitFallback(input)
}

export const CHARACTER_REFERENCE_SHEET_DEFAULT_ASPECT = '16:9'
