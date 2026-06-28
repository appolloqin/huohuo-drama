/**
 * Shared domain literals for Drizzle row fields (TS-only; physical columns unchanged).
 * Use at service/repo boundaries instead of bare `string`.
 */

export type ProjectType = 'drama' | 'novel'

export type UserRole = 'user' | 'admin'

export type GenerationTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'cancelled'

export type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled'

export type StorageKind = 'local' | 'remote' | 'object'

export type AiServiceType = 'text' | 'image' | 'video' | 'audio'

export type LessonVerdict = 'recommend' | 'avoid' | string
