/**
 * 一致性确定性局部修正 — 仅处理硬审/规则审可安全自动改的部分
 * 人名/跨章剧情由模型审发现后，仅在 conflict 文案含明确对错人名时尝试替换
 */
import { mapTextPreservingLineBreaks } from '../../common/novel/novel-paragraph-format.js'
import {
  fixRealmRegressionInContent,
  parseRealmFixFromConflict,
} from '../../common/novel/novel-realm-utils.js'

const RECALL_CUE = /回忆|想起|闪回|浮现|历历在目|如在|回荡|记忆|眼前|崖顶|坠崖|被推|推下|推落|踹下|坠入/

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?…])/).map(s => s.trim()).filter(Boolean)
}

/** 从模型审 conflict 解析应修正的人名对（须含明确「A…B」对比，不做滑窗猜测） */
export function parsePerpetratorNameSwap(conflict: string): { correct: string, wrong: string } | null {
  const patterns = [
    /施动者为「([^」]+)」，本章写为「([^」]+)」/,
    /应为「([^」]+)」，(?:本章|正文)(?:写|却写)为「([^」]+)」/,
    /上章[^「]*「([^」]+)」[^「]*本章[^「]*「([^」]+)」/,
    /相关者为「([^」]+)」.*?突出「([^」]+)」/,
  ]
  for (const re of patterns) {
    const m = conflict.match(re)
    if (m?.[1] && m[2] && m[1] !== m[2]) {
      return { correct: m[1], wrong: m[2] }
    }
  }
  return null
}

function fixBlockPreservingPunctuation(block: string, wrong: string, correct: string): string {
  if (!block.includes(wrong)) return block

  return block.split(/(?<=[。！？!?…])/).map((part) => {
    if (!part.includes(wrong)) return part
    if (!RECALL_CUE.test(part) && !/(被推|推下|推落|踹下|坠入|坠崖)/.test(part)) return part

    let s = part
    s = s.replace(
      new RegExp(`${wrong}(那|的|之)?(狰狞|笑声|冷|狞|喝|声|手|一推|推|踹)`, 'g'),
      `${correct}$1$2`,
    )
    if (/(被推|推下|推落|踹下|坠入|坠崖)/.test(s) && s.includes(wrong)) {
      s = s.replace(new RegExp(wrong, 'g'), correct)
    }
    return s
  }).join('')
}

function fixPerpetratorNameInText(text: string, wrong: string, correct: string): string {
  if (!wrong || wrong === correct || !text.includes(wrong)) return text
  return mapTextPreservingLineBreaks(text, block => fixBlockPreservingPunctuation(block, wrong, correct))
}

function fixFaceEchoProse(text: string): string {
  let result = text
  result = result.replace(
    /([脸面容孔|身影姿态])([^。！？\n]{0,24}?)还在([^。！？\n]{0,16}?)回荡/g,
    '话音还在崖顶萦绕',
  )
  result = result.replace(
    /([脸面容孔|身影])([^。！？\n]{0,16}?)还在崖顶隐隐回荡/g,
    '那番话还在崖顶隐隐回荡',
  )
  result = result.replace(
    /([脸面容孔|身影])([^。！？\n]{0,12})回荡/g,
    '那画面仍在眼前浮现',
  )
  return result
}

export { parseRealmFixFromConflict } from '../../common/novel/novel-realm-utils.js'

export function applyDeterministicContinuityFixes(args: {
  content: string
  hardMessages: string[]
  modelMessages: string[]
  ruleHints?: string[]
}): { content: string, applied: number } {
  const { content, hardMessages, modelMessages, ruleHints = [] } = args
  let result = content
  let applied = 0

  for (const conflict of hardMessages) {
    const realmFix = parseRealmFixFromConflict(conflict)
    if (realmFix) {
      if (/重修|废(?:去|掉|除)?修为|散功|打落|跌落|沦为|自废|散功/.test(content.slice(0, 2800))) continue
      const next = fixRealmRegressionInContent(result, realmFix)
      if (next !== result) {
        result = next
        applied += 1
      }
    }
  }

  for (const conflict of modelMessages) {
    const swap = parsePerpetratorNameSwap(conflict)
    if (swap) {
      const next = fixPerpetratorNameInText(result, swap.wrong, swap.correct)
      if (next !== result) {
        result = next
        applied += 1
      }
    }
  }

  for (const hint of ruleHints) {
    if (/脸|面容|身影/.test(hint) && /回荡/.test(hint)) {
      const next = fixFaceEchoProse(result)
      if (next !== result) {
        result = next
        applied += 1
      }
    }
  }

  return { content: result, applied }
}
