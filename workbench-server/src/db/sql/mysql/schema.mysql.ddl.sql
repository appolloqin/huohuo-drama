-- Huohuo Drama — consolidated MySQL schema (25 tables + indexes).
-- Legacy column patches run after table DDL, before the >>> INDEXES section.

CREATE TABLE IF NOT EXISTS dramas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style VARCHAR(64) DEFAULT 'realistic',
    total_episodes INT DEFAULT 1,
    total_duration INT DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata JSON,
    user_id INT NOT NULL,
    project_type VARCHAR(32) NOT NULL DEFAULT 'drama' CHECK (project_type IN ('drama', 'novel')),
    is_template TINYINT(1) DEFAULT 0 CHECK (is_template IN (0, 1)),
    is_template_only TINYINT(1) DEFAULT 0 CHECK (is_template_only IN (0, 1)),
    template_summary TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_dramas_user_updated
    ON dramas (user_id, deleted_at, is_template_only, updated_at);
  CREATE INDEX idx_dramas_project_type_updated
    ON dramas (project_type, deleted_at, updated_at);

  CREATE TABLE IF NOT EXISTS episodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_number INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    formatted_script TEXT,
    content_blob_path TEXT,
    script_blob_path TEXT,
    formatted_script_blob_path TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    drama_image_config_id INT,
    drama_video_config_id INT,
    drama_audio_config_id INT,
    metadata JSON,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_episodes_drama_id ON episodes (drama_id);

  CREATE TABLE IF NOT EXISTS characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    voice_id TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INT,
    local_path TEXT,
    voice_preview_url TEXT,
    voice_provider TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_characters_drama_id ON characters (drama_id);

  CREATE TABLE IF NOT EXISTS character_forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    character_id INT NOT NULL,
    name TEXT NOT NULL,
    appearance TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INT,
    local_path TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_character_forms_drama_id ON character_forms (drama_id);
  CREATE INDEX idx_character_forms_character_id ON character_forms (character_id);

  CREATE TABLE IF NOT EXISTS scenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_id INT,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    storyboard_count INT DEFAULT 1,
    image_url TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    local_path TEXT,
    scene_mode VARCHAR(16) DEFAULT 'backdrop',
    compose_config JSON,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_scenes_drama_id ON scenes (drama_id);

  CREATE TABLE IF NOT EXISTS storyboards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT,
    storyboard_number INT NOT NULL,
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
    duration INT DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    tts_audio_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );

  CREATE TABLE IF NOT EXISTS episode_characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    character_id INT NOT NULL,
    created_at DATETIME(3) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id
    ON episode_characters (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id
    ON episode_characters (character_id);

  CREATE TABLE IF NOT EXISTS episode_scenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT NOT NULL,
    created_at DATETIME(3) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id
    ON episode_scenes (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id
    ON episode_scenes (scene_id);

  CREATE TABLE IF NOT EXISTS episode_props (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    prop_id INT NOT NULL,
    created_at DATETIME(3) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_props_episode_id
    ON episode_props (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_props_prop_id
    ON episode_props (prop_id);

  CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    character_form_id INT,
    PRIMARY KEY (storyboard_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id
    ON storyboard_characters (character_id);

  CREATE TABLE IF NOT EXISTS storyboard_props (
    storyboard_id INT NOT NULL,
    prop_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, prop_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_props_prop_id
    ON storyboard_props (prop_id);

  CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INT DEFAULT 0,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    settings JSON,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models JSON,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_voices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voice_id VARCHAR(128) NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    provider TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL
  );

  -- 「火火一键配置」可编辑存储（MySQL 实现，与 SQLite schema 镜像）。
  -- DB 优先 + env 兜底；详见 schema-mysql.ts 中 aiPresetConfigs 的注释。
  CREATE TABLE IF NOT EXISTS ai_preset_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    preset_key VARCHAR(64) NOT NULL UNIQUE,
    service_type TEXT,
    provider TEXT,
    base_url TEXT,
    api_key TEXT,
    model TEXT,
    label TEXT,
    priority INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_ai_preset_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    preset_key VARCHAR(64) NOT NULL,
    api_key TEXT,
    model TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY uq_user_ai_preset (user_id, preset_key)
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    system_prompt_blob_path TEXT,
    temperature DOUBLE,
    max_tokens INT,
    max_iterations INT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );

  CREATE TABLE IF NOT EXISTS image_generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    scene_id INT,
    character_id INT,
    prop_id INT,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INT,
    cfg_scale DOUBLE,
    seed INT,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    storage_kind VARCHAR(16) CHECK (storage_kind IS NULL OR storage_kind IN ('local', 'remote', 'object')),
    storage_uri TEXT,
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    reference_images TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3)
  );
  -- Showcase picker (`/showcase/media`, `/showcase/industry/:slug`,
  -- sitemap entries) all share this shape: WHERE status='completed'
  -- ORDER BY created_at DESC LIMIT N. Without this composite index every
  -- call scans the full table and re-sorts in memory. The prompt LIKE
  -- filter is not indexed (TEXT LIKE without FULLTEXT would balloon the
  -- index) — it's bounded by the LIMIT and the status index above.
  -- created_at is TEXT (ISO 8601); MySQL B-tree needs a key prefix on
  -- TEXT columns, 32 bytes covers 'YYYY-MM-DDTHH:MM:SS.sssZ' + room.
  CREATE INDEX idx_image_generations_status_created
    ON image_generations (status, created_at);

  CREATE TABLE IF NOT EXISTS video_generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INT,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    duration INT,
    fps INT,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INT,
    camera_motion TEXT,
    seed INT,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    storage_kind VARCHAR(16) CHECK (storage_kind IS NULL OR storage_kind IN ('local', 'remote', 'object')),
    storage_uri TEXT,
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3),
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_video_generations_status_created
    ON video_generations (status, created_at);

  CREATE TABLE IF NOT EXISTS video_merges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT,
    drama_id INT,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    motion_pipeline TEXT,
    scenes JSON,
    merged_url TEXT,
    duration INT,
    task_id TEXT,
    error_msg TEXT,
    created_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3),
    deleted_at DATETIME(3)
  );

  CREATE TABLE IF NOT EXISTS props (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    character_id INT,
    character_form_id INT,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX idx_props_drama_id ON props (drama_id);

  -- Media catalog indexed from completed image/video generations and grid workflow.
  CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    episode_id INT,
    storyboard_id INT,
    storyboard_num INT,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INT,
    mime_type TEXT,
    width INT,
    height INT,
    duration INT,
    format TEXT,
    image_gen_id INT,
    video_gen_id INT,
    is_favorite TINYINT(1) DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credits INT NOT NULL DEFAULT 0 CHECK (credits >= 0),
    nav_modules_override TEXT,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

CREATE TABLE IF NOT EXISTS credit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    delta INT NOT NULL,
    balance_after INT NOT NULL,
    reason TEXT NOT NULL,
    service_type TEXT,
    provider TEXT,
    model TEXT,
    resource_type TEXT,
    resource_id INT,
    token_count INT,
    tokens_estimated TINYINT(1) DEFAULT 0 CHECK (tokens_estimated IN (0, 1)),
    created_at DATETIME(3) NOT NULL
  );

CREATE TABLE IF NOT EXISTS payment_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider TEXT NOT NULL,
    order_no VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    currency VARCHAR(16) NOT NULL DEFAULT 'usd',
    amount INT NOT NULL CHECK (amount >= 0),
    credits INT NOT NULL CHECK (credits >= 0),
    stripe_session_id TEXT,
    stripe_payment_intent TEXT,
    paypal_order_id TEXT,
    paid_at DATETIME(3),
    raw_payload JSON,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

CREATE TABLE IF NOT EXISTS app_settings (
    `key` VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

CREATE TABLE IF NOT EXISTS payment_provider_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(64) NOT NULL UNIQUE,
    enabled TINYINT(1) NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    settings JSON,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
  );

CREATE TABLE IF NOT EXISTS generation_lessons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_kind VARCHAR(32) NOT NULL DEFAULT 'all',
    agent_type VARCHAR(64),
    verdict VARCHAR(32) NOT NULL DEFAULT 'recommend',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3)
  );
  CREATE INDEX IF NOT EXISTS idx_generation_lessons_agent
    ON generation_lessons (project_kind, agent_type, is_active);

  CREATE TABLE IF NOT EXISTS batch_jobs (
    id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    drama_id INT NOT NULL,
    project_type VARCHAR(32) NOT NULL,
    drama_title TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped', 'cancelled')),
    payload JSON,
    progress JSON,
    summary TEXT,
    error_message TEXT,
    cancel_requested TINYINT(1) NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    started_at DATETIME(3),
    finished_at DATETIME(3)
  );
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_status ON batch_jobs (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_drama_status ON batch_jobs (drama_id, status);

-- >>> INDEXES

-- Secondary indexes and uniqueness constraints (P1, MySQL).

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
  ON video_generations (task_id(191));

CREATE INDEX IF NOT EXISTS idx_video_merges_episode
  ON video_merges (episode_id);
CREATE INDEX IF NOT EXISTS idx_video_merges_episode_pipeline
  ON video_merges (episode_id, motion_pipeline(32));

CREATE INDEX IF NOT EXISTS idx_credit_logs_user_created
  ON credit_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_service_configs_type_provider
  ON ai_service_configs (service_type(32), provider(32));

CREATE INDEX IF NOT EXISTS idx_agent_configs_type_deleted
  ON agent_configs (agent_type(64), deleted_at);

CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_paypal
  ON payment_orders (provider(32), paypal_order_id(191));

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
