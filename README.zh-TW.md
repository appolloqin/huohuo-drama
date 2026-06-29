# Huohuo Drama — 開源 AI 短劇與小說創作平台

<div align="center">

**火火工坊 · 數位作家 · 數位導演 · AI 檢測 · 多支付渠道**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [功能](#功能) · [產品截圖](#產品截圖) · [快速開始](#快速開始) · [部署](#部署)

</div>

---

## 概覽

**Huohuo Drama（火火短劇）** 是一款面向 **AI 短劇製作** 與 **AI 小說連載** 的開源全棧創作平台。在同一工作台內，可將原始文本推進為格式化劇本、分鏡與多模態素材，並完成 TTS 配音、鏡頭合成與整集匯出。

同一集支援 **AI 視頻** 與 **靜幀幻燈片** 兩條製作流水線（獨立工作台，可並行產出）：AI 線走圖生視頻；靜幀線用關鍵幀序列 + FFmpeg Ken Burns 運鏡生成鏡頭，配音時長驅動成片，無台詞鏡頭自動鋪背景音樂，再經合成與拼接匯出整集。

**AI 小說寫作：** 內建 **數位作家**，支援 brief → 正文 → 一致性審校的全自動批量連載；預設啟用 **因果鏈模式**——每章章末附【變更記錄】，狀態變化須寫明「觸發 → 過程 → 結果」，系統拆存並注入後續寫作與審校，配合四層連貫性記憶，解決超百章級長篇的人設、境界、伏筆與章間銜接一致性問題。

**小說一鍵轉短劇：** 可將 AI 小說（按章或全書）直接匯入短劇專案，自動改寫為可拍攝劇本，並銜接分鏡拆解、資產生成與成片匯出，無需在兩套工具間重複錄入。

面向團隊與個人創作者，平台將「寫、拍、檢、付」關鍵環節產品化：

| 能力 | 說明 |
|------|------|
| **數位作家** | 伺服端批量撰寫小說章節：brief → 正文 → 一致性審校；**因果鏈**章末【變更記錄】約束狀態演變，長章連載不斷線 |
| **數位導演** | 伺服端批量推進短劇集數：啟動時可選擇 **AI 視頻** 或 **靜幀動畫** 出片；劇本→分鏡→素材→合成→拼接可後台執行，刷新頁面仍可恢復進度 |
| **AI 檢測** | 內建 AI 文本檢測與去 AI 味改寫（控制台路由 `/ai-detect`），輔助合規發布與人工潤色 |
| **多支付渠道** | 積分計費 + 多通道充值：支援 **Stripe、PayPal、PingPong、微信支付、支付寶** 等，管理員按環境變數與後台開關靈活啟用 |

**短劇流水線：** 角色立繪 → 場景提取 → 分鏡拆解 → **AI 圖生視頻** 或 **靜幀 Ken Burns 幻燈片** → TTS 配音 / 鏡頭合成 → FFmpeg 整集拼接匯出。

**小說流水線：** 數位作家批量撰寫 → **因果鏈**（章末變更記錄 + 因果審校）→ 四層記憶注入 → 檢索增強連貫性。

**小說轉短劇：** 從小說專案匯入章節或全書 → 劇本改寫 → 分鏡與生成 → 成片匯出（同一工作台，專案內容互通）。

## 產品截圖

| 登入 | 設定 |
|:---:|:---:|
| ![登入 — 進入工作台與帳戶設定](./workbench-data/images/login.jpg) | ![設定 — 帳戶、AI 服務、支付、Agent 等](./workbench-data/images/setting.jpg) |

| AI 檢測 | 小說 — 章節列表 |
|:---:|:---:|
| ![AI 率檢測 — 支援文本、檔案、音訊、視頻](./workbench-data/images/ai.jpg) | ![小說專案 — 分卷與章節撰寫進度](./workbench-data/images/novel1.jpg) |

| 小說 — 章節編輯 | 短劇 — 製作工作台 |
|:---:|:---:|
| ![數位作家 — 大綱、AI 續寫、流式正文](./workbench-data/images/novel_ch.jpg) | ![數位導演 — 分鏡、配音、AI 視頻、鏡頭合成](./workbench-data/images/video.jpg) |

### 更多特性

| 模組 | 說明 |
|------|------|
| 雙製作流水線 | 每集可選 **AI 視頻工作台** 或 **靜幀工作台**；靜幀用序列關鍵幀 + Ken Burns，不消耗視頻模型額度 |
| 帳戶體系 | 多使用者登入、JWT 鑑權、積分帳本與消費記錄 |
| 模板廣場 | 將短劇專案發布為可複用模板 |
| 經驗庫 | 按 Agent 累積寫作/生成經驗，逐步注入 prompt |
| 技能擴展 | `agent-skills/` 目錄 SKILL.md，支援設定頁上傳 ZIP |

### 倉庫結構

```text
workbench/          Nuxt 3 工作台（開發端口 :28555）
workbench-server/  Hono API + Drizzle + Mastra Agent（開發端口 :18555）
deploy/            Docker Compose + nginx（控制台 + API）
workbench-data/      SQLite 資料庫（預設）+ 靜態資源 workbench-data/static/
                     + 文件截圖 workbench-data/images/
agent-skills/      Agent SKILL.md 技能包（可在設定頁上傳）
desktop/           可選 Electron 殼（僅開啟線上控制台）
```

---

## 功能

### 短劇生產流水線

- **角色與場景** — AI 立繪、本地上傳、音色分配與試聽
- **分鏡** — 自動拆鏡、提示詞、靜幀 / 關鍵幀序列、宮格切分與鏡頭分配
- **音視頻** — AI 圖生視頻，或靜幀 Ken Burns 幻燈片；TTS（靜幀以配音時長為準）、單鏡頭 FFmpeg 合成、整集非同步拼接
- **素材庫** — 本地儲存，非同步任務進度追蹤

### Mastra Agent

| Agent id | 職責 |
|---|---|
| **`drama_script_formatter`** | 原始文本 → 格式化拍攝劇本 |
| **`drama_cast_scene_extract`** | 角色與場景提取 |
| **`drama_storyboard_breakdown`** | 劇本 → 有序鏡頭列表 |
| **`drama_voice_assign`** | 為角色分配音色 |
| **`drama_image_prompt`** | 角色、場景、宮格幀提示詞包 |

### 模型廠商

| 模態 | 廠商 |
|---|---|
| **文本** | OpenAI、Gemini、DeepSeek、GLM、MiniMax、火山、阿里、OpenRouter |
| **圖像** | OpenAI、Gemini、MiniMax、火山、阿里 |
| **視頻** | MiniMax、火山/Seedance、Vidu、阿里 |
| **TTS** | MiniMax |

### 小說模式

長篇專案採用 **四層連貫性記憶**：全書狀態快照、上一章結尾、更早章節摘要、關鍵詞檢索歷史帳本；注入均有硬上限，章節增多時 prompt 體積仍可控。批量撰寫支援 brief → 正文 → 一致性審校；嚴格模式下可循環局部修正直至通過。

### 伺服端批量任務

數位作家 / 數位導演任務在客戶端斷開後仍在伺服端執行，需登入（JWT）。同一劇集同時僅 1 個進行中任務；刷新頁面後透過 `GET /api/v1/batch-jobs/active` 恢復進度。

---

## 桌面殼（可選）

[`desktop/`](./desktop/) 為輕量 Electron 包裝，開啟託管控制台，**不包含**本地 API。詳見 [desktop/README.md](./desktop/README.md)。

---

## 快速開始

### 環境要求

| 工具 | 最低版本 | 說明 |
|------|---------|------|
| Node.js | 22+ | 執行 API 與 Nuxt 開發服務 |
| npm | 9+ | 套件管理 |
| FFmpeg | 4.0+ | **必需**，用於合成與拼接 |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### 配置

```bash
cp deploy/config.example.yaml deploy/config.yaml   # 可選；AI 預設值，非資料庫驅動開關
cp workbench-server/.env.example workbench-server/.env               # 資料庫以本檔案為準
```

| 變數 | 預設值 | 說明 |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` 或 `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | SQLite 檔案路徑 |
| `DATABASE_URL` | — | MySQL 連線字串 |
| `DB_AUTO_INIT` | `true` | 啟動時自動建表與種子資料 |
| `PORT` | `18555` | API 監聽端口 |

模型 API Key 與廠商配置在 Web **設定** 頁面完成，不寫在 yaml 裡。

### 安裝與執行

```bash
git clone https://github.com/appolloqin/huohuo-drama.git
cd huohuo-drama

cd workbench-server && npm install
cd ../workbench && npm install

# 終端 A
cd workbench-server && npm run dev

# 終端 B
cd workbench && npm run dev
```

- 控制台：`http://localhost:28555`（部分 Windows 環境請用 `localhost`，勿用 `127.0.0.1`）
- API：`http://localhost:18555/api/v1`（Nuxt 開發伺服器代理 `/api` 與 `/static`）

**單進程（本地近似生產）：**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**冒煙測試：**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### 資料庫

**SQLite（預設）** — `DB_AUTO_INIT=true` 時首次啟動建立 `workbench-data/huohuo_drama.db`。

**MySQL** — 在 `workbench-server/.env` 中配置：

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

首次啟動後寫入 MiniMax 音色目錄：`cd workbench-server && npm run seed:voices`

---

## 部署

### Docker Compose（推薦）

**控制台 + API（預設 SQLite，對外端口 80）：**

```bash
cd deploy
cp .env.example .env   # 可選
docker compose up -d --build
```

在 `deploy/.env` 中配置 `DB_DRIVER`、`DATABASE_URL`、支付密鑰等，見 `deploy/.env.example`。

**Docker + MySQL（遠端或自建實例）：**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | 行為 |
|----------------|------|
| `true`（預設） | 建表、補列、寫入參考資料 |
| `false` | 僅連線，不自動執行 DDL |

### 支付（積分充值）

後端環境變數：`STRIPE_*`、`PAYPAL_*`、`PINGPONG_*` 等及 `SITE_URL`（支付回調用的站點根地址）。Webhook 範例：`https://your-domain.com/api/v1/payments/stripe/webhook`。管理員在 **設定 → 支付設定** 中按渠道啟用（Stripe / PayPal / PingPong / 微信 / 支付寶）。

### 手動部署

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

掛載 `workbench-data/` 存放資料庫，`workbench-data/static/` 存放媒體。Nginx 範例：`deploy/nginx.conf`（控制台路徑 `/console/`）。

---

## 技術棧

| 層級 | 選型 |
|-------|---------|
| API | Node.js 22+、Hono |
| 資料庫 | Drizzle ORM，SQLite（預設）或 MySQL 8+（雙驅動 Repository） |
| Agent | Mastra + AI SDK（OpenAI 相容協議） |
| 媒體 | FFmpeg、Sharp |
| 前端 | Nuxt 3 SPA、Vue 3、TypeScript |

---

## 常見問題

**Docker 存取宿主機 Ollama：** Base URL 填 `http://host.docker.internal:11434/v1`；宿主機需監聽 `0.0.0.0`。Linux 下 `docker run` 需加 `--add-host=host.docker.internal:host-gateway`。

**找不到 FFmpeg：** 安裝並執行 `ffmpeg -version` 驗證。Docker 映像已內建 FFmpeg。

**工作台連不上 API：** 確認 workbench-server 在 `:18555` 執行；開發代理見 `workbench/nuxt.config.ts`。

**表未建立：** 設定 `DB_AUTO_INIT=true`；查看日誌中的 SQLite/MySQL 連線資訊。

**生產環境 MySQL：** 配置 `DB_DRIVER=mysql` 與 `DATABASE_URL`；`workbench-data/static` 建議 volume 掛載。

**API Key：** [模型聚合站](https://huo.hcpzy.com/)

---

## 參與貢獻

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI：`.github/workflows/workbench-server-ci.yml`（類型檢查、分層檢查、SQLite/MySQL 冒煙）。
