/** 运行时配置（.env / 各端 manifest 发布前请改为正式域名） */
const trimSlash = (s: string) => s.replace(/\/+$/, '')

export const API_BASE_URL = trimSlash(
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:18555/api/v1',
)

export const WEB_CONSOLE_URL = trimSlash(
  import.meta.env.VITE_WEB_CONSOLE_URL || 'http://127.0.0.1:28555',
)
