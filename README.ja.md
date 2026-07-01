# Huohuo Drama — オープンソース AI ショートドラマ＆小説制作プラットフォーム

<div align="center">

**デジタル作家 · デジタル監督 · AI 検出 · マルチチャネル決済**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [機能](#機能) · [スクリーンショット](#スクリーンショット) · [クイックスタート](#クイックスタート) · [デプロイ](#デプロイ)

</div>

---

## 概要

**Huohuo Drama** は、オープンソースのフルスタック **AI ショートドラマ** および **AI 小説** 制作プラットフォームです。1 つのワークスペースで、生テキストからフォーマット済み脚本、絵コンテ、マルチモーダル素材、TTS、ショット単位の FFmpeg 合成、エピソード書き出しまで一気通貫で進められます。

各エピソードは **AI 動画** と **静止画スライドショー** の 2 本の制作パイプラインに対応（独立したワークベンチで並行実行可能）：AI ルートは画像から動画を生成し、静止画ルートはキーフレーム列 + FFmpeg Ken Burns モーションでショットを構築し、クリップ長を TTS 尺に合わせ、台詞のないショットに BGM を敷き、合成・結合してフルエピソードに仕上げます。

**AI 小説執筆：** 内蔵の **デジタル作家** が brief → 下書き → 整合性レビューをバッチ実行。**因果チェーンモード** はデフォルトで有効：各章末尾に **変更記録** ブロックがあり、状態変化はすべて「トリガー → 過程 → 結果」を明記。システムはこれらのチェーンを保存・注入・監査し、4 層の連続性メモリと組み合わせて、長編規模でもキャラクター、世界観、伏線、章間ロジックの一貫性を保ちます。

**小説 → ショートドラマ：** 章単位または AI 小説全体をドラマプロジェクトにインポートし、撮影可能な脚本へ書き換え、絵コンテ分解と動画パイプライン全工程へ接続——フォーマット間の再入力は不要です。

クリエイターと小規模チーム向けに、執筆・制作・品質チェック・課金の各工程をプロダクト化：

| 機能 | 説明 |
|------|------|
| **デジタル作家** | サーバー側バッチ章執筆：brief → 下書き → 整合性レビュー；章末の **因果チェーン** 変更記録で長編連載の整合性を維持 |
| **デジタル監督** | サーバー側バッチエピソード：開始時に **AI 動画** または **静止画スライドショー** を選択；脚本 → 絵コンテ → 素材 → 合成 → 結合をバックグラウンド実行、更新後も進捗を復元 |
| **AI 検出** | 内蔵 AI テキスト検出と de-AI リライト（コンソールルート `/ai-detect`）で、コンプライアンスに配慮した公開と仕上げを支援 |
| **マルチチャネル決済** | クレジット課金 + **Stripe、PayPal、PingPong、WeChat Pay、Alipay**——管理者は環境変数と設定 UI でチャネルを有効化 |
| **モバイル指令台** | [`mobile-app/`](./mobile-app/) uni-app クライアント（WeChat ミニプログラム / Android / iOS / H5）：プロジェクト選択、バッチ指令送信、タスク進捗確認；WeChat ログイン/決済；Web へのディープリンクで詳細編集 |

**ショートドラマフロー：** キャスト肖像 → シーン抽出 → 絵コンテ → **AI 画像から動画** または **静止画 Ken Burns スライドショー** → TTS / ショット単位合成 → FFmpeg エピソード結合・書き出し。

**小説フロー：** デジタル作家バッチ → **因果チェーン**（章末変更記録 + 因果監査）→ 4 層メモリ注入 → 検索拡張連続性。

**小説 → ショートドラマ：** 小説プロジェクトからインポート → 脚本リライト → 絵コンテ & 生成 → エピソード書き出し（同一ワークスペース、プロジェクト共有）。

**モバイル指令台（[`mobile-app/`](./mobile-app/)）：** Web ワークベンチの軽量 **外出用コンパニオン**——スマホでプロジェクトを選び、デジタル作家/監督のバッチ指令を送信し進捗を確認。章編集・絵コンテ・合成は Web（`workbench`）のまま。1 つの uni-app コードベースで WeChat ミニプログラム、Android、iOS、H5 に対応（開発 `:48555`）。

## スクリーンショット

| ログイン | 設定 |
|:---:|:---:|
| ![ログイン — ワークベンチへサインイン](./workbench-data/images/login.jpg) | ![設定 — アカウント、AI サービス、決済、Agent](./workbench-data/images/setting.jpg) |

| AI 検出 | 小説 — 章一覧 |
|:---:|:---:|
| ![AI 率検出 — テキスト、ファイル、音声、動画](./workbench-data/images/ai.jpg) | ![小説プロジェクト — 巻と章の進捗](./workbench-data/images/novel1.jpg) |

| 小説 — 章エディタ | ショートドラマ — 制作ワークベンチ |
|:---:|:---:|
| ![デジタル作家 — アウトライン、AI 続き、ストリーミング下書き](./workbench-data/images/novel_ch.jpg) | ![デジタル監督 — 絵コンテ、TTS、AI 動画、ショット合成](./workbench-data/images/video.jpg) |

| モバイル — プロジェクト | モバイル — タスク |
|:---:|:---:|
| ![モバイル指令台 — プロジェクト一覧](./workbench-data/images/mobile-project.jpg) | ![モバイル指令台 — バッチタスク進捗](./workbench-data/images/mobile-task.jpg) |

### その他の機能

| 領域 | 内容 |
|------|------|
| デュアルパイプライン | エピソードごと：**AI 動画ワークベンチ** または **静止画スライドショーワークベンチ**；静止画はキーフレーム列 + Ken Burns——動画モデルのクレジット不要 |
| アカウント | マルチユーザー認証、JWT、クレジット台帳と利用履歴 |
| テンプレートギャラリー | ドラマプロジェクトを再利用可能なテンプレートとして公開 |
| レッスンライブラリ | Agent ごとのヒントを時間経過でプロンプトに注入 |
| スキル拡張 | `agent-skills/` の SKILL.md プレイブック；設定で ZIP アップロード |

### リポジトリ構成

```text
workbench/          Nuxt 3 ワークベンチ（開発 :28555）
workbench-server/  Hono API + Drizzle + Mastra agents（開発 :18555）
mobile-app/        uni-app モバイル指令台（H5 開発 :48555）
deploy/            Docker Compose + nginx（コンソール + API）
workbench-data/      SQLite DB（デフォルト）+ 静的メディア workbench-data/static/
                     + ドキュメント用スクリーンショット workbench-data/images/
agent-skills/      Agent SKILL.md プレイブック（設定でアップロード可能）
desktop/           オプション Electron シェル（ホスト型コンソールのみ）
```

---

## 機能

### ショートドラマパイプライン

- **キャスト & ロケーション** — AI 肖像、ローカルアップロード、ボイス割り当てとプレビュー
- **絵コンテ** — ショット分解、プロンプト、静止画 / キーフレーム列、グリッド分割・割り当て
- **動画 & 音声** — AI 画像から動画、または静止画 Ken Burns スライドショー；TTS（静止画クリップは吹き替え尺に追従）、ショット単位 FFmpeg 合成、非同期エピソード結合
- **メディアライブラリ** — ローカルストレージ、非同期ジョブ進捗

### Mastra agents

| Agent id | 役割 |
|---|---|
| **`drama_script_formatter`** | 生の散文 → フォーマット済み撮影脚本 |
| **`drama_cast_scene_extract`** | キャスト + ロケーション抽出 |
| **`drama_storyboard_breakdown`** | 脚本 → 順序付きショットリスト |
| **`drama_voice_assign`** | キャストメンバーへのボイス割り当て |
| **`drama_image_prompt`** | キャスト、シーン、グリッドフレーム用プロンプトパック |

### プロバイダーマトリクス

| モダリティ | ベンダー |
|---|---|
| **Text** | OpenAI, Gemini, DeepSeek, GLM, MiniMax, Volcengine, Ali, OpenRouter |
| **Image** | OpenAI, Gemini, MiniMax, Volcengine, Ali |
| **Video** | MiniMax, Volcengine/Seedance, Vidu, Ali |
| **TTS** | MiniMax |

### 小説モード

長編プロジェクトは **4 層連続性メモリ** を使用：グローバル状態スナップショット、前章末尾、過去章要約、キーワード検索台帳——すべてハード上限付きで注入し、章数増加時もプロンプトサイズを抑制。バッチ執筆は brief → 章 → 整合性チェック；厳格モードではチェック合格までローカル修正をループ可能。

### サーバー側バッチジョブ

デジタル作家 / 監督ジョブはクライアント切断後もサーバーで実行。ログイン（JWT）必須。ドラマあたり 1 つのアクティブジョブ；`GET /api/v1/batch-jobs/active` で進捗復元。

---

## デスクトップシェル（オプション）

[`desktop/`](./desktop/) パッケージは、ホスト型コンソール用の薄い Electron ラッパーです。ローカル API は同梱しません。詳細は [desktop/README.md](./desktop/README.md) を参照。

---

## クイックスタート

### 前提条件

| ツール | 最低要件 | 備考 |
|------|---------|------|
| Node.js | 22+ | API と Nuxt 開発サーバー |
| npm | 9+ | パッケージマネージャー |
| FFmpeg | 4.0+ | 合成/結合に **必須** |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### 設定

```bash
cp deploy/config.example.yaml deploy/config.yaml   # オプション；AI デフォルト、DB ドライバーではない
cp workbench-server/.env.example workbench-server/.env               # DB は本ファイルが正
```

| 変数 | デフォルト | 用途 |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` または `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | SQLite ファイル |
| `DATABASE_URL` | — | MySQL DSN |
| `DB_AUTO_INIT` | `true` | 起動時に DDL + シード |
| `PORT` | `18555` | API 待受ポート |

プロバイダーキーとモデルは Web **設定** UI で構成。

### インストール & 実行

```bash
git clone https://github.com/appolloqin/huohuo-drama.git
cd huohuo-drama

cd workbench-server && npm install
cd ../workbench && npm install

# ターミナル A
cd workbench-server && npm run dev

# ターミナル B
cd workbench && npm run dev
```

- コンソール：`http://localhost:28555`（一部 Windows 環境では `127.0.0.1` より `localhost` を推奨）
- API：`http://localhost:18555/api/v1`（Nuxt 開発プロキシ `/api` と `/static`）

**単一プロセス（ローカル本番相当）：**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**スモークチェック：**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### データベース

**SQLite（デフォルト）** — `DB_AUTO_INIT=true` 時、初回起動で `workbench-data/huohuo_drama.db` を作成。

**MySQL** — `workbench-server/.env` で：

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

初回起動後に MiniMax ボイスをシード：`cd workbench-server && npm run seed:voices`

---

## デプロイ

### Docker Compose（推奨）

**コンソール + API（デフォルト SQLite、ポート 80）：**

```bash
cd deploy
cp .env.example .env   # オプション
docker compose up -d --build
```

`deploy/.env` で `DB_DRIVER`、`DATABASE_URL`、決済キーなどを設定 — `deploy/.env.example` を参照。

**Docker + MySQL（リモートまたは自前インスタンス）：**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | 動作 |
|----------------|------|
| `true`（デフォルト） | テーブル作成、列パッチ、参照データシード |
| `false` | 接続のみ——自動 DDL なし |

### 決済（クレジット）

workbench-server 環境変数：`STRIPE_*`、`PAYPAL_*`、`PINGPONG_*` など、および `SITE_URL`（リダイレクト用公開オリジン）。Webhook 例：`https://your-domain.com/api/v1/payments/stripe/webhook`。**設定 → 決済** でチャネルを有効化（Stripe / PayPal / PingPong / WeChat / Alipay）。

### 手動デプロイ

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

`workbench-data/` を DB 用、`workbench-data/static/` をメディア用にマウント。Nginx サンプル：`deploy/nginx.conf`（コンソール `/console/`）。

---

## 技術スタック

| レイヤー | 選択 |
|-------|---------|
| API | Node.js 22+, Hono |
| DB | Drizzle ORM、SQLite（デフォルト）または MySQL 8+（repository 経由） |
| Agents | Mastra + AI SDK（OpenAI 互換） |
| Media | FFmpeg, Sharp |
| UI | Nuxt 3 SPA, Vue 3, TypeScript |

---

## FAQ

**Docker → ホスト Ollama：** Base URL `http://host.docker.internal:11434/v1`；ホストは `0.0.0.0` で待受。Linux `docker run` では `--add-host=host.docker.internal:host-gateway` を追加。

**FFmpeg 未インストール：** インストールし `ffmpeg -version` で確認。Docker イメージには FFmpeg 同梱。

**ワークベンチが API に接続できない：** workbench-server が `:18555` で起動していることを確認；開発プロキシは `workbench/nuxt.config.ts`。

**テーブル未作成：** `DB_AUTO_INIT=true` を設定；SQLite/MySQL 接続メッセージをログで確認。

**本番 MySQL：** `DB_DRIVER=mysql` + `DATABASE_URL`；`workbench-data/static` はボリュームに保持。

**API キー：** [モデル集約ポータル](https://huo.hcpzy.com/)

---

## コントリビューション

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI：`.github/workflows/workbench-server-ci.yml`（typecheck、レイヤーチェック、SQLite/MySQL スモーク）。
