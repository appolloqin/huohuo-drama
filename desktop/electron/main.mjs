/**
 * 火火短剧桌面端：默认本地（内嵌 Node + 编译产物 + SQLite + FFmpeg），可切换远程 URL。
 * 不修改 workbench / workbench-server 源码。
 */
import { app, BrowserWindow, Menu, shell, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveRemoteConsoleUrl, allowedOriginFor } from './config.mjs'
import { loadSettings, saveSettings, DEFAULT_REMOTE_URL } from './settings.mjs'
import { startLocalServer, stopLocalServer } from './local-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return undefined
}

/** @type {BrowserWindow | null} */
let mainWindow = null
let allowedOrigin = ''
/** @type {Promise<void> | null} */
let bootPromise = null
let currentMode = 'local'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function isAllowedNavigation(targetUrl) {
  try {
    const u = new URL(targetUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return u.origin === allowedOrigin
  } catch {
    return false
  }
}

function attachWindowHandlers(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = aborted
    console.warn(`[desktop] did-fail-load code=${code} desc=${desc} url=${url}`)
    const certHint =
      /CERT|cert|SSL|TLS|ERR_CERT/i.test(String(desc)) || code === -202 || code === -200 || code === -201
        ? '\n\n若提示证书错误，多半是远程站点 HTTPS 证书过期/不受信，需更新服务器证书；与本地模式无关。'
        : ''
    dialog.showErrorBox(
      currentMode === 'remote' ? '远程页面加载失败' : '页面加载失败',
      `${desc}\n\nURL: ${url}\ncode: ${code}${certHint}`,
    )
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

function ensureWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: '火火短剧',
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  attachWindowHandlers(mainWindow)
  return mainWindow
}

async function loadLocalConsole() {
  const { port } = await startLocalServer()
  return `http://127.0.0.1:${port}/console/`
}

async function navigateToMode(mode, { announceLocalFailure = false } = {}) {
  currentMode = mode === 'remote' ? 'remote' : 'local'
  saveSettings({ mode: currentMode })
  buildMenu()

  const win = ensureWindow()
  let url

  if (currentMode === 'remote') {
    stopLocalServer()
    url = resolveRemoteConsoleUrl(loadSettings().remoteUrl)
  } else {
    try {
      url = await loadLocalConsole()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (announceLocalFailure) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'error',
          title: '本地服务启动失败',
          message: '本地模式无法启动',
          detail: `${message}\n\n是否切换到远程控制台？`,
          buttons: ['切换到远程', '保持本地（关闭）'],
          defaultId: 0,
          cancelId: 1,
        })
        if (response === 0) {
          return navigateToMode('remote', { announceLocalFailure: false })
        }
        return
      }
      throw err
    }
  }

  allowedOrigin = allowedOriginFor(url)
  console.log(`[desktop] navigate mode=${currentMode} url=${url}`)
  await win.loadURL(url)
}

async function boot() {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const settings = loadSettings()
    currentMode = settings.mode === 'remote' ? 'remote' : 'local'
    buildMenu()
    ensureWindow()
    try {
      await navigateToMode(currentMode, { announceLocalFailure: currentMode === 'local' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('启动失败', message)
    }
  })()
  try {
    await bootPromise
  } finally {
    bootPromise = null
  }
}

async function switchMode(mode) {
  // 避免与 boot/create 并发：串行等待
  while (bootPromise) {
    await bootPromise
  }
  bootPromise = navigateToMode(mode, { announceLocalFailure: mode === 'local' })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('切换失败', message)
    })
    .finally(() => {
      bootPromise = null
    })
  await bootPromise
}

async function setRemoteUrlInteractive() {
  const settings = loadSettings()
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    buttons: ['使用默认线上地址', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: '远程控制台地址',
    message: '将远程地址设为默认线上控制台？',
    detail: `当前：${settings.remoteUrl}\n\n自定义地址请设置环境变量 HUOHUO_CONSOLE_URL 后重启，或编辑 userData/desktop-settings.json 中的 remoteUrl。`,
  })
  if (response === 0) {
    saveSettings({ remoteUrl: DEFAULT_REMOTE_URL, mode: 'remote' })
    await switchMode('remote')
  }
}

function buildMenu() {
  const settings = loadSettings()
  const mode = settings.mode === 'remote' ? 'remote' : 'local'
  const template = [
    {
      label: '模式',
      submenu: [
        {
          label: '本地（SQLite）',
          type: 'radio',
          checked: mode === 'local',
          click: () => {
            void switchMode('local')
          },
        },
        {
          label: '远程 URL',
          type: 'radio',
          checked: mode === 'remote',
          click: () => {
            void switchMode('remote')
          },
        },
        { type: 'separator' },
        {
          label: '重置远程为线上默认…',
          click: () => {
            void setRemoteUrlInteractive()
          },
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  void boot()
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopLocalServer()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void boot()
})
