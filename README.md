# Huohuo Drama — Open-Source AI Studio for Short Drama & Novels

<div align="center">

**Digital Writer · Digital Director · AI Detection · Multi-Channel Payments**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [Capabilities](#capabilities) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [Deployment](#deployment)

</div>

---

## Overview

**Huohuo Drama** is an open-source, full-stack **AI short-drama** and **AI novel** production platform. One workspace takes raw text through formatted scripts, storyboards, and multimodal assets to finished episodes—with TTS, per-shot FFmpeg mux, and export.

Each episode supports two production pipelines—**AI video** and **frame slideshow** (separate workbenches, can run in parallel): the AI path uses image-to-video; the frame path builds shots from keyframe sequences with FFmpeg Ken Burns motion, aligns clip length to TTS duration, adds background music on dialogue-free shots, then muxes and merges into a full episode.

**AI novel writing:** the built-in **Digital Writer** runs brief → draft → consistency review in batch. **Causal-chain mode** is on by default: each chapter ends with a **Change Record** block where every state shift must spell out trigger → process → outcome. The system stores, injects, and audits these chains across later chapters—together with four-layer continuity memory—to keep character, realm, foreshadowing, and cross-chapter logic consistent at novel length.

**Novel → short drama:** import chapters or a full AI novel into a drama project, rewrite into a shootable screenplay, then run storyboard breakdown and the full video pipeline—no retyping between formats.

Built for creators and small teams, the platform productizes writing, production, quality checks, and billing:

| Capability | Description |
|------------|-------------|
| **Digital Writer** | Server-side batch chapters: brief → draft → consistency review; **causal-chain** change records at chapter end keep long serials coherent |
| **Digital Director** | Server-side batch episodes: choose **AI video** or **frame slideshow** at start; script → storyboard → assets → mux → merge runs in the background with progress restore after refresh |
| **AI Detection** | Built-in AI text detection and de-AI rewriting (console route `/ai-detect`) for compliance-friendly publishing and polish |
| **Multi-channel payments** | Credit-based billing with **Stripe, PayPal, PingPong, WeChat Pay, and Alipay**—admins enable channels via env vars and the settings UI |
| **Mobile command station** | [`mobile-app/`](./mobile-app/) uni-app client (WeChat mini program / Android / iOS / H5): pick projects, dispatch batch commands, track job progress; WeChat login & pay; deep-link to Web for detailed editing |

**Short-drama flow:** cast portraits → scene extraction → storyboard → **AI image-to-video** or **frame Ken Burns slideshow** → TTS / per-shot mux → FFmpeg episode merge & export.

**Novel flow:** Digital Writer batch → **causal chain** (chapter-end change records + causal audit) → four-layer memory injection → retrieval-augmented continuity.

**Novel → short drama:** import from a novel project → screenplay rewrite → storyboard & generation → episode export (same workspace, shared projects).

**Mobile command station ([`mobile-app/`](./mobile-app/)):** A lightweight **on-the-go** companion to the Web workbench—select a project, send Digital Writer / Director batch commands, and monitor progress from your phone. Chapter editing, storyboards, and mux stay on Web (`workbench`). One uni-app codebase targets WeChat mini program, Android, iOS, and H5 (dev `:48555`).

## Screenshots

| Login | Settings |
|:---:|:---:|
| ![Login — sign in to the workbench](./workbench-data/images/login.jpg) | ![Settings — account, AI services, payments, agents](./workbench-data/images/setting.jpg) |

| AI detection | Novel — chapter list |
|:---:|:---:|
| ![AI rate detection — text, file, audio, video](./workbench-data/images/ai.jpg) | ![Novel project — volumes and chapter progress](./workbench-data/images/novel1.jpg) |

| Novel — chapter editor | Short drama — production workbench |
|:---:|:---:|
| ![Digital Writer — outline, AI continue, streaming draft](./workbench-data/images/novel_ch.jpg) | ![Digital Director — storyboard, TTS, AI video, per-shot mux](./workbench-data/images/video.jpg) |

| Mobile — projects | Mobile — tasks |
|:---:|:---:|
| ![Mobile command station — project list and quick actions](./workbench-data/images/mobile-project.jpg) | ![Mobile command station — batch job progress](./workbench-data/images/mobile-task.jpg) |

### More features

| Area | What you get |
|------|----------------|
| Dual pipelines | Per episode: **AI video workbench** or **frame slideshow workbench**; frames use keyframe sequences + Ken Burns—no video-model credits |
| Accounts | Multi-user auth, JWT, credit ledger and usage history |
| Template gallery | Publish drama projects as reusable templates |
| Lesson library | Per-agent hints injected into prompts over time |
| Skill extensions | `agent-skills/` SKILL.md playbooks; upload ZIPs in Settings |

### Repository layout

```text
workbench/          Nuxt 3 workbench (dev :28555)
workbench-server/  Hono API + Drizzle + Mastra agents (dev :18555)
mobile-app/        uni-app mobile command station (H5 dev :48555)
deploy/            Docker Compose + nginx (console + API)
workbench-data/      SQLite DB (default) + static media under workbench-data/static/
                     + docs screenshots under workbench-data/images/
agent-skills/      Agent SKILL.md playbooks (uploadable in Settings)
desktop/           Optional Electron shell (hosted console only)
```

---

## Capabilities

### Short drama pipeline

- **Cast & locations** — AI portraits, uploads, voice assignment and preview
- **Storyboard** — Shot breakdown, prompts, stills / keyframe sequences, grid split/assign
- **Video & audio** — AI image-to-video, or frame Ken Burns slideshow; TTS (frame clips follow dub duration), per-shot FFmpeg mux, async episode merge
- **Media library** — Local storage with async job progress

### Mastra agents

| Agent id | Role |
|---|---|
| **`drama_script_formatter`** | Raw prose → formatted shooting script |
| **`drama_cast_scene_extract`** | Cast + location extraction |
| **`drama_storyboard_breakdown`** | Script → ordered shot list |
| **`drama_voice_assign`** | Map voices to cast members |
| **`drama_image_prompt`** | Prompt packs for cast, scenes, grid frames |

### Provider matrix

| Modality | Vendors |
|---|---|
| **Text** | OpenAI, Gemini, DeepSeek, GLM, MiniMax, Volcengine, Ali, OpenRouter |
| **Image** | OpenAI, Gemini, MiniMax, Volcengine, Ali |
| **Video** | MiniMax, Volcengine/Seedance, Vidu, Ali |
| **TTS** | MiniMax |

### Novel mode

Long-form projects use **four-layer continuity memory**: a global state snapshot, previous-chapter tail, earlier summaries, and keyword-retrieved ledgers — all injected with hard size caps so prompts stay bounded as chapter count grows. Batch writing supports brief → chapter → consistency check; strict mode can loop local fixes until checks pass.

### Server-side batch jobs

Digital writer / director jobs run on the server after the client disconnects. Requires login (JWT). One active job per drama; progress restores via `GET /api/v1/batch-jobs/active`.

---

## Desktop shell (optional)

The [`desktop/`](./desktop/) package is a thin Electron wrapper for the hosted console. It does not bundle the local API. See [desktop/README.md](./desktop/README.md).

---

## Quick start

### Prerequisites

| Tool | Minimum | Notes |
|------|---------|-------|
| Node.js | 22+ | API and Nuxt dev servers |
| npm | 9+ | Package manager |
| FFmpeg | 4.0+ | **Required** for mux/concat |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### Configuration

```bash
cp deploy/config.example.yaml deploy/config.yaml   # optional; AI defaults, not DB driver
cp workbench-server/.env.example workbench-server/.env               # authoritative for DB
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` or `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | SQLite file |
| `DATABASE_URL` | — | MySQL DSN |
| `DB_AUTO_INIT` | `true` | Auto DDL + seed on boot |
| `PORT` | `18555` | API listen port |

Provider keys and models are configured in the web **Settings** UI.

### Install & run

```bash
git clone https://github.com/appolloqin/huohuo-drama.git
cd huohuo-drama

cd workbench-server && npm install
cd ../workbench && npm install

# terminal A
cd workbench-server && npm run dev

# terminal B
cd workbench && npm run dev
```

- Console: `http://localhost:28555` (prefer `localhost` over `127.0.0.1` on some Windows setups)
- API: `http://localhost:18555/api/v1` (Nuxt dev proxy for `/api` and `/static`)

**Single process (production-like locally):**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**Smoke checks:**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### Database

**SQLite (default)** — `workbench-data/huohuo_drama.db` created on first boot when `DB_AUTO_INIT=true`.

**MySQL** — in `workbench-server/.env`:

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

Seed MiniMax voices after first boot: `cd workbench-server && npm run seed:voices`

---

## Deployment

### Docker Compose (recommended)

**Console + API (default SQLite, port 80):**

```bash
cd deploy
cp .env.example .env   # optional
docker compose up -d --build
```

Set `DB_DRIVER`, `DATABASE_URL`, payment keys, etc. in `deploy/.env` — see `deploy/.env.example`.

**Docker + MySQL (remote or self-hosted instance):**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | Behavior |
|----------------|----------|
| `true` (default) | Create tables, patch columns, seed reference data |
| `false` | Connect only — no automatic DDL |

### Payments (credits)

Workbench-server env: `STRIPE_*`, `PAYPAL_*`, `PINGPONG_*`, etc., plus `SITE_URL` (public origin for redirects). Webhook example: `https://your-domain.com/api/v1/payments/stripe/webhook`. Enable channels in **Settings → Payments** (Stripe / PayPal / PingPong / WeChat / Alipay).

### Manual deploy

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

Mount `workbench-data/` for DB and `workbench-data/static/` for media. Nginx sample: `deploy/nginx.conf` (console at `/console/`).

---

## Technology stack

| Layer | Choices |
|-------|---------|
| API | Node.js 22+, Hono |
| DB | Drizzle ORM, SQLite (default) or MySQL 8+ via repositories |
| Agents | Mastra + AI SDK (OpenAI-compatible) |
| Media | FFmpeg, Sharp |
| UI | Nuxt 3 SPA, Vue 3, TypeScript |

---

## FAQ

**Docker → host Ollama:** Base URL `http://host.docker.internal:11434/v1`; host must listen on `0.0.0.0`. On Linux `docker run`, add `--add-host=host.docker.internal:host-gateway`.

**FFmpeg missing:** Install and verify `ffmpeg -version`. Docker images include FFmpeg.

**Workbench cannot reach API:** Ensure workbench-server is on `:18555`; dev proxy is in `workbench/nuxt.config.ts`.

**Tables not created:** Set `DB_AUTO_INIT=true`; check logs for SQLite/MySQL connection messages.

**Production MySQL:** `DB_DRIVER=mysql` + `DATABASE_URL`; keep `workbench-data/static` on a volume.

**API keys:** [Model aggregation portal](https://huo.hcpzy.com/)

---

## Contributing

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI: `.github/workflows/workbench-server-ci.yml` (typecheck, layer checks, SQLite/MySQL smoke).
