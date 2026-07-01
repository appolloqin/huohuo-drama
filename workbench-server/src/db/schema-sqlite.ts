/**
 * 火火短剧 — SQLite 表结构 Drizzle 映射
 *
 * 允许调整：注释文案、分区顺序、TS 字段排列、boolean mode（不影响 SQLite）。
 *
 * 行类型见 repos/types.ts；领域字面量见 schema-types.ts。
 */
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'

export type {
  AiServiceType,
  BatchJobStatus,
  GenerationTaskStatus,
  LessonVerdict,
  PaymentOrderStatus,
  ProjectType,
  StorageKind,
  UserRole,
} from './schema-types.js'

/** 本地账号：username 登录；role 区分权限；credits 控制 AI 生成配额 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  credits: integer('credits').notNull().default(0),
  /** JSON 数组；null = 继承角色导航模块 */
  navModulesOverride: text('nav_modules_override'),
  /** 微信小程序 openid（移动端登录绑定） */
  wechatMpOpenid: text('wechat_mp_openid'),
  wechatUnionid: text('wechat_unionid'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 积分流水：delta 可正可负；balance_after 为变动后余额快照 */
export const creditLogs = sqliteTable('credit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  delta: integer('delta').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reason: text('reason').notNull(),
  serviceType: text('service_type'),
  provider: text('provider'),
  model: text('model'),
  resourceType: text('resource_type'),
  resourceId: integer('resource_id'),
  tokenCount: integer('token_count'),
  tokensEstimated: integer('tokens_estimated', { mode: 'boolean' }),
  createdAt: text('created_at').notNull(),
})

/** 充值订单（Stripe / PayPal 等）；credits 为到账积分数 */
export const paymentOrders = sqliteTable('payment_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  provider: text('provider').notNull(),
  orderNo: text('order_no').notNull().unique(),
  status: text('status').notNull().default('pending'),
  currency: text('currency').notNull().default('usd'),
  amount: integer('amount').notNull(),
  credits: integer('credits').notNull(),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntent: text('stripe_payment_intent'),
  paypalOrderId: text('paypal_order_id'),
  paidAt: text('paid_at'),
  /** JSON 对象；支付回调原文 */
  rawPayload: text('raw_payload'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 各支付渠道开关与密钥配置 */
export const paymentProviderConfigs = sqliteTable('payment_provider_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().unique(),
  enabled: integer('enabled').notNull().default(0),
  /** JSON 对象；渠道密钥等 */
  settings: text('settings'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 键值对形式的全局开关（导航模块、站点参数等） */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * 服务端批量撰写任务（数字作家 / 数字导演）
 * 主键为 UUID 字符串；progress / summary 存 JSON 文本
 */
export const batchJobs = sqliteTable('batch_jobs', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  dramaId: integer('drama_id').notNull(),
  projectType: text('project_type').notNull(),
  dramaTitle: text('drama_title'),
  status: text('status').notNull().default('pending'),
  /** JSON 对象 */
  payload: text('payload'),
  /** JSON 对象 */
  progress: text('progress'),
  summary: text('summary'),
  errorMessage: text('error_message'),
  cancelRequested: integer('cancel_requested').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
})

// ══════════════════════════════════════════════════════════════
// AI 服务、音色目录与 Agent 运行参数
// ══════════════════════════════════════════════════════════════

/** 用户自配的模型接入点（文本 / 图像 / 视频 / 音频）；本表无 deleted_at */
export const aiServiceConfigs = sqliteTable('ai_service_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serviceType: text('service_type').notNull(), // text | image | video | audio
  name: text('name').notNull(),
  provider: text('provider'),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model'),
  endpoint: text('endpoint'),
  queryEndpoint: text('query_endpoint'),
  priority: integer('priority').default(0),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  /** JSON 对象；厂商扩展参数 */
  settings: text('settings'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 设置页展示的厂商预设目录（含默认模型列表） */
export const aiServiceProviders = sqliteTable('ai_service_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  displayName: text('display_name'),
  serviceType: text('service_type').notNull(),
  provider: text('provider').notNull(),
  defaultUrl: text('default_url'),
  /** JSON 数组；预设模型名列表 */
  presetModels: text('preset_models'),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * 「火火一键配置」的可编辑存储。
 *
 */
export const aiPresetConfigs = sqliteTable('ai_preset_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  presetKey: text('preset_key').notNull().unique(), // text | image | video | audio | agent
  serviceType: text('service_type'),                // 对应 ai_service_configs.service_type；agent 行无
  provider: text('provider'),                       // 对应 ai_service_configs.provider；agent 行无
  baseUrl: text('base_url'),                        // 完整 URL（含 /v1 等后缀）；agent 行无
  apiKey: text('api_key'),                          // 每张卡片独立 API Key（agent 行无）；可空
  model: text('model'),                             // 默认模型名；agent 行存 5 个 Agent 共用模型
  label: text('label'),                             // 卡片显示名「文本/图片/视频/音频」
  priority: integer('priority').default(0),         // 写入 ai_service_configs.priority
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 普通用户在「火火一键配置」里自配的 API Key / 模型（Base URL 由平台 preset 锁定） */
export const userAiPresetConfigs = sqliteTable('user_ai_preset_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  presetKey: text('preset_key').notNull(),
  apiKey: text('api_key'),
  model: text('model'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 预置 TTS 音色表（厂商 voice_id + 展示名） */
export const aiVoices = sqliteTable('ai_voices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  voiceId: text('voice_id').notNull().unique(),
  voiceName: text('voice_name').notNull(),
  language: text('language'),
  description: text('description'),
  provider: text('provider').notNull(),
  createdAt: text('created_at').notNull(),
})

/** Mastra Agent 可覆盖项：模型、系统提示词、温度、最大迭代次数 */
export const agentConfigs = sqliteTable('agent_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentType: text('agent_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  model: text('model'),
  systemPrompt: text('system_prompt'),
  systemPromptBlobPath: text('system_prompt_blob_path'),
  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  maxIterations: integer('max_iterations'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

/** 生成经验库：按 project_kind + agent_type 注入推荐/避雷条目 */
export const generationLessons = sqliteTable('generation_lessons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectKind: text('project_kind').notNull().default('all'),
  agentType: text('agent_type'),
  verdict: text('verdict').notNull().default('recommend'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  /** JSON 数组 */
  tags: text('tags'),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

// ══════════════════════════════════════════════════════════════
// 项目（短剧 / 小说）与分集单元
// ══════════════════════════════════════════════════════════════

/** 顶层制作项目；project_type 区分短剧 drama 与小说 novel */
export const dramas = sqliteTable('dramas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre'),
  style: text('style').default('realistic'),
  status: text('status').notNull().default('draft'),
  totalEpisodes: integer('total_episodes').default(1),
  totalDuration: integer('total_duration').default(0),
  thumbnail: text('thumbnail'),
  /** JSON 数组 */
  tags: text('tags'),
  /** JSON 对象 */
  metadata: text('metadata'),
  userId: integer('user_id').notNull(),
  projectType: text('project_type').notNull().default('drama'),
  isTemplate: integer('is_template').default(0),
  isTemplateOnly: integer('is_template_only').default(0),
  templateSummary: text('template_summary'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

/** 分集或小说章节；可绑定本集专用的图像/视频/音频配置 ID */
export const episodes = sqliteTable('episodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dramaId: integer('drama_id').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),
  /** 小说正文（prose）；短剧原始稿 */
  content: text('content'),
  /** 小说本章写作说明（writing brief） */
  scriptContent: text('script_content'),
  /** 短剧格式化剧本 */
  formattedScript: text('formatted_script'),
  contentBlobPath: text('content_blob_path'),
  scriptBlobPath: text('script_blob_path'),
  formattedScriptBlobPath: text('formatted_script_blob_path'),
  description: text('description'),
  duration: integer('duration').default(0),
  status: text('status').default('draft'),
  thumbnail: text('thumbnail'),
  videoUrl: text('video_url'),
  /** JSON 对象 */
  metadata: text('metadata'),
  dramaImageConfigId: integer('drama_image_config_id'),
  dramaVideoConfigId: integer('drama_video_config_id'),
  dramaAudioConfigId: integer('drama_audio_config_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

// ══════════════════════════════════════════════════════════════
// 角色、场景与道具
// ══════════════════════════════════════════════════════════════

/** 项目级角色设定；voice_id 为 TTS 音色 ID */
export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dramaId: integer('drama_id').notNull(),
  name: text('name').notNull(),
  /** 角色定位（主角/配角等）；非 users.role */
  role: text('role'),
  personality: text('personality'),
  appearance: text('appearance'),
  description: text('description'),
  voiceId: text('voice_id'),
  voiceProvider: text('voice_provider'),
  voicePreviewUrl: text('voice_preview_url'),
  imageUrl: text('image_url'),
  /** JSON 数组；参考图路径列表 */
  referenceImages: text('reference_images'),
  seedValue: text('seed_value'),
  sortOrder: integer('sort_order'),
  localPath: text('local_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

/** 可复用场景/布景，含文生图提示词 */
export const scenes = sqliteTable('scenes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dramaId: integer('drama_id').notNull(),
  episodeId: integer('episode_id'),
  location: text('location').notNull(),
  /** 时段描述（如「清晨」）；非时间戳 */
  time: text('time').notNull(),
  prompt: text('prompt').notNull(),
  storyboardCount: integer('storyboard_count').default(1),
  imageUrl: text('image_url'),
  status: text('status').default('pending'),
  localPath: text('local_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

/** 分集与角色的多对多关联 */
export const episodeCharacters = sqliteTable('episode_characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id').notNull(),
  characterId: integer('character_id').notNull(),
  createdAt: text('created_at').notNull(),
})

/** 分集与场景的多对多关联 */
export const episodeScenes = sqliteTable('episode_scenes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id').notNull(),
  sceneId: integer('scene_id').notNull(),
  createdAt: text('created_at').notNull(),
})

/** 项目级手持道具或陈设物 */
export const props = sqliteTable('props', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dramaId: integer('drama_id').notNull(),
  name: text('name').notNull(),
  type: text('type'),
  description: text('description'),
  prompt: text('prompt'),
  imageUrl: text('image_url'),
  /** JSON 数组 */
  referenceImages: text('reference_images'),
  localPath: text('local_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

// ══════════════════════════════════════════════════════════════
// 分镜镜头与出镜角色
// ══════════════════════════════════════════════════════════════

/** 单条时间线镜头：提示词、帧图、原始/合成视频地址等 */
export const storyboards = sqliteTable('storyboards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id').notNull(),
  sceneId: integer('scene_id'),
  storyboardNumber: integer('storyboard_number').notNull(),
  title: text('title'),
  duration: integer('duration').default(0),
  status: text('status').default('pending'),
  location: text('location'),
  /** 时段描述（如「清晨」）；非时间戳 */
  time: text('time'),
  shotType: text('shot_type'),
  angle: text('angle'),
  movement: text('movement'),
  action: text('action'),
  result: text('result'),
  atmosphere: text('atmosphere'),
  dialogue: text('dialogue'),
  dialogueBlobPath: text('dialogue_blob_path'),
  description: text('description'),
  imagePrompt: text('image_prompt'),
  videoPrompt: text('video_prompt'),
  imagePromptBlobPath: text('image_prompt_blob_path'),
  videoPromptBlobPath: text('video_prompt_blob_path'),
  bgmPrompt: text('bgm_prompt'),
  soundEffect: text('sound_effect'),
  composedImage: text('composed_image'),
  firstFrameImage: text('first_frame_image'),
  lastFrameImage: text('last_frame_image'),
  /** JSON 数组 */
  referenceImages: text('reference_images'),
  videoUrl: text('video_url'),
  ttsAudioUrl: text('tts_audio_url'),
  subtitleUrl: text('subtitle_url'),
  composedVideoUrl: text('composed_video_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})

/** 分镜与角色的多对多关联（联合主键） */
export const storyboardCharacters = sqliteTable('storyboard_characters', {
  storyboardId: integer('storyboard_id').notNull(),
  characterId: integer('character_id').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.storyboardId, table.characterId] }),
}))

// ══════════════════════════════════════════════════════════════
// 异步生成任务流水（图像 / 视频 / 集级合并）
// ══════════════════════════════════════════════════════════════

/** 图像生成任务记录（分镜帧、立绘、场景图等） */
export const imageGenerations = sqliteTable('image_generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storyboardId: integer('storyboard_id'),
  dramaId: integer('drama_id'),
  sceneId: integer('scene_id'),
  characterId: integer('character_id'),
  propId: integer('prop_id'),
  imageType: text('image_type'),
  frameType: text('frame_type'),
  provider: text('provider'),
  prompt: text('prompt'),
  negativePrompt: text('negative_prompt'),
  model: text('model'),
  size: text('size'),
  quality: text('quality'),
  style: text('style'),
  steps: integer('steps'),
  cfgScale: real('cfg_scale'),
  seed: integer('seed'),
  /** JSON 数组 */
  referenceImages: text('reference_images'),
  imageUrl: text('image_url'),
  minioUrl: text('minio_url'),
  localPath: text('local_path'),
  /** local | remote | object — 见 StorageKind */
  storageKind: text('storage_kind'),
  storageUri: text('storage_uri'),
  status: text('status').default('pending'),
  taskId: text('task_id'),
  errorMsg: text('error_msg'),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
})

/** 视频片段生成任务记录（按镜头或独立任务） */
export const videoGenerations = sqliteTable('video_generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storyboardId: integer('storyboard_id'),
  dramaId: integer('drama_id'),
  imageGenId: integer('image_gen_id'),
  provider: text('provider'),
  prompt: text('prompt'),
  model: text('model'),
  referenceMode: text('reference_mode'),
  imageUrl: text('image_url'),
  firstFrameUrl: text('first_frame_url'),
  lastFrameUrl: text('last_frame_url'),
  /** JSON 数组 */
  referenceImageUrls: text('reference_image_urls'),
  duration: integer('duration'),
  fps: integer('fps'),
  resolution: text('resolution'),
  aspectRatio: text('aspect_ratio'),
  style: text('style'),
  motionLevel: integer('motion_level'),
  cameraMotion: text('camera_motion'),
  seed: integer('seed'),
  videoUrl: text('video_url'),
  minioUrl: text('minio_url'),
  localPath: text('local_path'),
  /** local | remote | object — 见 StorageKind */
  storageKind: text('storage_kind'),
  storageUri: text('storage_uri'),
  status: text('status').default('pending'),
  taskId: text('task_id'),
  errorMsg: text('error_msg'),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  deletedAt: text('deleted_at'),
})

/** 集级视频合并任务，产出 merged_url */
export const videoMerges = sqliteTable('video_merges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id'),
  dramaId: integer('drama_id'),
  title: text('title'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  mergedUrl: text('merged_url'),
  duration: integer('duration'),
  /** JSON 数组；参与合并的镜头片段元数据 */
  scenes: text('scenes'),
  status: text('status').default('pending'),
  taskId: text('task_id'),
  errorMsg: text('error_msg'),
  motionPipeline: text('motion_pipeline'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  deletedAt: text('deleted_at'),
})

// ══════════════════════════════════════════════════════════════
// 素材库索引
// ══════════════════════════════════════════════════════════════

/** 可检索的媒体索引，指向静态文件或上游生成记录 */
export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dramaId: integer('drama_id'),
  episodeId: integer('episode_id'),
  storyboardId: integer('storyboard_id'),
  storyboardNum: integer('storyboard_num'),
  name: text('name'),
  description: text('description'),
  type: text('type'),
  category: text('category'),
  url: text('url'),
  thumbnailUrl: text('thumbnail_url'),
  localPath: text('local_path'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  duration: integer('duration'),
  format: text('format'),
  imageGenId: integer('image_gen_id'),
  videoGenId: integer('video_gen_id'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  viewCount: integer('view_count').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
})
