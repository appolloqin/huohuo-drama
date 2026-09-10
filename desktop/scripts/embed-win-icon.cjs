const { spawnSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const http = require('http')
const os = require('os')
const path = require('path')

const RCEDIT_URL = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'
const RCEDIT_NAME = 'rcedit-x64.exe'

function candidateCacheRoots() {
  const roots = []
  if (process.env.ELECTRON_BUILDER_CACHE) {
    roots.push(path.join(process.env.ELECTRON_BUILDER_CACHE, 'winCodeSign'))
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  roots.push(path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign'))
  roots.push(path.join(os.homedir(), '.cache', 'electron-builder', 'winCodeSign'))
  // desktop/.cache fallback for CI without prior electron-builder tool download
  roots.push(path.join(__dirname, '..', '.cache', 'rcedit'))
  return [...new Set(roots)]
}

function findInDir(root) {
  if (!root || !fs.existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let names
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const full = path.join(dir, name)
      let st
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) stack.push(full)
      else if (name.toLowerCase() === RCEDIT_NAME.toLowerCase()) return full
    }
  }
  return null
}

function findRcedit() {
  for (const root of candidateCacheRoots()) {
    const hit = findInDir(root)
    if (hit) return hit
  }
  return null
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = url.startsWith('https') ? https.get : http.get
    const req = get(url, { headers: { 'user-agent': 'huohuo-drama-desktop' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlink(dest, () => {})
        downloadFile(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        reject(new Error(`download ${url} failed: HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    })
    req.on('error', (err) => {
      file.close()
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function ensureRcedit() {
  const existing = findRcedit()
  if (existing) return existing

  const cacheDir = path.join(__dirname, '..', '.cache', 'rcedit')
  fs.mkdirSync(cacheDir, { recursive: true })
  const dest = path.join(cacheDir, RCEDIT_NAME)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) return dest

  console.log(`[embed-win-icon] downloading ${RCEDIT_NAME} …`)
  const tmp = `${dest}.part`
  await downloadFile(RCEDIT_URL, tmp)
  fs.renameSync(tmp, dest)
  console.log(`[embed-win-icon] rcedit → ${dest}`)
  return dest
}

async function embedWinIcon(exePath, icoPath) {
  if (!fs.existsSync(exePath) || !fs.existsSync(icoPath)) {
    throw new Error(`embedWinIcon missing file: ${exePath} / ${icoPath}`)
  }
  const rcedit = await ensureRcedit()
  const tmp = path.join(os.tmpdir(), `huohuo-icon-${Date.now()}-${path.basename(exePath)}`)
  fs.copyFileSync(exePath, tmp)
  const r = spawnSync(rcedit, [tmp, '--set-icon', icoPath], { encoding: 'utf8' })
  if (r.status !== 0) {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    throw new Error(`rcedit icon failed: ${r.stderr || r.stdout || r.status}`)
  }
  fs.copyFileSync(tmp, exePath)
  try { fs.unlinkSync(tmp) } catch { /* ignore */ }
}

exports.findRcedit = findRcedit
exports.ensureRcedit = ensureRcedit
exports.embedWinIcon = embedWinIcon
