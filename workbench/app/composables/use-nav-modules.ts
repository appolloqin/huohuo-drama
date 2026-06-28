// ── 导航模块：按用户权限裁剪侧栏与路由门禁 ───────────────────

export const NAV_MODULE_IDS = ['projects', 'templates', 'ai_detect', 'settings'] as const
export type NavModuleId = typeof NAV_MODULE_IDS[number]

export const NAV_MODULE_DEFS: Array<{
  id: NavModuleId
  path: string
  match: (path: string) => boolean
}> = [
  { id: 'projects', path: '/', match: p => p === '/' || p.startsWith('/drama') },
  { id: 'templates', path: '/templates', match: p => p.startsWith('/templates') },
  { id: 'ai_detect', path: '/ai-detect', match: p => p.startsWith('/ai-detect') },
  { id: 'settings', path: '/settings', match: p => p.startsWith('/settings') },
]

export function useNavModules() {
  const allowedModuleIds = useState<NavModuleId[]>('huohuo_nav_modules', () => [...NAV_MODULE_IDS])

  function applyNavModuleGrant(list: NavModuleId[] | string[] | null | undefined) {
    const filtered = (list || []).filter((id): id is NavModuleId =>
      NAV_MODULE_IDS.includes(id as NavModuleId),
    )
    allowedModuleIds.value = filtered.length ? filtered : [...NAV_MODULE_IDS]
  }

  function isModuleAllowed(id: NavModuleId) {
    return allowedModuleIds.value.includes(id)
  }

  function resolveModuleForRoute(path: string): NavModuleId | null {
    for (const def of NAV_MODULE_DEFS) {
      if (def.match(path)) return def.id
    }
    return null
  }

  function firstAllowedRoute(): string {
    const def = NAV_MODULE_DEFS.find(d => allowedModuleIds.value.includes(d.id))
    return def?.path || '/'
  }

  return {
    modules: allowedModuleIds,
    setNavModules: applyNavModuleGrant,
    canAccess: isModuleAllowed,
    moduleForPath: resolveModuleForRoute,
    defaultPath: firstAllowedRoute,
    NAV_MODULE_DEFS,
  }
}
