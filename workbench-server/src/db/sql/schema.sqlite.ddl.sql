-- Huohuo Drama — consolidated SQLite schema (25 tables + indexes).
-- Legacy column patches run after table DDL, before the >>> INDEXES section.

  CREATE TABLE IF NOT EXISTS dramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style TEXT DEFAULT 'realistic',
    total_episodes INTEGER DEFAULT 1,
    total_duration INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags JSON CHECK (tags IS NULL OR json_valid(tags)),
    metadata JSON CHECK (metadata IS NULL OR json_valid(metadata)),
    user_id INTEGER NOT NULL,
    project_type TEXT NOT NULL DEFAULT 'drama' CHECK (project_type IN ('drama', 'novel')),
    is_template INTEGER DEFAULT 0 CHECK (is_template IN (0, 1)),
    is_template_only INTEGER DEFAULT 0 CHECK (is_template_only IN (0, 1)),
    template_summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  -- Home project list filters by user_id+deleted_at+is_template_only and orders
  -- by updated_at desc. Without this composite index every "获取项目" call
  -- scans the entire dramas table.
  CREATE INDEX IF NOT EXISTS idx_dramas_user_updated
    ON dramas (user_id, deleted_at, is_template_only, updated_at);
  -- Novel import-sources picker filters by project_type='novel' and joins
  -- templates via is_template=1; this composite keeps the picker fast.
  CREATE INDEX IF NOT EXISTS idx_dramas_project_type_updated
    ON dramas (project_type, deleted_at, updated_at);

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    formatted_script TEXT,
    content_blob_path TEXT,
    script_blob_path TEXT,
    formatted_script_blob_path TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    drama_image_config_id INTEGER,
    drama_video_config_id INTEGER,
    drama_audio_config_id INTEGER,
    metadata JSON CHECK (metadata IS NULL OR json_valid(metadata)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  -- All batch lookups (buildProjectListItems, listEpisodeStatsRows, etc.) hit
  -- episodes.drama_id; without an index SQLite falls back to a full scan.
  CREATE INDEX IF NOT EXISTS idx_episodes_drama_id ON episodes (drama_id);

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    voice_id TEXT,
    image_url TEXT,
    reference_images JSON CHECK (reference_images IS NULL OR json_valid(reference_images)),
    seed_value TEXT,
    sort_order INTEGER,
    local_path TEXT,
    voice_preview_url TEXT,
    voice_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_characters_drama_id ON characters (drama_id);

  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_id INTEGER,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    storyboard_count INTEGER DEFAULT 1,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scenes_drama_id ON scenes (drama_id);

  CREATE TABLE IF NOT EXISTS storyboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER,
    storyboard_number INTEGER NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    image_prompt_blob_path TEXT,
    video_prompt_blob_path TEXT,
    dialogue_blob_path TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images JSON CHECK (reference_images IS NULL OR json_valid(reference_images)),
    video_url TEXT,
    tts_audio_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episode_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id
    ON episode_characters (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id
    ON episode_characters (character_id);

  CREATE TABLE IF NOT EXISTS episode_scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id
    ON episode_scenes (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id
    ON episode_scenes (scene_id);

  CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id
    ON storyboard_characters (character_id);

  CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    settings JSON CHECK (settings IS NULL OR json_valid(settings)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models JSON CHECK (preset_models IS NULL OR json_valid(preset_models)),
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id TEXT NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- 「火火一键配置」可编辑存储：DB 优先，env 兜底；详见 schema-sqlite.ts
  -- aiPresetConfigs 的注释。每次启动 DDL 幂等建表，重复执行无副作用。
  CREATE TABLE IF NOT EXISTS ai_preset_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preset_key TEXT NOT NULL UNIQUE,        -- text | image | video | audio | agent
    service_type TEXT,                       -- 对应 ai_service_configs.service_type；agent 行无
    provider TEXT,                           -- 对应 ai_service_configs.provider；agent 行无
    base_url TEXT,                           -- 完整 URL（含 /v1 等后缀）；agent 行无
    api_key TEXT,                            -- 每张卡片独立 API Key（agent 行无）；可空
    model TEXT,                              -- 默认模型名；agent 行存 5 个 Agent 共用模型
    label TEXT,                              -- 卡片显示名「文本/图片/视频/音频」
    priority INTEGER DEFAULT 0,              -- 写入 ai_service_configs.priority
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_ai_preset_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    preset_key TEXT NOT NULL,
    api_key TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, preset_key)
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    system_prompt_blob_path TEXT,
    temperature REAL,
    max_tokens INTEGER,
    max_iterations INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS image_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    prop_id INTEGER,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INTEGER,
    cfg_scale REAL,
    seed INTEGER,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    storage_kind TEXT CHECK (storage_kind IS NULL OR storage_kind IN ('local', 'remote', 'object')),
    storage_uri TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    reference_images JSON CHECK (reference_images IS NULL OR json_valid(reference_images)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );
  -- Showcase picker (`/showcase/media`, `/showcase/industry/:slug`,
  -- sitemap entries) all share this shape: WHERE status='completed'
  -- ORDER BY created_at DESC LIMIT N. Without this composite index every
  -- call scans the full table and re-sorts in memory. The prompt LIKE
  -- filter is not indexed (TEXT LIKE without trigram/FTS would balloon
  -- the index) — it's bounded by the LIMIT and the status index above.
  CREATE INDEX IF NOT EXISTS idx_image_generations_status_created
    ON image_generations (status, created_at);

  CREATE TABLE IF NOT EXISTS video_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INTEGER,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls JSON CHECK (reference_image_urls IS NULL OR json_valid(reference_image_urls)),
    duration INTEGER,
    fps INTEGER,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INTEGER,
    camera_motion TEXT,
    seed INTEGER,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    storage_kind TEXT CHECK (storage_kind IS NULL OR storage_kind IN ('local', 'remote', 'object')),
    storage_uri TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );
  -- Same rationale as image_generations: every showcase picker filters
  -- by status='completed' and orders by created_at DESC. Without this
  -- index the picker is a full-table scan + in-memory sort.
  CREATE INDEX IF NOT EXISTS idx_video_generations_status_created
    ON video_generations (status, created_at);

  CREATE TABLE IF NOT EXISTS video_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    drama_id INTEGER,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    motion_pipeline TEXT,
    scenes JSON CHECK (scenes IS NULL OR json_valid(scenes)),
    merged_url TEXT,
    duration INTEGER,
    task_id TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images JSON CHECK (reference_images IS NULL OR json_valid(reference_images)),
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  -- Media catalog indexed from completed image/video generations and grid workflow.
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    storyboard_num INTEGER,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    format TEXT,
    image_gen_id INTEGER,
    video_gen_id INTEGER,
    is_favorite INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    nav_modules_override JSON CHECK (nav_modules_override IS NULL OR json_valid(nav_modules_override)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS credit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    service_type TEXT,
    provider TEXT,
    model TEXT,
    resource_type TEXT,
    resource_id INTEGER,
    token_count INTEGER,
    tokens_estimated INTEGER DEFAULT 0 CHECK (tokens_estimated IN (0, 1)),
    created_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    order_no TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    currency TEXT NOT NULL DEFAULT 'usd',
    amount INTEGER NOT NULL CHECK (amount >= 0),
    credits INTEGER NOT NULL CHECK (credits >= 0),
    stripe_session_id TEXT,
    stripe_payment_intent TEXT,
    paypal_order_id TEXT,
    paid_at TEXT,
    raw_payload JSON CHECK (raw_payload IS NULL OR json_valid(raw_payload)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS payment_provider_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    settings JSON CHECK (settings IS NULL OR json_valid(settings)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS generation_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_kind TEXT NOT NULL DEFAULT 'all',
    agent_type TEXT,
    verdict TEXT NOT NULL DEFAULT 'recommend',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags JSON CHECK (tags IS NULL OR json_valid(tags)),
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_generation_lessons_agent
    ON generation_lessons (project_kind, agent_type, is_active);

  CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    drama_id INTEGER NOT NULL,
    project_type TEXT NOT NULL,
    drama_title TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped', 'cancelled')),
    payload JSON CHECK (payload IS NULL OR json_valid(payload)),
    progress JSON CHECK (progress IS NULL OR json_valid(progress)),
    summary TEXT,
    error_message TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_status ON batch_jobs (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_drama_status ON batch_jobs (drama_id, status);

-- >>> INDEXES

-- Secondary indexes and uniqueness constraints (P1).
-- Applied after legacy column patches so all referenced columns exist.

CREATE INDEX IF NOT EXISTS idx_storyboards_episode_deleted_number
  ON storyboards (episode_id, deleted_at, storyboard_number);

CREATE INDEX IF NOT EXISTS idx_episodes_drama_deleted
  ON episodes (drama_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_image_generations_storyboard
  ON image_generations (storyboard_id);
CREATE INDEX IF NOT EXISTS idx_image_generations_drama
  ON image_generations (drama_id);

CREATE INDEX IF NOT EXISTS idx_video_generations_storyboard
  ON video_generations (storyboard_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_drama
  ON video_generations (drama_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_generations_task_id
  ON video_generations (task_id);

CREATE INDEX IF NOT EXISTS idx_video_merges_episode
  ON video_merges (episode_id);
CREATE INDEX IF NOT EXISTS idx_video_merges_episode_pipeline
  ON video_merges (episode_id, motion_pipeline);

CREATE INDEX IF NOT EXISTS idx_credit_logs_user_created
  ON credit_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_service_configs_type_provider
  ON ai_service_configs (service_type, provider);

CREATE INDEX IF NOT EXISTS idx_agent_configs_type_deleted
  ON agent_configs (agent_type, deleted_at);

CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_paypal
  ON payment_orders (provider, paypal_order_id);

CREATE INDEX IF NOT EXISTS idx_props_drama
  ON props (drama_id);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status_created
  ON batch_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_assets_drama
  ON assets (drama_id);
CREATE INDEX IF NOT EXISTS idx_assets_image_gen
  ON assets (image_gen_id);
CREATE INDEX IF NOT EXISTS idx_assets_video_gen
  ON assets (video_gen_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_episode_characters_unique
  ON episode_characters (episode_id, character_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_episode_scenes_unique
  ON episode_scenes (episode_id, scene_id);
