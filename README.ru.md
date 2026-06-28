# Huohuo Drama — открытая AI-платформа для коротких драм и романов

<div align="center">

**Цифровой писатель · Цифровой режиссёр · AI-детекция · Мультиканальные платежи**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [Возможности](#возможности) · [Скриншоты](#скриншоты) · [Быстрый старт](#быстрый-старт) · [Развёртывание](#развёртывание)

</div>

---

## Обзор

**Huohuo Drama** — открытая полнофункциональная платформа для производства **AI-коротких драм** и **AI-романов**. Одно рабочее пространство проводит исходный текст через форматированные сценарии, раскадровку и мультимодальные ассеты до готовых эпизодов — с TTS, покадровым мультиплексированием FFmpeg и экспортом.

Каждый эпизод поддерживает два производственных конвейера — **AI-видео** и **слайд-шоу из кадров** (отдельные рабочие столы, можно запускать параллельно): AI-путь использует image-to-video; кадровый путь собирает сцены из последовательностей ключевых кадров с эффектом Ken Burns в FFmpeg, выравнивает длительность клипа под TTS, добавляет фоновую музыку на сцены без диалога, затем мультиплексирует и объединяет в полный эпизод.

**AI-написание романов:** встроенный **Цифровой писатель** выполняет brief → черновик → проверку согласованности пакетно. **Режим причинно-следственной цепи** включён по умолчанию: каждая глава заканчивается блоком **Change Record**, где каждое изменение состояния должно описывать триггер → процесс → результат. Система сохраняет, внедряет и проверяет эти цепи в последующих главах — вместе с четырёхуровневой памятью непрерывности — чтобы сохранять согласованность персонажей, мира, foreshadowing и межглавной логики на длине романа.

**Роман → короткая драма:** импортируйте главы или полный AI-роман в проект драмы, перепишите в снимаемый сценарий, затем запустите раскадровку и полный видеоконвейер — без повторного ввода между форматами.

Платформа ориентирована на создателей и небольшие команды и продуктизирует написание, производство, проверку качества и биллинг:

| Возможность | Описание |
|------------|-------------|
| **Цифровой писатель** | Пакетное написание глав на сервере: brief → черновик → проверка согласованности; **причинно-следственные** записи изменений в конце главы поддерживают связность длинных сериалов |
| **Цифровой режиссёр** | Пакетное производство эпизодов на сервере: при старте выбор **AI-видео** или **слайд-шоу из кадров**; сценарий → раскадровка → ассеты → мультиплексирование → объединение выполняется в фоне с восстановлением прогресса после обновления страницы |
| **AI-детекция** | Встроенная AI-детекция текста и переписывание «de-AI» (маршрут консоли `/ai-detect`) для публикации, соответствующей требованиям, и полировки |
| **Мультиканальные платежи** | Биллинг на основе кредитов с **Stripe, PayPal, PingPong, WeChat Pay и Alipay** — администраторы включают каналы через переменные окружения и UI настроек |

**Конвейер короткой драмы:** портреты актёров → извлечение сцен → раскадровка → **AI image-to-video** или **слайд-шоу Ken Burns из кадров** → TTS / покадровое мультиплексирование → объединение и экспорт эпизода FFmpeg.

**Конвейер романа:** пакет Цифрового писателя → **причинная цепь** (записи изменений в конце главы + причинный аудит) → внедрение четырёхуровневой памяти → непрерывность с retrieval-augmented подходом.

**Роман → короткая драма:** импорт из проекта романа → переписывание сценария → раскадровка и генерация → экспорт эпизода (то же рабочее пространство, общие проекты).

## Скриншоты

| Вход | Настройки |
|:---:|:---:|
| ![Login — sign in to the workbench](./workbench-data/images/login.jpg) | ![Settings — account, AI services, payments, agents](./workbench-data/images/setting.jpg) |

| AI-детекция | Роман — список глав |
|:---:|:---:|
| ![AI rate detection — text, file, audio, video](./workbench-data/images/ai.jpg) | ![Novel project — volumes and chapter progress](./workbench-data/images/novel1.jpg) |

| Роман — редактор глав | Короткая драма — производственный стол |
|:---:|:---:|
| ![Digital Writer — outline, AI continue, streaming draft](./workbench-data/images/novel_ch.jpg) | ![Digital Director — storyboard, TTS, AI video, per-shot mux](./workbench-data/images/video.jpg) |

### Дополнительные возможности

| Область | Что вы получаете |
|------|----------------|
| Два конвейера | На эпизод: **рабочий стол AI-видео** или **рабочий стол слайд-шоу из кадров**; кадры используют последовательности ключевых кадров + Ken Burns — без кредитов видеомодели |
| Аккаунты | Мультипользовательская аутентификация, JWT, журнал кредитов и история использования |
| Галерея шаблонов | Публикация проектов драм как переиспользуемых шаблонов |
| Библиотека уроков | Подсказки по агентам, постепенно внедряемые в промпты |
| Расширения навыков | Плейбуки `agent-skills/` SKILL.md; загрузка ZIP в Настройках |

### Структура репозитория

```text
workbench/          Nuxt 3 workbench (dev :28555)
workbench-server/  Hono API + Drizzle + Mastra agents (dev :18555)
deploy/            Docker Compose + nginx (консоль + API)
workbench-data/      SQLite DB (по умолчанию) + static media under workbench-data/static/
                     + docs screenshots under workbench-data/images/
agent-skills/      Agent SKILL.md playbooks (uploadable in Settings)
desktop/           Optional Electron shell (hosted console only)
```

---

## Возможности

### Конвейер короткой драмы

- **Актёры и локации** — AI-портреты, загрузки, назначение голосов и предпрослушивание
- **Раскадровка** — Разбивка на кадры, промпты, статичные кадры / последовательности ключевых кадров, разделение и назначение сетки
- **Видео и аудио** — AI image-to-video или слайд-шоу Ken Burns из кадров; TTS (кадровые клипы следуют длительности озвучки), покадровое мультиплексирование FFmpeg, асинхронное объединение эпизода
- **Медиатека** — Локальное хранилище с прогрессом асинхронных заданий

### Агенты Mastra

| Agent id | Роль |
|---|---|
| **`drama_script_formatter`** | Исходная проза → форматированный съёмочный сценарий |
| **`drama_cast_scene_extract`** | Извлечение актёров и локаций |
| **`drama_storyboard_breakdown`** | Сценарий → упорядоченный список кадров |
| **`drama_voice_assign`** | Назначение голосов актёрам |
| **`drama_image_prompt`** | Пакеты промптов для актёров, сцен, кадров сетки |

### Матрица провайдеров

| Модальность | Поставщики |
|---|---|
| **Текст** | OpenAI, Gemini, DeepSeek, GLM, MiniMax, Volcengine, Ali, OpenRouter |
| **Изображение** | OpenAI, Gemini, MiniMax, Volcengine, Ali |
| **Видео** | MiniMax, Volcengine/Seedance, Vidu, Ali |
| **TTS** | MiniMax |

### Режим романа

Длинные проекты используют **четырёхуровневую память непрерывности**: глобальный снимок состояния, хвост предыдущей главы, более ранние резюме и журналы по ключевым словам — всё внедряется с жёсткими лимитами размера, чтобы промпты оставались ограниченными по мере роста числа глав. Пакетное написание поддерживает brief → глава → проверку согласованности; строгий режим может циклически применять локальные исправления до прохождения проверок.

### Пакетные задания на сервере

Задания Цифрового писателя / режиссёра выполняются на сервере после отключения клиента. Требуется вход (JWT). Одно активное задание на драму; прогресс восстанавливается через `GET /api/v1/batch-jobs/active`.

---

## Десктопная оболочка (опционально)

Пакет [`desktop/`](./desktop/) — тонкая Electron-обёртка для размещённой консоли. Локальный API не включается. См. [desktop/README.md](./desktop/README.md).

---

## Быстрый старт

### Требования

| Инструмент | Минимум | Примечания |
|------|---------|-------|
| Node.js | 22+ | Серверы разработки API и Nuxt |
| npm | 9+ | Менеджер пакетов |
| FFmpeg | 4.0+ | **Обязателен** для мультиплексирования/конкатенации |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### Конфигурация

```bash
cp deploy/config.example.yaml deploy/config.yaml   # optional; AI defaults, not DB driver
cp workbench-server/.env.example workbench-server/.env               # authoritative for DB
```

| Переменная | По умолчанию | Назначение |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` or `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | SQLite file |
| `DATABASE_URL` | — | MySQL DSN |
| `DB_AUTO_INIT` | `true` | Auto DDL + seed on boot |
| `PORT` | `18555` | API listen port |

Ключи провайдеров и модели настраиваются в веб-интерфейсе **Настройки**.

### Установка и запуск

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

- Консоль: `http://localhost:28555` (на некоторых Windows-конфигурациях предпочтительнее `localhost`, а не `127.0.0.1`)
- API: `http://localhost:18555/api/v1` (Nuxt dev proxy for `/api` and `/static`)

**Один процесс (локально, как в production):**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**Smoke-проверки:**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### База данных

**SQLite (по умолчанию)** — `workbench-data/huohuo_drama.db` создаётся при первом запуске, когда `DB_AUTO_INIT=true`.

**MySQL** — в `workbench-server/.env`:

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

Заполнение каталога голосов MiniMax после первого запуска: `cd workbench-server && npm run seed:voices`

---

## Развёртывание

### Docker Compose (рекомендуется)

**Консоль + API (SQLite по умолчанию, порт 80):**

```bash
cd deploy
cp .env.example .env   # опционально
docker compose up -d --build
```

Настройте `DB_DRIVER`, `DATABASE_URL`, ключи оплаты и т.д. в `deploy/.env` — см. `deploy/.env.example`.

**Docker + MySQL (удалённый или self-hosted инстанс):**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | Поведение |
|----------------|----------|
| `true` (по умолчанию) | Создание таблиц, добавление колонок, заполнение справочными данными |
| `false` | Только подключение — без автоматического DDL |

### Платежи (кредиты)

Переменные окружения workbench-server: `STRIPE_*`, `PAYPAL_*`, `PINGPONG_*` и т. д., плюс `SITE_URL` (публичный origin для редиректов). Пример webhook: `https://your-domain.com/api/v1/payments/stripe/webhook`. Включите каналы в **Настройки → Платежи** (Stripe / PayPal / PingPong / WeChat / Alipay).

### Ручное развёртывание

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

Смонтируйте `workbench-data/` для БД и `workbench-data/static/` для медиа. Пример Nginx: `deploy/nginx.conf` (консоль на `/console/`).

---

## Технологический стек

| Слой | Выбор |
|-------|---------|
| API | Node.js 22+, Hono |
| БД | Drizzle ORM, SQLite (по умолчанию) или MySQL 8+ через repositories |
| Агенты | Mastra + AI SDK (OpenAI-compatible) |
| Медиа | FFmpeg, Sharp |
| UI | Nuxt 3 SPA, Vue 3, TypeScript |

---

## Часто задаваемые вопросы

**Docker → Ollama на хосте:** Base URL `http://host.docker.internal:11434/v1`; хост должен слушать на `0.0.0.0`. На Linux `docker run` добавьте `--add-host=host.docker.internal:host-gateway`.

**FFmpeg отсутствует:** Установите и проверьте `ffmpeg -version`. Docker-образы включают FFmpeg.

**Workbench не может достучаться до API:** Убедитесь, что workbench-server на `:18555`; dev proxy в `workbench/nuxt.config.ts`.

**Таблицы не созданы:** Установите `DB_AUTO_INIT=true`; проверьте логи на сообщения о подключении SQLite/MySQL.

**MySQL в production:** `DB_DRIVER=mysql` + `DATABASE_URL`; храните `workbench-data/static` на volume.

**API-ключи:** [Портал агрегации моделей](https://proxy-model.hcpzy.com/models)

---

## Участие в разработке

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI: `.github/workflows/workbench-server-ci.yml` (typecheck, проверки слоёв, SQLite/MySQL smoke).
