#!/usr/bin/env node
/**
 * Cross-shell dist entry: prepare runtime then electron-builder.
 * Avoids npm `&&` (PowerShell 5.x) and extra npm subprocesses.
 */
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform === 'win32') {
  process.env.npm_config_script_shell = 'cmd.exe'
  process.env.NPM_CONFIG_SCRIPT_SHELL = 'cmd.exe'
}
const target = process.argv[2]
const allowed = new Set(['--win', '--mac', '--linux'])
if (target && !allowed.has(target)) {
  console.error(`Unknown dist target: ${target}`)
  process.exit(1)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  })
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(process.execPath, [path.join(desktopRoot, 'scripts', 'prepare-runtime.mjs')])

const ebCli = path.join(desktopRoot, 'node_modules', 'electron-builder', 'cli.js')
if (!existsSync(ebCli)) {
  console.error(`electron-builder not found: ${ebCli} (run npm ci in desktop/)`)
  process.exit(1)
}
run(process.execPath, target ? [ebCli, target] : [ebCli])
