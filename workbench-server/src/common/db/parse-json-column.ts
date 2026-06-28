/** MySQL JSON columns may arrive as parsed objects; SQLite stores TEXT. */

export type JsonColumnInput = string | Record<string, unknown> | null | undefined

export function parseJsonColumnObject(raw: JsonColumnInput): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
