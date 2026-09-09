#!/usr/bin/env node
/**
 * 构建桌面本地运行时（不修改 workbench / workbench-server 源码）：
 * - workbench nuxt generate → runtime/workbench/dist
 * - workbench-server tsc + prod node_modules → runtime/workbench-server
 * - agent-skills → runtime/agent-skills（及 skill-catalog 用的 workbench-server/agent-skills）
 * - 平台 Node / FFmpeg → runtime/node、runtime/ffmpeg
 *
 * 用法（在 desktop/ 下）：node scripts/prepare-runtime.mjs
 * 跳过前端/后端构建：SKIP_WEB=1 SKIP_SERVER=1 node scripts/prepare-runtime.mjs
 */
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const runtimeRoot = path.join(desktopRoot, 'runtime')
const platform = process.platform
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const NODE_VERSION = process.env.HUOHUO_NODE_VERSION || '22.14.0'

function run(cmd, args, cwd, env = {}) {
  console.log(`[prepare-runtime] $ ${cmd} ${args.join(' ')} (cwd=${cwd})`)
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: platform === 'win32',
  })
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`)
  }
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

async function download(url, dest) {
  console.log(`[prepare-runtime] download ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  ensureDir(path.dirname(dest))
  await pipeline(res.body, createWriteStream(dest))
}

function unpackZip(zipPath, destDir) {
  ensureDir(destDir)
  if (platform === 'win32') {
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ], desktopRoot)
  } else {
    run('unzip', ['-o', zipPath, '-d', destDir], desktopRoot)
  }
}

async function prepareNode() {
  const nodeDir = path.join(runtimeRoot, 'node')
  rmSync(nodeDir, { recursive: true, force: true })
  ensureDir(nodeDir)
  const cache = path.join(desktopRoot, '.cache')
  ensureDir(cache)

  let url
  let archiveName
  let binaryRel
  if (platform === 'win32') {
    archiveName = `node-v${NODE_VERSION}-win-${arch}.zip`
    url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
    binaryRel = `node-v${NODE_VERSION}-win-${arch}/node.exe`
  } else if (platform === 'darwin') {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64'
    archiveName = `node-v${NODE_VERSION}-darwin-${nodeArch}.tar.gz`
    url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
    binaryRel = `node-v${NODE_VERSION}-darwin-${nodeArch}/bin/node`
  } else {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64'
    archiveName = `node-v${NODE_VERSION}-linux-${nodeArch}.tar.gz`
    url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
    binaryRel = `node-v${NODE_VERSION}-linux-${nodeArch}/bin/node`
  }

  const archivePath = path.join(cache, archiveName)
  if (!existsSync(archivePath)) {
    await download(url, archivePath)
  }

  const extractDir = path.join(cache, `node-extract-${platform}-${arch}`)
  rmSync(extractDir, { recursive: true, force: true })
  ensureDir(extractDir)

  if (archiveName.endsWith('.zip')) {
    unpackZip(archivePath, extractDir)
  } else {
    run('tar', ['-xzf', archivePath, '-C', extractDir], desktopRoot)
  }

  const srcBin = path.join(extractDir, binaryRel)
  if (!existsSync(srcBin)) {
    throw new Error(`Node binary not found after extract: ${srcBin}`)
  }
  const destBin = path.join(nodeDir, platform === 'win32' ? 'node.exe' : 'node')
  cpSync(srcBin, destBin)
  if (platform !== 'win32') chmodSync(destBin, 0o755)
  writeFileSync(path.join(nodeDir, 'VERSION'), NODE_VERSION)
  console.log(`[prepare-runtime] node → ${destBin}`)
}

function systemHasFfmpeg() {
  const cmd = platform === 'win32' ? 'where' : 'which'
  const ffmpeg = spawnSync(cmd, [platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const ffprobe = spawnSync(cmd, [platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const ffmpegOk = ffmpeg.status === 0 && String(ffmpeg.stdout || '').trim()
  const ffprobeOk = ffprobe.status === 0 && String(ffprobe.stdout || '').trim()
  return Boolean(ffmpegOk && ffprobeOk)
}

async function prepareFfmpeg() {
  const ffmpegDir = path.join(runtimeRoot, 'ffmpeg')
  rmSync(ffmpegDir, { recursive: true, force: true })
  ensureDir(ffmpegDir)

  // 本机已安装且非强制内嵌 → 跳过下载（CI 默认 FORCE_EMBED_FFMPEG / GITHUB_ACTIONS 仍会内嵌，方便无 FFmpeg 的用户）
  const forceEmbed =
    process.env.FORCE_EMBED_FFMPEG === '1' || process.env.GITHUB_ACTIONS === 'true'
  if (!forceEmbed && systemHasFfmpeg()) {
    writeFileSync(
      path.join(ffmpegDir, 'USE_SYSTEM'),
      'system ffmpeg/ffprobe detected; bundle skipped\n',
    )
    console.log('[prepare-runtime] system ffmpeg found — skip embedding')
    return
  }

  // 使用 npm 可选依赖解析当前平台二进制（prepare 时在 desktop 目录安装）
  run('npm', ['install', '--no-save', '--no-package-lock', 'ffmpeg-static@5.2.0', 'ffprobe-static@3.1.0'], desktopRoot)

  const require = createRequire(path.join(desktopRoot, 'package.json'))
  const ffmpegPath = require('ffmpeg-static')
  const ffprobePkg = require('ffprobe-static')
  const ffprobePath = ffprobePkg.path

  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    throw new Error('ffmpeg-static binary missing')
  }
  if (!ffprobePath || !existsSync(ffprobePath)) {
    throw new Error('ffprobe-static binary missing')
  }

  const ffmpegDest = path.join(ffmpegDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  const ffprobeDest = path.join(ffmpegDir, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  cpSync(ffmpegPath, ffmpegDest)
  cpSync(ffprobePath, ffprobeDest)
  if (platform !== 'win32') {
    chmodSync(ffmpegDest, 0o755)
    chmodSync(ffprobeDest, 0o755)
  }
  console.log(`[prepare-runtime] ffmpeg → ${ffmpegDest}`)
}

function prepareWorkbench() {
  const webOut = path.join(runtimeRoot, 'workbench', 'dist')
  rmSync(path.join(runtimeRoot, 'workbench'), { recursive: true, force: true })
  ensureDir(webOut)

  if (process.env.SKIP_WEB === '1') {
    console.log('[prepare-runtime] SKIP_WEB=1')
    return
  }

  const wb = path.join(repoRoot, 'workbench')
  if (!existsSync(path.join(wb, 'node_modules'))) {
    run('npm', ['ci'], wb)
  }
  run('npm', ['run', 'generate'], wb, { NUXT_APP_BASE_URL: '/console/' })

  const generated = path.join(wb, '.output', 'public')
  if (!existsSync(generated)) {
    throw new Error(`Missing workbench generate output: ${generated}`)
  }
  cpSync(generated, webOut, { recursive: true })
  console.log(`[prepare-runtime] workbench dist → ${webOut}`)
}

function prepareServer() {
  const serverOut = path.join(runtimeRoot, 'workbench-server')
  rmSync(serverOut, { recursive: true, force: true })
  ensureDir(serverOut)

  if (process.env.SKIP_SERVER === '1') {
    console.log('[prepare-runtime] SKIP_SERVER=1')
    return
  }

  const serverSrc = path.join(repoRoot, 'workbench-server')
  if (!existsSync(path.join(serverSrc, 'node_modules'))) {
    run('npm', ['ci'], serverSrc)
  }
  run('npm', ['run', 'build'], serverSrc)

  const distSrc = path.join(serverSrc, 'dist')
  if (!existsSync(distSrc)) throw new Error('workbench-server dist missing after build')

  cpSync(distSrc, path.join(serverOut, 'dist'), { recursive: true })
  // tsc 不复制非 TS 资源；SQLite/MySQL 建表 DDL 运行时从 dist/db/sql 读取
  const sqlSrc = path.join(serverSrc, 'src', 'db', 'sql')
  const sqlDest = path.join(serverOut, 'dist', 'db', 'sql')
  if (existsSync(sqlSrc)) {
    cpSync(sqlSrc, sqlDest, { recursive: true })
  } else {
    throw new Error(`Missing SQL DDL directory: ${sqlSrc}`)
  }
  cpSync(path.join(serverSrc, 'package.json'), path.join(serverOut, 'package.json'))
  if (existsSync(path.join(serverSrc, 'package-lock.json'))) {
    cpSync(path.join(serverSrc, 'package-lock.json'), path.join(serverOut, 'package-lock.json'))
  }

  // 在目标目录安装生产依赖（保证 better-sqlite3 对应本机 ABI）
  run('npm', ['ci', '--omit=dev'], serverOut)

  // skill-catalog 从 dist/services/skill 解析到 workbench-server/agent-skills
  const skillsRoot = path.join(repoRoot, 'agent-skills')
  if (existsSync(skillsRoot)) {
    cpSync(skillsRoot, path.join(runtimeRoot, 'agent-skills'), { recursive: true })
    cpSync(skillsRoot, path.join(serverOut, 'agent-skills'), { recursive: true })
  }

  console.log(`[prepare-runtime] server → ${serverOut}`)
}

function writeManifest() {
  const pkg = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
  const manifest = {
    version: pkg.version,
    builtAt: new Date().toISOString(),
    platform,
    arch,
    nodeVersion: NODE_VERSION,
  }
  writeFileSync(path.join(runtimeRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

async function main() {
  ensureDir(runtimeRoot)
  prepareWorkbench()
  prepareServer()
  await prepareNode()
  await prepareFfmpeg()
  writeManifest()
  console.log('[prepare-runtime] done →', runtimeRoot)
}

main().catch((err) => {
  console.error('[prepare-runtime] failed:', err)
  process.exit(1)
})
