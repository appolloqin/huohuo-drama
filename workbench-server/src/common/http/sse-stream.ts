import type { Context } from 'hono'
import type { ChatCompletionOptions, TextBillingContext } from '../../services/ai/ai.js'
import { chatCompletionStream, getTextConfig, sanitizeModelCreativeOutput, type ChatMessage } from '../../services/ai/ai.js'
import { isUsableNovelCreativeOutput } from '../novel/novel-creative-output.js'
import { chargeTextUsage, resolveTokenUsage } from '../../services/credits/credits.js'

export async function sseResponse(c: Context, run: (send: (payload: Record<string, unknown>) => void) => Promise<void>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }
      // 整段 SSE 周期心跳（含初稿思考静默、润色/审校）；防代理空闲断开
      const heartbeat = setInterval(() => {
        try {
          send({ heartbeat: true })
        } catch {
          /* stream already closed */
        }
      }, 12_000)
      try {
        await run(send)
      } catch (err: any) {
        send({ error: err?.message || '生成失败' })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })
  return c.newResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function streamChatCompletion(
  c: Context,
  messages: ChatMessage[],
  options: ChatCompletionOptions,
) {
  return sseResponse(c, async (send) => {
    send({ started: true })
    let full = ''
    for await (const chunk of chatCompletionStream(messages, options)) {
      if (chunk) {
        full += chunk
        send({ text: chunk })
      }
    }
    if (options.billing) {
      const cfg = await getTextConfig()
      const { totalTokens, estimated } = resolveTokenUsage(null, messages, full)
      await chargeTextUsage({
        userId: options.billing.userId,
        role: options.billing.role,
        config: cfg,
        totalTokens,
        tokensEstimated: estimated,
        reason: options.billing.reason,
        resourceType: options.billing.resourceType,
        resourceId: options.billing.resourceId,
      })
    }

    send({ done: true })
  })
}

/** 流式初稿 → 润色 → 审校后通过 content 下发终稿 */
export async function streamChatCompletionWithPolish(
  c: Context,
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  polish: (draft: string, billing?: TextBillingContext) => Promise<string>,
  afterPolish?: (
    polished: string,
    billing?: TextBillingContext,
    notify?: (payload: Record<string, unknown>) => void,
  ) => Promise<Record<string, unknown> | void>,
) {
  return sseResponse(c, async (send) => {
    send({ started: true, status: '正在生成初稿…' })
    let full = ''
    for await (const chunk of chatCompletionStream(messages, options)) {
      if (chunk) {
        full += chunk
        send({ text: chunk })
      }
    }
    if (options.billing) {
      const cfg = await getTextConfig()
      const { totalTokens, estimated } = resolveTokenUsage(null, messages, full)
      await chargeTextUsage({
        userId: options.billing.userId,
        role: options.billing.role,
        config: cfg,
        totalTokens,
        tokensEstimated: estimated,
        reason: options.billing.reason,
        resourceType: options.billing.resourceType,
        resourceId: options.billing.resourceId,
      })
    }

    send({ polishing: true, phase: 'polish', status: '正在润色正文…' })
    const draft = sanitizeModelCreativeOutput(full)
    if (!isUsableNovelCreativeOutput(draft, 'chapter_prose')) {
      const chars = draft.trim().length
      throw new Error(
        chars === 0
          ? '流式初稿为空（思考链占满或未返回正文）。请确认文本模型已关闭思考模式后重试；DeepSeek-V4 等请用非 reasoner 模型'
          : '流式初稿仍含思考链或过短，请关闭思考模式后重试',
      )
    }
    const polished = await polish(draft, options.billing)
    if (afterPolish) {
      send({ phase: 'review', status: '正在审校（连贯性 / 质量 / 大纲边界）…' })
      const extra = await afterPolish(polished, options.billing, (payload) => send(payload))
      if (extra && typeof extra === 'object') {
        const hardReject = (extra as { hard_reject?: boolean }).hard_reject === true
          || (extra as { outline_compliance?: { hardReject?: boolean } }).outline_compliance?.hardReject === true
        // 硬拒必须交空串，禁止回退到润色稿（否则前端若漏回滚会留下审校进度乱码/毒稿）
        const rawContent = typeof (extra as { content?: string }).content === 'string'
          ? (extra as { content: string }).content
          : ''
        const content = hardReject
          ? ''
          : (rawContent.trim() ? rawContent : polished)
        if (!hardReject && !String(content || '').trim()) {
          throw new Error('审校后正文为空，请重试')
        }
        const { content: _c, ...rest } = extra as Record<string, unknown>
        send({ content, ...rest, status: hardReject ? '未通过' : '完成' })
      } else {
        send({ content: polished, status: '完成' })
      }
    } else {
      send({ content: polished, status: '完成' })
    }
    send({ done: true })
  })
}
