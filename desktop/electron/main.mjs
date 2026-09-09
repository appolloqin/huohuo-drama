/**
 * 火火短剧桌面端：默认本地（内嵌 Node + 编译产物 + SQLite + FFmpeg），可切换远程 URL。
 * 不修改 workbench / workbench-server 源码。
 */
import { app, BrowserWindow, Menu, shell, dialog } from 'electron'
import { resolveRemoteConsoleUrl, allowedOriginFor } from './config.mjs'
import { loadSettings, saveSettings, DEFAULT_REMOTE_URL } from './settings.mjs'
import { startLocalServer, stopLocalServer } from './local-server.mjs'

/** @type {BrowserWindow | null} */
let mainWindow = null
let allowedOrigin = ''

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

async function resolveStartUrl() {
  const settings = loadSettings()
  if (settings.mode === 'remote') {
    return resolveRemoteConsoleUrl(settings.remoteUrl)
  }
  const { port } = await startLocalServer()
  return `http://127.0.0.1:${port}/console/`
}

async function createWindow() {
  let startUrl
  try {
    startUrl = await resolveStartUrl()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('本地服务启动失败', `${message}\n\n可在菜单「模式」切换到远程控制台。`)
    saveSettings({ mode: 'remote' })
    startUrl = resolveRemoteConsoleUrl(loadSettings().remoteUrl)
  }

  allowedOrigin = allowedOriginFor(startUrl)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: '火火短剧',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadURL(startUrl)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function switchMode(mode) {
  const settings = saveSettings({ mode })
  if (mode === 'remote') {
    stopLocalServer()
  }
  if (!mainWindow) {
    await createWindow()
    return
  }
  try {
    const url =
      settings.mode === 'remote'
        ? resolveRemoteConsoleUrl(settings.remoteUrl)
        : `http://127.0.0.1:${(await startLocalServer()).port}/console/`
    allowedOrigin = allowedOriginFor(url)
    await mainWindow.loadURL(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('切换失败', message)
  }
}

async function setRemoteUrlInteractive() {
  // Electron 无简单 prompt；用 dialog + 默认值说明，进阶可用自定义窗体
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
  const template = [
    {
      label: '模式',
      submenu: [
        {
          label: '本地（SQLite）',
          type: 'radio',
          checked: settings.mode === 'local',
          click: () => {
            void switchMode('local')
          },
        },
        {
          label: '远程 URL',
          type: 'radio',
          checked: settings.mode === 'remote',
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

app.whenReady().then(async () => {
  buildMenu()
  await createWindow()
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopLocalServer()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
