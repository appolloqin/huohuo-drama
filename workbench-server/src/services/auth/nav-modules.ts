import * as appSettingsRepo from '../../db/repos/app-settings/index.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { now } from '../../common/http/response.js'

export const NAV_MODULE_IDS = ['projects', 'templates', 'ai_detect', 'settings'] as const
export type NavModuleId = typeof NAV_MODULE_IDS[number]

export type NavModulesRoleConfig = Record<string, NavModuleId[]>
export type NavModulesSource = 'role' | 'user'

const SETTINGS_KEY = 'nav_modules'
const ROLE_NAME_RE = /^[a-zA-Z0-9_]{2,32}$/

const DEFAULT_CONFIG: NavModulesRoleConfig = {
  admin: [...NAV_MODULE_IDS],
  user: [...NAV_MODULE_IDS],
}

function filterModuleIds(modules: unknown): NavModuleId[] {
  if (!Array.isArray(modules)) return []
  return modules.filter((m): m is NavModuleId =>
    NAV_MODULE_IDS.includes(m as NavModuleId),
  )
}

function parseConfig(raw: string | null | undefined): NavModulesRoleConfig {
  if (!raw) return { ...DEFAULT_CONFIG, admin: [...DEFAULT_CONFIG.admin], user: [...DEFAULT_CONFIG.user] }
  try {
    const data = JSON.parse(raw) as { roles?: NavModulesRoleConfig }
    const roles = data?.roles || {}
    const out: NavModulesRoleConfig = {}
    for (const [role, modules] of Object.entries(roles)) {
      const filtered = filterModuleIds(modules)
      if (filtered.length) out[role] = filtered
    }
    if (!out.admin?.length) out.admin = [...DEFAULT_CONFIG.admin]
    if (!out.user?.length) out.user = [...DEFAULT_CONFIG.user]
    return out
  } catch {
    return { ...DEFAULT_CONFIG, admin: [...DEFAULT_CONFIG.admin], user: [...DEFAULT_CONFIG.user] }
  }
}

function sortRoles(roles: Iterable<string>): string[] {
  return Array.from(roles).sort((a, b) => {
    if (a === 'admin') return -1
    if (b === 'admin') return 1
    if (a === 'user') return -1
    if (b === 'user') return 1
    return a.localeCompare(b)
  })
}

function ensureAdminSettings(modules: NavModuleId[]): NavModuleId[] {
  return modules.includes('settings') ? modules : [...modules, 'settings']
}

export function parseStoredUserNavOverride(raw: string | null | undefined): NavModuleId[] | null {
  if (raw === null || raw === undefined || raw === '') return null
  try {
    const parsed = JSON.parse(raw)
    const filtered = filterModuleIds(parsed)
    return filtered
  } catch {
    return null
  }
}

export function serializeUserNavOverride(
  modules: string[],
  role: string,
): string {
  let filtered = filterModuleIds(modules)
  if (role === 'admin') filtered = ensureAdminSettings(filtered)
  return JSON.stringify(filtered)
}

export async function listKnownRoles(): Promise<string[]> {
  const set = new Set<string>(['admin', 'user'])
  const config = await getNavModulesConfig()
  for (const role of Object.keys(config)) set.add(role)
  const rows = await usersRepo.listAllUsers()
  for (const row of rows) {
    if (row.role) set.add(row.role)
  }
  return sortRoles(set)
}

export async function getNavModulesConfig(): Promise<NavModulesRoleConfig> {
  const row = await appSettingsRepo.getAppSetting(SETTINGS_KEY)
  return parseConfig(row?.value)
}

export async function saveNavModulesConfig(config: NavModulesRoleConfig): Promise<NavModulesRoleConfig> {
  const roles = new Set([...(await listKnownRoles()), ...Object.keys(config)])
  const normalized: NavModulesRoleConfig = {}
  for (const role of roles) {
    const modules = config[role]
    const filtered = filterModuleIds(modules)
    normalized[role] = filtered.length
      ? filtered
      : [...(DEFAULT_CONFIG[role] || DEFAULT_CONFIG.user)]
  }
  if (!normalized.admin?.includes('settings')) {
    normalized.admin = ensureAdminSettings(normalized.admin || [])
  }

  const ts = now()
  const payload = JSON.stringify({ roles: normalized })
  await appSettingsRepo.upsertAppSetting(SETTINGS_KEY, payload, ts)
  return normalized
}

export async function navModulesForRole(role: string): Promise<NavModuleId[]> {
  const config = await getNavModulesConfig()
  const modules = config[role] || config.user || [...DEFAULT_CONFIG.user]
  const resolved = modules.length ? modules : [...DEFAULT_CONFIG.user]
  return role === 'admin' ? ensureAdminSettings(resolved) : resolved
}

export async function navModulesForUser(input: {
  role: string
  navModulesOverride?: string | null
}): Promise<NavModuleId[]> {
  const override = parseStoredUserNavOverride(input.navModulesOverride)
  const modules = override !== null
    ? override
    : await navModulesForRole(input.role)
  const resolved = modules.length ? modules : [...DEFAULT_CONFIG.user]
  return input.role === 'admin' ? ensureAdminSettings(resolved) : resolved
}

export function navModulesSourceForUser(navModulesOverride?: string | null): NavModulesSource {
  return parseStoredUserNavOverride(navModulesOverride) !== null ? 'user' : 'role'
}

export function validateRoleName(role: string): string {
  const trimmed = role.trim()
  if (!ROLE_NAME_RE.test(trimmed)) {
    throw new Error('角色名须为 2–32 位字母、数字或下划线')
  }
  return trimmed
}

export function navModuleCatalog() {
  return NAV_MODULE_IDS.map(id => ({
    id,
    path: id === 'projects' ? '/' : `/${id.replace('_', '-')}`,
  }))
}
