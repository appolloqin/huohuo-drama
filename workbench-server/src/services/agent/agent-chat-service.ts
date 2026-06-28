/**
 * 火火 — Agent 非流式对话编排（鉴权、积分、工具结果归一化）
 */
import { createAgent } from '../../agents/index.js'
import { assignDramaVoicesByHeuristic } from '../../agents/tools/drama-voice-assign-tools.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { chargeTextUsage, resolveTokenUsage } from '../credits/credits.js'
import { assertUserServiceConfigReady, getTextConfig } from '../ai/ai.js'

export function labelToolInvocation(entry: any): string | null {
  return entry?.toolName
    || entry?.tool?.toolName
    || entry?.tool?.id
    || entry?.name
    || entry?.type
    || null
}

export function stringifyToolOutput(entry: any): string {
  const raw = entry?.result ?? entry?.output ?? entry?.data ?? null
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

export async function executeAgentChat(input: {
  agentType: string
  userId: number
  role: string
  message: string
  dramaId: number
  episodeId: number
}) {
  const { agentType, userId, role, message, dramaId, episodeId } = input
  await assertUserServiceConfigReady(userId, role, 'text')
  const clockStart = performance.now()

  logTaskStart('Agent', agentType, { dramaId, episodeId, message })
  logTaskPayload('Agent', `${agentType} input`, { message, drama_id: dramaId, episode_id: episodeId })

  if (agentType === 'drama_voice_assign') {
    const voicePayload = await assignDramaVoicesByHeuristic(episodeId, dramaId)
    const elapsedSec = ((performance.now() - clockStart) / 1000).toFixed(1)
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsedSec, mode: 'deterministic', assigned: voicePayload.count })
    return {
      type: 'done' as const,
      text: `已完成音色分配：共 ${voicePayload.count} 个角色，provider=${voicePayload.provider}`,
      toolCalls: [],
      toolResults: [{ toolName: 'assign_voices', result: JSON.stringify(voicePayload) }],
    }
  }

  const runtime = await createAgent(agentType, episodeId, dramaId, { userId, role })
  if (!runtime) throw new Error('Agent not found')

  const llmOutput = await runtime.generate(
    [{ role: 'user', content: message }],
    { maxSteps: 20 },
  )

  const elapsedSec = ((performance.now() - clockStart) / 1000).toFixed(1)
  logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsedSec })

  const rawCalls = llmOutput.toolCalls || []
  const rawResults = llmOutput.toolResults || []
  const toolCalls = rawCalls.map((tc: any) => ({
    toolName: labelToolInvocation(tc),
    args: tc?.args ?? tc?.input ?? null,
  }))
  const toolResults = rawResults.map((tr: any) => ({
    toolName: labelToolInvocation(tr),
    result: stringifyToolOutput(tr),
  }))

  logTaskProgress('Agent', 'tool-summary', {
    agentType,
    toolCalls: toolCalls.map((tc) => tc.toolName),
    toolResults: toolResults.map((tr) => tr.toolName),
  })
  logTaskPayload('Agent', `${agentType} tool-results`, toolResults)

  const textCfg = await getTextConfig({ userId, role })
  const { totalTokens, estimated } = resolveTokenUsage(null, [{ content: message }], llmOutput.text || '')
  await chargeTextUsage({
    userId,
    role,
    config: textCfg,
    totalTokens,
    tokensEstimated: estimated,
    reason: `Agent：${agentType}`,
    resourceType: 'episode',
    resourceId: episodeId,
  })

  return {
    type: 'done' as const,
    text: llmOutput.text || '',
    toolCalls,
    toolResults,
  }
}
