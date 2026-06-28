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
      try {
        await run(send)
      } catch (err: any) {
        send({ error: err?.message || '生成失败' })
      } finally {
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

/** 流式初稿 → 润色后通过 content 事件下发终稿（对齐非流式二次润色） */
export async function streamChatCompletionWithPolish(
  c: Context,
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  polish: (draft: string, billing?: TextBillingContext) => Promise<string>,
  afterPolish?: (polished: string, billing?: TextBillingContext) => Promise<Record<string, unknown> | void>,
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

    send({ polishing: true })
    const draft = sanitizeModelCreativeOutput(full)
    if (!isUsableNovelCreativeOutput(draft, 'chapter_prose')) {
      throw new Error('流式生成结果含思考链或正文过短，请关闭思考模式后重试')
    }
    const polished = await polish(draft, options.billing)
    send({ content: polished })
    if (afterPolish) {
      const extra = await afterPolish(polished, options.billing)
      if (extra && Object.keys(extra).length) send(extra)
    }
    send({ done: true })
  })
}
