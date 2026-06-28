import type { Ref } from 'vue'

/** 跨顶栏导航的页面级缓存标记；登出时清空。 */

export function useSessionCache() {
  const homeProjectsReady = useState('home_projects_ready', () => false)
  const adminSettingsReady = useState('admin_settings_boot_ready', () => false)

  function resetSessionCaches() {
    homeProjectsReady.value = false
    adminSettingsReady.value = false
  }

  return {
    homeProjectsReady,
    adminSettingsReady,
    resetSessionCaches,
  }
}

let adminSettingsInflight: Promise<void> | null = null

export async function runAdminSettingsBootstrap(
  ready: Ref<boolean>,
  run: () => Promise<void>,
): Promise<void> {
  if (ready.value) return
  if (adminSettingsInflight) return adminSettingsInflight
  adminSettingsInflight = run()
    .then(() => {
      ready.value = true
    })
    .finally(() => {
      adminSettingsInflight = null
    })
  return adminSettingsInflight
}
