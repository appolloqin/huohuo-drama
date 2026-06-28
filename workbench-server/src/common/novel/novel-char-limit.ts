/** 与前端 countNovelChars 一致：按 Unicode 码点计字 */
export function countNovelChars(text: string | null | undefined): number {
  if (!text) return 0
  return [...text].length
}
