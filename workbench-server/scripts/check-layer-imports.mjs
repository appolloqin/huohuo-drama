#!/usr/bin/env node
/**
 * 分层约束：已迁移的 routes 不得直接 import db 或 repositories。
 * 其余 routes 在逐步迁移后追加到 COMPLIANT_ROUTES。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/routes')
const COMPLIANT_ROUTES = new Set([
  'auth.ts',
  'dramas.ts',
  'generation-lessons.ts',
  'episodes.ts',
  'storyboards.ts',
  'scenes.ts',
  'characters.ts',
  'templates.ts',
  'ai-configs.ts',
  'agent-configs.ts',
  'videos.ts',
  'images.ts',
  'showcase.ts',
  'payments.ts',
  'novel.ts',
  'batch-jobs.ts',
  'compose.ts',
  'merge.ts',
  'grid.ts',
  'ai-voices.ts',
  'agent.ts',
  'webhooks.ts',
  'upload.ts',
  'skills.ts',
  'ai-detect.ts',
  'seo.ts',
  'helpers/merge-routes.ts',
  'helpers/generation-routes.ts',
  'ai-config-probe.ts',
  'ai-config-serializers.ts',
])

const FORBIDDEN = [
  /from\s+['"][^'"]*db\/index(?:\.js)?['"]/,
  /from\s+['"][^'"]*db\/repositories\//,
]

function walk(dir, base = '', out = []) {
  for (const name of fs.readdirSync(dir)) {
    const rel = base ? `${base}/${name}` : name
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, rel, out)
    else if (p.endsWith('.ts')) out.push(rel.replace(/\\/g, '/'))
  }
  return out
}

const violations = []
for (const rel of walk(ROOT)) {
  if (!COMPLIANT_ROUTES.has(rel)) continue
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  for (const re of FORBIDDEN) {
    if (re.test(src)) violations.push(`${rel}: ${re}`)
  }
}

if (violations.length) {
  console.error('Layer check failed — compliant routes must call services only:\n')
  for (const v of violations) console.error('  -', v)
  process.exit(1)
}

console.log(`Layer check passed (${COMPLIANT_ROUTES.size} compliant route modules).`)
