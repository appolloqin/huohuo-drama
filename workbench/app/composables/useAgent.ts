import { toast } from 'vue-sonner'
import { api } from './use-api'
import { useCreditsGate } from './use-credits-gate'
import { useI18n } from './use-i18n'

// ── Agent 对话：单集上下文 POST，非 SSE ───────────────────────

export function useAgent() {
  const { messages: tm } = useI18n()
  const { guardGenerate } = useCreditsGate()
  const agentBusy = ref(false)
  const agentBusyType = ref<string | null>(null)

  async function invokeAgentSession(
    agentType: string,
    userMessage: string,
    dramaId: number,
    episodeId: number,
    onComplete?: () => void,
  ) {
    if (!guardGenerate()) return
    if (agentBusy.value) {
      toast.warning(tm.value.errors.agentRunning)
      return
    }
    agentBusy.value = true
    agentBusyType.value = agentType
    try {
      await api.post(`/agent/${agentType}/chat`, {
        message: userMessage,
        drama_id: dramaId,
        episode_id: episodeId,
      })
      toast.success(tm.value.errors.agentDone)
      onComplete?.()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      agentBusy.value = false
      agentBusyType.value = null
    }
  }

  return {
    running: agentBusy,
    runningType: agentBusyType,
    run: invokeAgentSession,
    invokeWorkbenchAgent: invokeAgentSession,
  }
}
