/** Deep-merge locale patches into a cloned base (JSON-safe). Arrays replace wholesale. */
export function deepMergeLocale<T>(base: T, patch: Record<string, unknown>): T {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>
  function apply(target: Record<string, unknown>, p: Record<string, unknown>) {
    for (const key of Object.keys(p)) {
      const pv = p[key]
      const tv = target[key]
      if (
        pv !== null &&
        typeof pv === 'object' &&
        !Array.isArray(pv) &&
        tv !== null &&
        typeof tv === 'object' &&
        !Array.isArray(tv)
      ) {
        apply(tv as Record<string, unknown>, pv as Record<string, unknown>)
      } else {
        target[key] = pv
      }
    }
  }
  apply(out, patch)
  return out as T
}
