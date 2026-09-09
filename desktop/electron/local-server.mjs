import { app } from 'electron'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { dataDir } from './settings.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('child_process').ChildProcess | null} */
let child = null
/** @type {number | null} */
let runningPort = null

function packagedResourcesRoot() {
  // electron-builder extraResources → process.resourcesPath/runtime
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime')
  }
  // 开发：优先 desktop/runtime；否则用仓库根（需本机已 build + 系统 node/ffmpeg）
  const desktopRuntime = path.resolve(__dirname, '../runtime')
  if (fs.existsSync(path.join(desktopRuntime, 'workbench-server', 'dist', 'index.js'))) {
    return desktopRuntime
  }
  return path.resolve(__dirname, '../..')
}

function copyDirFiltered(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    if (name === 'workbench-data') continue
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) copyDirFiltered(from, to)
    else {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
    }
  }
}

/**
 * 将只读安装资源同步到 userData/runtime，保证 workbench-data 可写且路径符合 server 的 repoRoot 约定。
 */
export function ensureWritableRuntime() {
  const userRuntime = path.join(app.getPath('userData'), 'runtime')
  const src = packagedResourcesRoot()
  const manifestSrc = path.join(src, 'manifest.json')
  const manifestDst = path.join(userRuntime, 'manifest.json')
  const data = dataDir()

  let needSync = !fs.existsSync(path.join(userRuntime, 'workbench-server', 'dist', 'index.js'))
  if (!needSync && fs.existsSync(manifestSrc) && fs.existsSync(manifestDst)) {
    try {
      const a = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'))
      const b = JSON.parse(fs.readFileSync(manifestDst, 'utf8'))
      if (a.version !== b.version || a.builtAt !== b.builtAt) needSync = true
    } catch {
      needSync = true
    }
  } else if (fs.existsSync(manifestSrc) && !fs.existsSync(manifestDst)) {
    needSync = true
  }

  // 开发态直接用仓库根 / desktop/runtime 时，不整树复制（太大）；只确保 data 在 userData
  const isDevRepoRoot = !app.isPackaged && src === path.resolve(__dirname, '../..')
  const isDevDesktopRuntime = !app.isPackaged && src.endsWith(`${path.sep}runtime`)

  if (app.isPackaged && needSync) {
    fs.mkdirSync(userRuntime, { recursive: true })
    // 保留已有 workbench-data
    copyDirFiltered(src, userRuntime)
  }

  const runtimeRoot = app.isPackaged || isDevDesktopRuntime ? (app.isPackaged ? userRuntime : src) : src

  // 对齐 index.ts：repoRoot/workbench-data —— 用 junction/symlink 指到 userData
  const linkPath = path.join(runtimeRoot, 'workbench-data')
  ensureDataLink(linkPath, data)

  return { runtimeRoot, dataDir: data }
}

function ensureDataLink(linkPath, target) {
  fs.mkdirSync(target, { recursive: true })
  try {
    if (fs.existsSync(linkPath)) {
      const st = fs.lstatSync(linkPath)
      if (st.isSymbolicLink() || (process.platform === 'win32' && st.isDirectory())) {
        // 已存在则尽量复用
        return
      }
    }
  } catch {
    /* continue */
  }

  try {
    if (fs.existsSync(linkPath)) {
      // 非链接的旧目录不删除用户数据；若是空目录可替换
      try {
        fs.rmSync(linkPath, { recursive: true, force: true })
      } catch {
        return
      }
    }
    if (process.platform === 'win32') {
      fs.symlinkSync(target, linkPath, 'junction')
    } else {
      fs.symlinkSync(target, linkPath, 'dir')
    }
  } catch (err) {
    console.warn('[desktop] workbench-data link failed, relying on DATA_PATH/DB_PATH:', err)
  }
}

function nodeBinary(runtimeRoot) {
  const packaged = path.join(
    runtimeRoot,
    'node',
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  if (fs.existsSync(packaged)) return packaged
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

/** 在 PATH 中解析可执行文件（已安装则优先用系统 FFmpeg） */
function resolveOnPath(binaryName) {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(cmd, [binaryName], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) return null
  const line = String(r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean)
  if (!line || !fs.existsSync(line)) return null
  return line
}

function ffmpegPaths(runtimeRoot) {
  // 1) 系统已安装 → 用系统路径（无需再装/不必依赖内嵌）
  const systemFfmpeg =
    resolveOnPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') || resolveOnPath('ffmpeg')
  const systemFfprobe =
    resolveOnPath(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') || resolveOnPath('ffprobe')

  if (systemFfmpeg) {
    console.log(`[desktop] using system ffmpeg: ${systemFfmpeg}`)
    return {
      FFMPEG_PATH: systemFfmpeg,
      FFPROBE_PATH: systemFfprobe || undefined,
      source: 'system',
    }
  }

  // 2) 回退到安装包内嵌
  const dir = path.join(runtimeRoot, 'ffmpeg')
  const ffmpeg = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  const ffprobe = path.join(dir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  if (fs.existsSync(ffmpeg)) {
    console.log(`[desktop] using bundled ffmpeg: ${ffmpeg}`)
    return {
      FFMPEG_PATH: ffmpeg,
      FFPROBE_PATH: fs.existsSync(ffprobe) ? ffprobe : undefined,
      source: 'bundled',
    }
  }

  console.warn('[desktop] ffmpeg not found on PATH or in runtime bundle')
  return { source: 'none' }
}

function waitHealth(port, timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Local server health check timeout (:${port})`))
        return
      }
      setTimeout(tick, 400)
    }
    tick()
  })
}

async function pickPort() {
  const preferred = Number(process.env.HUOHUO_LOCAL_PORT || 18555)
  const net = await import('net')
  const tryListen = (port) =>
    new Promise((resolve) => {
      const s = net.createServer()
      s.unref()
      s.on('error', () => resolve(null))
      s.listen(port, '127.0.0.1', () => {
        s.close(() => resolve(port))
      })
    })
  const p = await tryListen(preferred)
  if (p) return p
  return tryListen(0).then(async () => {
    // 随机端口
    return await new Promise((resolve, reject) => {
      const s = net.createServer()
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address()
        const port = typeof addr === 'object' && addr ? addr.port : preferred
        s.close(() => resolve(port))
      })
      s.on('error', reject)
    })
  })
}

export function getLocalPort() {
  return runningPort
}

export async function startLocalServer() {
  if (child && !child.killed) {
    return { port: runningPort }
  }

  const { runtimeRoot, dataDir: data } = ensureWritableRuntime()
  const serverEntry = path.join(runtimeRoot, 'workbench-server', 'dist', 'index.js')
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `未找到本地服务产物：${serverEntry}\n请先在 desktop 目录执行：npm run prepare:runtime`,
    )
  }

  // 开发态仓库根：web 在 workbench/.output/public 或 dist
  if (!app.isPackaged) {
    const dist = path.join(runtimeRoot, 'workbench', 'dist')
    const nuxtPublic = path.join(runtimeRoot, 'workbench', '.output', 'public')
    if (!fs.existsSync(dist) && fs.existsSync(nuxtPublic)) {
      // server 也认 .output/public
    } else if (!fs.existsSync(dist) && !fs.existsSync(nuxtPublic)) {
      console.warn('[desktop] workbench static not found; API-only until you generate')
    }
  }

  const port = await pickPort()
  const ff = ffmpegPaths(runtimeRoot)
  const logsDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const logFile = path.join(logsDir, 'local-server.log')
  const logFd = fs.openSync(logFile, 'a')

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DB_DRIVER: 'sqlite',
    DB_PATH: path.join(data, 'huohuo_drama.db'),
    DATA_PATH: data,
    STORAGE_PATH: path.join(data, 'static'),
    DB_AUTO_INIT: process.env.DB_AUTO_INIT || 'true',
    ...(ff.FFMPEG_PATH ? { FFMPEG_PATH: ff.FFMPEG_PATH } : {}),
    ...(ff.FFPROBE_PATH ? { FFPROBE_PATH: ff.FFPROBE_PATH } : {}),
  }

  const nodeBin = nodeBinary(runtimeRoot)
  console.log(`[desktop] starting local server: ${nodeBin} ${serverEntry} :${port}`)

  child = spawn(nodeBin, [serverEntry], {
    cwd: path.join(runtimeRoot, 'workbench-server'),
    env,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  })

  child.on('exit', (code, signal) => {
    console.warn(`[desktop] local server exited code=${code} signal=${signal}`)
    child = null
    runningPort = null
    try {
      fs.closeSync(logFd)
    } catch {
      /* ignore */
    }
  })

  try {
    await waitHealth(port)
  } catch (err) {
    stopLocalServer()
    let hint = ''
    try {
      if (fs.existsSync(logFile)) {
        const tail = fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).slice(-12).join('\n')
        if (tail) hint = `\n\n--- local-server.log ---\n${tail}`
      }
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${message}${hint}`)
  }

  runningPort = port
  return { port, logFile }
}

export function stopLocalServer() {
  if (!child) return
  const proc = child
  child = null
  runningPort = null
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      proc.kill('SIGTERM')
      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }, 3000)
    }
  } catch (err) {
    console.warn('[desktop] stopLocalServer:', err)
  }
}
