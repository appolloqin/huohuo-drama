import fs from 'fs'
import path from 'path'
import { resolveDataRoot } from '../../../common/media/data-root.js'

export type NovelMemoryFileKey = 'world_bible' | 'character_sheets' | 'plot_ledger' | 'anchor'

export function novelMemoryRoot(dramaId: number): string {
  return path.join(resolveDataRoot(), 'novel-memory', String(dramaId))
}

export function novelMemoryPaths(dramaId: number) {
  const root = novelMemoryRoot(dramaId)
  return {
    root,
    world: path.join(root, 'world_bible.md'),
    chars: path.join(root, 'character_sheets.md'),
    plot: path.join(root, 'plot_ledger.md'),
    anchor: path.join(root, 'anchor.txt'),
    causalChain: path.join(root, 'causal_chain.md'),
    chapters: path.join(root, 'chapters'),
    chapterFile: (vol: number, chapter: number) =>
      path.join(root, 'chapters', `vol_${String(vol).padStart(2, '0')}`, `ch_${String(chapter).padStart(3, '0')}.md`),
    volDir: (vol: number) =>
      path.join(root, 'chapters', `vol_${String(vol).padStart(2, '0')}`),
  }
}

export function novelMemoryInitialized(dramaId: number): boolean {
  const p = novelMemoryPaths(dramaId)
  return fs.existsSync(p.world) && fs.existsSync(p.chars) && fs.existsSync(p.plot)
}
