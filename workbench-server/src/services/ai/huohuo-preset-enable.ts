/** 用户 preset 行是否启用火火该服务；无行 / null → 启用 */
export function presetRowEnabled(row: { enabled?: boolean | number | null } | null | undefined): boolean {
  if (row == null || row.enabled == null) return true
  return row.enabled === true || row.enabled === 1
}

export function parsePresetEnabledFlag(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined
  if (typeof raw === 'boolean') return raw
  if (raw === 0 || raw === '0' || raw === 'false') return false
  if (raw === 1 || raw === '1' || raw === 'true') return true
  return undefined
}
