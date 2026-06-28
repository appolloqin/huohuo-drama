import { defaultTaskLogWriter, redactUrl, sanitizeForLog } from './task-log-writer.js'

export { redactUrl, sanitizeForLog }

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'

export function logTask(scope: string, action: string, meta?: Record<string, unknown>, level: LogLevel = 'INFO') {
  defaultTaskLogWriter.emit(scope, action, meta, level)
}

export function logTaskStart(scope: string, action: string, meta?: Record<string, unknown>) {
  defaultTaskLogWriter.emit(scope, `START ${action}`, meta, 'INFO')
}

export function logTaskProgress(scope: string, action: string, meta?: Record<string, unknown>) {
  defaultTaskLogWriter.emit(scope, action, meta, 'INFO')
}

export function logTaskSuccess(scope: string, action: string, meta?: Record<string, unknown>) {
  defaultTaskLogWriter.emit(scope, `DONE ${action}`, meta, 'SUCCESS')
}

export function logTaskWarn(scope: string, action: string, meta?: Record<string, unknown>) {
  defaultTaskLogWriter.emit(scope, action, meta, 'WARN')
}

export function logTaskError(scope: string, action: string, meta?: Record<string, unknown>) {
  defaultTaskLogWriter.emit(scope, `ERROR ${action}`, meta, 'ERROR')
}

export function logTaskPayload(scope: string, action: string, payload: unknown) {
  defaultTaskLogWriter.emitPayload(scope, action, payload)
}
