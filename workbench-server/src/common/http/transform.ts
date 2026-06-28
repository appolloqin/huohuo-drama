/**
 * Drizzle camelCase rows → API snake_case (legacy Go JSON parity).
 */

function camelTokenToSnake(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

function mapRecordKeysToSnake(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [camelTokenToSnake(key), value]),
  )
}

export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  return mapRecordKeysToSnake(obj)
}

export function toSnakeCaseArray(arr: Record<string, any>[]): Record<string, any>[] {
  return arr.map(row => mapRecordKeysToSnake(row))
}
