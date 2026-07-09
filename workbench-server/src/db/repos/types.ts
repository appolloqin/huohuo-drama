import type * as sqliteSchema from '../schema-sqlite.js'

export type {
  AiServiceType,
  BatchJobStatus,
  GenerationTaskStatus,
  LessonVerdict,
  PaymentOrderStatus,
  ProjectType,
  StorageKind,
  UserRole,
} from '../schema-types.js'

export type UserRow = typeof sqliteSchema.users.$inferSelect
export type CreditLogRow = typeof sqliteSchema.creditLogs.$inferSelect
export type DramaRow = typeof sqliteSchema.dramas.$inferSelect
export type EpisodeRow = typeof sqliteSchema.episodes.$inferSelect
export type CharacterRow = typeof sqliteSchema.characters.$inferSelect
export type CharacterFormRow = typeof sqliteSchema.characterForms.$inferSelect
export type SceneRow = typeof sqliteSchema.scenes.$inferSelect
export type PropRow = typeof sqliteSchema.props.$inferSelect
export type AppSettingRow = typeof sqliteSchema.appSettings.$inferSelect
export type GenerationLessonRow = typeof sqliteSchema.generationLessons.$inferSelect
export type StoryboardRow = typeof sqliteSchema.storyboards.$inferSelect
export type VideoMergeRow = typeof sqliteSchema.videoMerges.$inferSelect
export type ImageGenerationRow = typeof sqliteSchema.imageGenerations.$inferSelect
export type VideoGenerationRow = typeof sqliteSchema.videoGenerations.$inferSelect
export type AssetRow = typeof sqliteSchema.assets.$inferSelect
export type AiVoiceRow = typeof sqliteSchema.aiVoices.$inferSelect
export type AiServiceConfigRow = typeof sqliteSchema.aiServiceConfigs.$inferSelect
export type AgentConfigRow = typeof sqliteSchema.agentConfigs.$inferSelect
export type AiServiceProviderRow = typeof sqliteSchema.aiServiceProviders.$inferSelect
export type PaymentOrderRow = typeof sqliteSchema.paymentOrders.$inferSelect
export type PaymentProviderConfigRow = typeof sqliteSchema.paymentProviderConfigs.$inferSelect
export type BatchJobRow = typeof sqliteSchema.batchJobs.$inferSelect

export type DbRunResult = {
  lastInsertRowid: number
  changes?: number
}

export type NewUserInput = {
  username: string
  passwordHash: string
  role: string
  credits: number
  createdAt: string
  updatedAt: string
}

export type NewDramaInput = {
  userId: number
  title: string
  description?: string | null
  genre?: string | null
  projectType: string
  style?: string | null
  tags?: string | null
  metadata?: string | null
  status: string
  isTemplate?: number
  isTemplateOnly?: number
  templateSummary?: string | null
  createdAt: string
  updatedAt: string
}
