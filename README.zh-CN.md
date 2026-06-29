# Huohuo Drama — 开源 AI 短剧与小说创作平台

<div align="center">

**火火工坊 · 数字作家 · 数字导演 · AI 检测 · 多支付渠道**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [功能](#功能) · [产品截图](#产品截图) · [快速开始](#快速开始) · [部署](#部署)

</div>

---

## 概览

**Huohuo Drama（火火短剧）** 是一款面向 **AI 短剧制作** 与 **AI 小说连载** 的开源全栈创作平台。在同一工作台内，可将原始文本推进为格式化剧本、分镜与多模态素材，并完成 TTS 配音、镜头合成与整集导出。

同一集支持 **AI 视频** 与 **静帧幻灯片** 两条制作流水线（独立工作台，可并行产出）：AI 线走图生视频；静帧线用关键帧序列 + FFmpeg Ken Burns 运镜生成镜头，配音时长驱动成片，无台词镜头自动铺背景音乐，再经合成与拼接导出整集。

**AI 小说写作：** 内置 **数字作家**，支持 brief → 正文 → 一致性审校的全自动批量连载；默认启用 **因果链模式**——每章章末附【变更记录】，状态变化须写明「触发 → 过程 → 结果」，系统拆存并注入后续写作与审校，配合四层连贯性记忆，解决超百章级长篇的人设、境界、伏笔与章间衔接一致性问题。

**小说一键转短剧：** 可将 AI 小说（按章或全书）直接导入短剧项目，自动改写为可拍摄剧本，并衔接分镜拆解、资产生成与成片导出，无需在两套工具间重复录入。

面向团队与个人创作者，平台将「写、拍、检、付」关键环节产品化：

| 能力 | 说明 |
|------|------|
| **数字作家** | 服务端批量撰写小说章节：brief → 正文 → 一致性审校；**因果链**章末【变更记录】约束状态演变，长章连载不断线 |
| **数字导演** | 服务端批量推进短剧集数：启动时可选择 **AI 视频** 或 **静帧动画** 出片；剧本→分镜→素材→合成→拼接可后台执行，刷新页面仍可恢复进度 |
| **AI 检测** | 内置 AI 文本检测与去 AI 味改写（控制台路由 `/ai-detect`），辅助合规发布与人工润色 |
| **多支付渠道** | 积分计费 + 多通道充值：支持 **Stripe、PayPal、PingPong、微信支付、支付宝** 等，管理员按环境变量与后台开关灵活启用 |

**短剧流水线：** 角色立绘 → 场景提取 → 分镜拆解 → **AI 图生视频** 或 **静帧 Ken Burns 幻灯片** → TTS 配音 / 镜头合成 → FFmpeg 整集拼接导出。

**小说流水线：** 数字作家批量撰写 → **因果链**（章末变更记录 + 因果审校）→ 四层记忆注入 → 检索增强连贯性。

**小说转短剧：** 从小说项目导入章节或全书 → 剧本改写 → 分镜与生成 → 成片导出（同一工作台，项目内容互通）。

## 产品截图

| 登录 | 设置 |
|:---:|:---:|
| ![登录 — 进入工作台与账户设置](./workbench-data/images/login.jpg) | ![设置 — 账户、AI 服务、支付、Agent 等](./workbench-data/images/setting.jpg) |

| AI 检测 | 小说 — 章节列表 |
|:---:|:---:|
| ![AI 率检测 — 支持文本、文件、音频、视频](./workbench-data/images/ai.jpg) | ![小说项目 — 分卷与章节撰写进度](./workbench-data/images/novel1.jpg) |

| 小说 — 章节编辑 | 短剧 — 制作工作台 |
|:---:|:---:|
| ![数字作家 — 大纲、AI 续写、流式正文](./workbench-data/images/novel_ch.jpg) | ![数字导演 — 分镜、配音、AI 视频、镜头合成](./workbench-data/images/video.jpg) |

### 更多特性

| 模块 | 说明 |
|------|------|
| 双制作流水线 | 每集可选 **AI 视频工作台** 或 **静帧工作台**；静帧用序列关键帧 + Ken Burns，不消耗视频模型额度 |
| 账户体系 | 多用户登录、JWT 鉴权、积分账本与消费记录 |
| 模板广场 | 将短剧项目发布为可复用模板 |
| 经验库 | 按 Agent 积累写作/生成经验，逐步注入 prompt |
| 技能扩展 | `agent-skills/` 目录 SKILL.md，支持设置页上传 ZIP |

### 仓库结构

```text
workbench/          Nuxt 3 工作台（开发端口 :28555）
workbench-server/  Hono API + Drizzle + Mastra Agent（开发端口 :18555）
deploy/            Docker Compose + nginx（控制台 + API）
workbench-data/      SQLite 数据库（默认）+ 静态资源 workbench-data/static/
                     + 文档截图 workbench-data/images/
agent-skills/      Agent SKILL.md 技能包（可在设置页上传）
desktop/           可选 Electron 壳（仅打开线上控制台）
```

---

## 功能

### 短剧生产流水线

- **角色与场景** — AI 立绘、本地上传、音色分配与试听
- **分镜** — 自动拆镜、提示词、静帧 / 关键帧序列、宫格切分与镜头分配
- **音视频** — AI 图生视频，或静帧 Ken Burns 幻灯片；TTS（静帧以配音时长为准）、单镜头 FFmpeg 合成、整集异步拼接
- **素材库** — 本地存储，异步任务进度跟踪

### Mastra Agent

| Agent id | 职责 |
|---|---|
| **`drama_script_formatter`** | 原始文本 → 格式化拍摄剧本 |
| **`drama_cast_scene_extract`** | 角色与场景提取 |
| **`drama_storyboard_breakdown`** | 剧本 → 有序镜头列表 |
| **`drama_voice_assign`** | 为角色分配音色 |
| **`drama_image_prompt`** | 角色、场景、宫格帧提示词包 |

### 模型厂商

| 模态 | 厂商 |
|---|---|
| **文本** | OpenAI、Gemini、DeepSeek、GLM、MiniMax、火山、阿里、OpenRouter |
| **图像** | OpenAI、Gemini、MiniMax、火山、阿里 |
| **视频** | MiniMax、火山/Seedance、Vidu、阿里 |
| **TTS** | MiniMax |

### 小说模式

长篇项目采用 **四层连贯性记忆**：全书状态快照、上一章结尾、更早章节摘要、关键词检索历史账本；注入均有硬上限，章节增多时 prompt 体积仍可控。批量撰写支持 brief → 正文 → 一致性审校；严格模式下可循环局部修正直至通过。

### 服务端批量任务

数字作家 / 数字导演任务在客户端断开后仍在服务端运行，需登录（JWT）。同一剧集同时仅 1 个进行中任务；刷新页面后通过 `GET /api/v1/batch-jobs/active` 恢复进度。

---

## 桌面壳（可选）

[`desktop/`](./desktop/) 为轻量 Electron 包装，打开托管控制台，**不包含**本地 API。详见 [desktop/README.md](./desktop/README.md)。

---

## 快速开始

### 环境要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 22+ | 运行 API 与 Nuxt 开发服务 |
| npm | 9+ | 包管理 |
| FFmpeg | 4.0+ | **必需**，用于合成与拼接 |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### 配置

```bash
cp deploy/config.example.yaml deploy/config.yaml   # 可选；AI 默认值，非数据库驱动开关
cp workbench-server/.env.example workbench-server/.env               # 数据库以本文件为准
```

| 变量 | 默认值 | 说明 |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` 或 `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | SQLite 文件路径 |
| `DATABASE_URL` | — | MySQL 连接串 |
| `DB_AUTO_INIT` | `true` | 启动时自动建表与种子数据 |
| `PORT` | `18555` | API 监听端口 |

模型 API Key 与厂商配置在 Web **设置** 页面完成，不写在 yaml 里。

### 安装与运行

```bash
git clone https://github.com/appolloqin/huohuo-drama.git
cd huohuo-drama

cd workbench-server && npm install
cd ../workbench && npm install

# 终端 A
cd workbench-server && npm run dev

# 终端 B
cd workbench && npm run dev
```

- 控制台：`http://localhost:28555`（部分 Windows 环境请用 `localhost`，勿用 `127.0.0.1`）
- API：`http://localhost:18555/api/v1`（Nuxt 开发服务器代理 `/api` 与 `/static`）

**单进程（本地近似生产）：**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**冒烟测试：**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### 数据库

**SQLite（默认）** — `DB_AUTO_INIT=true` 时首次启动创建 `workbench-data/huohuo_drama.db`。

**MySQL** — 在 `workbench-server/.env` 中配置：

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

首次启动后写入 MiniMax 音色目录：`cd workbench-server && npm run seed:voices`

---

## 部署

### Docker Compose（推荐）

**控制台 + API（默认 SQLite，对外端口 80）：**

```bash
cd deploy
cp .env.example .env   # 可选
docker compose up -d --build
```

在 `deploy/.env` 中配置 `DB_DRIVER`、`DATABASE_URL`、支付密钥等，见 `deploy/.env.example`。

**Docker + MySQL（远程或自建实例）：**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | 行为 |
|----------------|------|
| `true`（默认） | 建表、补列、写入参考数据 |
| `false` | 仅连接，不自动执行 DDL |

### 支付（积分充值）

后端环境变量：`STRIPE_*`、`PAYPAL_*`、`PINGPONG_*` 等及 `SITE_URL`（支付回调用的站点根地址）。Webhook 示例：`https://your-domain.com/api/v1/payments/stripe/webhook`。管理员在 **设置 → 支付设置** 中按渠道启用（Stripe / PayPal / PingPong / 微信 / 支付宝）。

### 手动部署

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

挂载 `workbench-data/` 存放数据库，`workbench-data/static/` 存放媒体。Nginx 示例：`deploy/nginx.conf`（控制台路径 `/console/`）。

---

## 技术栈

| 层级 | 选型 |
|-------|---------|
| API | Node.js 22+、Hono |
| 数据库 | Drizzle ORM，SQLite（默认）或 MySQL 8+（双驱动 Repository） |
| Agent | Mastra + AI SDK（OpenAI 兼容协议） |
| 媒体 | FFmpeg、Sharp |
| 前端 | Nuxt 3 SPA、Vue 3、TypeScript |

---

## 常见问题

**Docker 访问宿主机 Ollama：** Base URL 填 `http://host.docker.internal:11434/v1`；宿主机需监听 `0.0.0.0`。Linux 下 `docker run` 需加 `--add-host=host.docker.internal:host-gateway`。

**找不到 FFmpeg：** 安装并执行 `ffmpeg -version` 验证。Docker 镜像已内置 FFmpeg。

**工作台连不上 API：** 确认 workbench-server 在 `:18555` 运行；开发代理见 `workbench/nuxt.config.ts`。

**表未创建：** 设置 `DB_AUTO_INIT=true`；查看日志中的 SQLite/MySQL 连接信息。

**生产环境 MySQL：** 配置 `DB_DRIVER=mysql` 与 `DATABASE_URL`；`workbench-data/static` 建议 volume 挂载。

**API Key：** [模型聚合站](https://huo.hcpzy.com/)

---

## 参与贡献

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI：`.github/workflows/workbench-server-ci.yml`（类型检查、分层检查、SQLite/MySQL 冒烟）。
