#!/usr/bin/env node
/**
 * 本地冒烟：远程 URL 可达 + 本地 runtime server /health
 * 用法：node scripts/smoke-modes.mjs
 */
import { spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const userRuntime = path.join(
  process.env.APPDATA || '',
  'huohuo-drama-desktop',
  'runtime',
)
const repoRoot = path.resolve(desktopRoot, '..')

function fetchStatus(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: timeoutMs, headers: { 'user-agent': 'huohuo-desktop-smoke' } }, (res) => {
      res.resume()
      resolve({ status: res.statusCode || 0, url })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`timeout ${url}`))
    })
  })
}

function waitHealth(port, timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body)
            return
          }
          retry()
        })
      })
      req.on('error', retry)
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`health timeout :${port}`))
        return
      }
      setTimeout(tick, 400)
    }
    tick()
  })
}

function resolveRuntime() {
  const packaged = path.join(userRuntime, 'workbench-server', 'dist', 'index.js')
  if (fs.existsSync(packaged)) {
    return {
      root: userRuntime,
      entry: packaged,
      node: path.join(userRuntime, 'node', process.platform === 'win32' ? 'node.exe' : 'node'),
      data: path.join(process.env.APPDATA, 'huohuo-drama-desktop', 'workbench-data'),
    }
  }
  const repoEntry = path.join(repoRoot, 'workbench-server', 'dist', 'index.js')
  if (fs.existsSync(repoEntry)) {
    return {
      root: repoRoot,
      entry: repoEntry,
      node: process.platform === 'win32' ? 'node.exe' : 'node',
      data: path.join(repoRoot, 'workbench-data'),
    }
  }
  throw new Error('No server runtime found (userData runtime or workbench-server/dist)')
}

async function smokeRemote() {
  const url = 'https://www.seeddrama.com/console/login'
  console.log('[smoke] remote GET', url)
  try {
    const r = await fetchStatus(url)
    console.log('[smoke] remote status', r.status)
    if (r.status < 200 || r.status >= 500) {
      throw new Error(`remote unexpected status ${r.status}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/certificate has expired|CERT_/i.test(msg)) {
      throw new Error(`HTTPS certificate expired for seeddrama.com (${msg})`)
    }
    throw err
  }
}

async function smokeLocal() {
  const rt = resolveRuntime()
  const sql = path.join(rt.root, 'workbench-server', 'dist', 'db', 'sql', 'schema.sqlite.ddl.sql')
  if (!fs.existsSync(sql)) {
    throw new Error(`missing SQL DDL: ${sql}`)
  }
  const port = 18559
  fs.mkdirSync(path.join(rt.data, 'static'), { recursive: true })
  const nodeBin = fs.existsSync(rt.node) ? rt.node : (process.platform === 'win32' ? 'node.exe' : 'node')
  console.log('[smoke] local spawn', nodeBin, rt.entry, `:${port}`)

  const child = spawn(nodeBin, [rt.entry], {
    cwd: path.join(rt.root, 'workbench-server'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DB_DRIVER: 'sqlite',
      DB_PATH: path.join(rt.data, 'huohuo_drama.db'),
      DATA_PATH: rt.data,
      STORAGE_PATH: path.join(rt.data, 'static'),
      DB_AUTO_INIT: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let log = ''
  child.stdout.on('data', (d) => { log += d.toString() })
  child.stderr.on('data', (d) => { log += d.toString() })

  try {
    const body = await waitHealth(port)
    console.log('[smoke] local health', body)
    const page = await fetchStatus(`http://127.0.0.1:${port}/console/`)
    console.log('[smoke] local console status', page.status)
  } finally {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
    if (log.trim()) {
      console.log('[smoke] local log tail:\n' + log.trim().split(/\r?\n/).slice(-8).join('\n'))
    }
  }
}

async function main() {
  const results = []
  try {
    await smokeRemote()
    results.push('remote: OK')
  } catch (err) {
    results.push(`remote: FAIL ${err instanceof Error ? err.message : err}`)
  }
  try {
    await smokeLocal()
    results.push('local: OK')
  } catch (err) {
    results.push(`local: FAIL ${err instanceof Error ? err.message : err}`)
  }
  console.log('[smoke] summary:', results.join(' | '))
  if (results.some((r) => r.includes('FAIL'))) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
