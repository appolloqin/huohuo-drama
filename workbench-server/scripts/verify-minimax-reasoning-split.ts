/**
 * MiniMax reasoning_split 配置开关（非型号写死）
 * npx tsx scripts/verify-minimax-reasoning-split.ts
 */
import {
  applyMiniMaxTextRequestParams,
  resolveMiniMaxReasoningSplit,
} from '../src/services/ai/minimax-text.js'

if (resolveMiniMaxReasoningSplit({}, false) !== true) {
  throw new Error('unset settings must default reasoning_split=true')
}
if (resolveMiniMaxReasoningSplit({ minimaxReasoningSplit: false }, true) !== false) {
  throw new Error('explicit false must win')
}
if (resolveMiniMaxReasoningSplit({ minimaxReasoningSplit: true }, false) !== true) {
  throw new Error('explicit true must win')
}

const bodyOff: Record<string, unknown> = { model: 'MiniMax-M2.5', max_tokens: 512 }
applyMiniMaxTextRequestParams(
  bodyOff,
  {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat',
    model: 'MiniMax-M2.5',
    settings: { minimaxReasoningSplit: false },
  },
  false,
)
if (bodyOff.reasoning_split !== false) {
  throw new Error(`expected false from settings, got ${String(bodyOff.reasoning_split)}`)
}

const bodyOn: Record<string, unknown> = { model: 'MiniMax-M3.1-Flash-Preview', max_tokens: 512 }
applyMiniMaxTextRequestParams(
  bodyOn,
  {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat',
    model: 'MiniMax-M3.1-Flash-Preview',
    settings: { minimaxReasoningSplit: true },
  },
  false,
  { reasoningSplit: false }, // 调用方覆盖仍尊重 opts；配置路径用 resolve
)
// opts 显式 false 时 apply 以 opts 为准（请求层）；配置默认 true 由 resolve 保证
if (bodyOn.reasoning_split !== false) {
  throw new Error('explicit opts.reasoningSplit=false should apply')
}

const bodyDefault: Record<string, unknown> = { model: 'MiniMax-M3.1-Flash-Preview', max_tokens: 512 }
applyMiniMaxTextRequestParams(
  bodyDefault,
  {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat',
    model: 'MiniMax-M3.1-Flash-Preview',
    settings: {},
  },
  false,
)
if (bodyDefault.reasoning_split !== true) {
  throw new Error('unset settings must send reasoning_split=true')
}
if (JSON.stringify(bodyDefault.thinking) !== JSON.stringify({ type: 'adaptive' })) {
  throw new Error(`M3.1 must send thinking.adaptive, got ${JSON.stringify(bodyDefault.thinking)}`)
}
if (bodyDefault.reasoning_effort !== 'medium') {
  throw new Error(`M3.1-Flash default reasoning_effort must be medium, got ${String(bodyDefault.reasoning_effort)}`)
}

const bodyLow: Record<string, unknown> = { model: 'MiniMax-M3.1-Flash-Preview', max_tokens: 512 }
applyMiniMaxTextRequestParams(
  bodyLow,
  {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat',
    model: 'MiniMax-M3.1-Flash-Preview',
    settings: {},
  },
  true,
  { reasoningEffort: 'low' },
)
if (bodyLow.reasoning_effort !== 'low') {
  throw new Error(`explicit low effort must apply, got ${String(bodyLow.reasoning_effort)}`)
}

const bodyThinkOff: Record<string, unknown> = { model: 'MiniMax-M3.1-Flash-Preview', max_tokens: 512 }
applyMiniMaxTextRequestParams(
  bodyThinkOff,
  {
    provider: 'huohuo',
    baseUrl: 'https://huo.hcpzy.com/v1',
    model: 'MiniMax-M3.1-Flash-Preview',
    settings: { minimaxReasoningSplit: true, enableThinking: false },
  },
  false,
)
if (JSON.stringify(bodyThinkOff.thinking) !== JSON.stringify({ type: 'adaptive' })) {
  throw new Error('M3.1 must not send thinking.disabled even when thinking switch is off')
}

console.log('verify-minimax-reasoning-split: ok')
