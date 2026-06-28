import { toast } from 'vue-sonner'
import { useAuth } from '~/composables/useAuth'
import { useI18n } from '~/composables/use-i18n'

// ── 积分门禁：非管理员在余额为 0 时拦截 AI 生成 ─────────────

export function useCreditsGate() {
  const { canGenerate } = useAuth()
  const { messages: tm } = useI18n()

  function blockIfNoCredits(): boolean {
    if (canGenerate.value) return true
    toast.error(tm.value.credits.noCreditsCannotGenerate)
    return false
  }

  return { canGenerate, guardGenerate: blockIfNoCredits }
}
