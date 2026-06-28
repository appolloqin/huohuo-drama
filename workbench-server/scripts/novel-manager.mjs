#!/usr/bin/env node
/**
 * 长篇小说三层长记忆管理 CLI
 *
 * 用法：
 *   npm run novel:memory -- init --drama 4
 *   npm run novel:memory -- brief --drama 4 --vol 1 --chapter 11
 *   npm run novel:memory -- review --drama 4 --vol 1 --last 10
 *   npm run novel:memory -- snapshot --drama 4 --vol 1
 */
import '../src/load-env.js'
import '../src/db/bootstrap.js'
import * as dramasRepo from '../src/db/repos/dramas/index.js'
import { parseNovelMetadata } from '../src/utils/novel-meta.js'
import { NovelMemoryManager, novelMemoryPaths } from '../src/services/novel-memory/index.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

function requireArg(name: string): string {
  const v = arg(name)
  if (!v) {
    console.error(`缺少 --${name}`)
    process.exit(1)
  }
  return v
}

async function loadDrama(dramaId) {
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || drama.deletedAt) {
    console.error(`项目不存在: drama ${dramaId}`)
    process.exit(1)
  }
  return drama
}

const cmd = process.argv[2]

if (!cmd || cmd === 'help' || cmd === '-h') {
  console.log(`长篇小说三层长记忆 CLI

命令:
  init      --drama ID              初始化 workbench-data/novel-memory/{id}/
  brief     --drama ID --vol V --chapter N [--title T] [--brief TEXT]
  review    --drama ID --vol V --last N
  snapshot  --drama ID --vol V
`)
  process.exit(0)
}

const dramaId = Number(requireArg('drama'))
const drama = await loadDrama(dramaId)
const meta = parseNovelMetadata(drama.metadata)
const mgr = new NovelMemoryManager(dramaId)

if (cmd === 'init') {
  const result = mgr.init({
    outline: meta.outline,
    premise: meta.premise,
    title: drama.title,
  })
  console.log(`项目已初始化: ${result.root}`)
  console.log('文件:')
  console.log(`  ${novelMemoryPaths(dramaId).world}`)
  console.log(`  ${novelMemoryPaths(dramaId).chars}`)
  console.log(`  ${novelMemoryPaths(dramaId).plot}`)
} else if (cmd === 'brief') {
  if (!NovelMemoryManager.exists(dramaId)) {
    mgr.init({ outline: meta.outline, premise: meta.premise, title: drama.title })
  }
  const vol = Number(arg('vol') || mgr.resolveVol(Number(requireArg('chapter')), meta.outline))
  const chapter = Number(requireArg('chapter'))
  const prompt = await mgr.buildChapterPrompt({
    vol,
    chapter,
    title: arg('title'),
    brief: arg('brief'),
    outline: meta.outline,
  })
  const out = `${novelMemoryPaths(dramaId).root}/prompt_vol${vol}_ch${chapter}.txt`
  const fs = await import('fs')
  fs.writeFileSync(out, prompt, 'utf-8')
  console.log(`提示词已生成: ${out}`)
} else if (cmd === 'review') {
  if (!NovelMemoryManager.exists(dramaId)) {
    console.error('长记忆未初始化，请先 init')
    process.exit(1)
  }
  const vol = Number(arg('vol') || 1)
  const last = Number(requireArg('last'))
  const issues = await mgr.review(vol, last)
  if (issues.length) {
    console.log('发现一致性问题：')
    for (const i of issues) console.log(`  ⚠ ${i}`)
    process.exit(1)
  }
  console.log(`✓ 第 ${vol} 卷前 ${last} 章一致性检查通过`)
} else if (cmd === 'snapshot') {
  if (!NovelMemoryManager.exists(dramaId)) {
    console.error('长记忆未初始化，请先 init')
    process.exit(1)
  }
  const vol = Number(arg('vol') || 1)
  const path = mgr.snapshot(vol)
  console.log(`卷末快照已生成: ${path}`)
} else {
  console.error(`未知命令: ${cmd}`)
  process.exit(1)
}
