import { WEB_CONSOLE_URL } from '../config/env'

export function dramaWebUrl(dramaId: number, subPath = '') {
  const base = `${WEB_CONSOLE_URL}/drama/${dramaId}`
  return subPath ? `${base}/${subPath.replace(/^\//, '')}` : base
}

export function chapterWebUrl(dramaId: number, chapterNumber: number) {
  return `${WEB_CONSOLE_URL}/drama/${dramaId}/chapter/${chapterNumber}`
}

export function openWebConsole(path: string) {
  const url = path.startsWith('http') ? path : `${WEB_CONSOLE_URL}${path.startsWith('/') ? path : `/${path}`}`
  // #ifdef H5
  window.open(url, '_blank')
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: url,
    success: () => {
      uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none', duration: 2500 })
    },
  })
  // #endif
}

export function copyWebLink(path: string) {
  const url = path.startsWith('http') ? path : `${WEB_CONSOLE_URL}${path.startsWith('/') ? path : `/${path}`}`
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '已复制链接', icon: 'success' }),
  })
}
