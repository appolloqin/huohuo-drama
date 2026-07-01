import { API_BASE_URL } from '../config/env'

const TOKEN_KEY = 'huohuo_token'

type ApiEnvelope<T = unknown> = {
  code?: number
  message?: string
  data?: T
}

export function getStoredToken(): string | null {
  try {
    return uni.getStorageSync(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null) {
  if (token) uni.setStorageSync(TOKEN_KEY, token)
  else uni.removeStorageSync(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getStoredToken()
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) header.Authorization = `Bearer ${token}`

  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data: body,
      header,
      success: (res) => {
        const status = res.statusCode || 0
        const json = (res.data || {}) as ApiEnvelope<T>

        if (status === 401) {
          setStoredToken(null)
          reject(new ApiError(json.message || '登录已过期', 401))
          return
        }

        if (status === 409) {
          resolve((json.data ?? json) as T)
          return
        }

        if (status < 200 || status >= 300 || (json.code && json.code >= 400)) {
          reject(new ApiError(json.message || `请求失败 (${status})`, status))
          return
        }

        resolve((json.data ?? json) as T)
      },
      fail: (err) => {
        reject(new ApiError(err.errMsg || '网络错误'))
      },
    })
  })
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Record<string, unknown>) => request<T>('POST', path, body),
  put: <T>(path: string, body?: Record<string, unknown>) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
