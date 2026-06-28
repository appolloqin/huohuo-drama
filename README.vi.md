# Huohuo Drama — Nền tảng mã nguồn mở AI cho phim ngắn & tiểu thuyết

<div align="center">

**Nhà văn số · Đạo diễn số · Phát hiện AI · Thanh toán đa kênh**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [Tính năng](#tính-năng) · [Ảnh chụp màn hình](#ảnh-chụp-màn-hình) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Triển khai](#triển-khai)

</div>

---

## Tổng quan

**Huohuo Drama** là nền tảng mã nguồn mở full-stack cho **sản xuất phim ngắn AI** và **viết tiểu thuyết AI**. Một không gian làm việc đưa văn bản thô qua kịch bản định dạng, storyboard và tài nguyên đa phương tiện đến tập phim hoàn chỉnh — kèm TTS, ghép từng cảnh bằng FFmpeg và xuất bản.

Mỗi tập hỗ trợ hai quy trình sản xuất — **video AI** và **trình chiếu khung hình tĩnh** (bàn làm việc riêng, có thể chạy song song): đường AI dùng image-to-video; đường khung hình tĩnh xây cảnh từ chuỗi keyframe với hiệu ứng Ken Burns của FFmpeg, căn độ dài clip theo TTS, thêm nhạc nền ở cảnh không thoại, rồi ghép và nối thành tập đầy đủ.

**Viết tiểu thuyết AI:** **Nhà văn số** tích hợp sẵn chạy brief → bản nháp → rà soát nhất quán theo lô. **Chế độ chuỗi nhân quả** bật mặc định: cuối mỗi chương có khối **Change Record** (Bản ghi thay đổi), mọi biến động trạng thái phải ghi rõ kích hoạt → quá trình → kết quả. Hệ thống lưu, tiêm và kiểm tra các chuỗi này qua các chương sau — cùng bộ nhớ liên tục bốn lớp — để giữ nhân vật, cảnh giới, foreshadowing và logic liên chương nhất quán ở quy mô tiểu thuyết dài.

**Tiểu thuyết → phim ngắn:** nhập chương hoặc toàn bộ tiểu thuyết AI vào dự án phim ngắn, viết lại thành kịch bản có thể quay, rồi chạy phân cảnh storyboard và toàn bộ pipeline video — không cần gõ lại giữa các định dạng.

Dành cho creator và nhóm nhỏ, nền tảng sản phẩm hóa viết, sản xuất, kiểm tra chất lượng và thanh toán:

| Khả năng | Mô tả |
|------------|-------------|
| **Nhà văn số** | Viết chương theo lô phía server: brief → bản nháp → rà soát nhất quán; **chuỗi nhân quả** với bản ghi thay đổi cuối chương giữ serial dài mạch lạc |
| **Đạo diễn số** | Tiến tập theo lô phía server: chọn **video AI** hoặc **trình chiếu khung hình tĩnh** khi bắt đầu; kịch bản → storyboard → tài nguyên → ghép → nối chạy nền, khôi phục tiến độ sau khi refresh |
| **Phát hiện AI** | Phát hiện văn bản AI và viết lại bỏ dấu AI tích hợp sẵn (route console `/ai-detect`) cho xuất bản tuân thủ và chỉnh sửa |
| **Thanh toán đa kênh** | Tính phí theo tín dụng với **Stripe, PayPal, PingPong, WeChat Pay và Alipay** — admin bật kênh qua biến môi trường và UI cài đặt |

**Luồng phim ngắn:** chân dung cast → trích xuất cảnh → storyboard → **AI image-to-video** hoặc **trình chiếu Ken Burns khung hình tĩnh** → TTS / ghép từng cảnh → nối & xuất tập bằng FFmpeg.

**Luồng tiểu thuyết:** Nhà văn số theo lô → **chuỗi nhân quả** (bản ghi thay đổi cuối chương + kiểm tra nhân quả) → tiêm bộ nhớ bốn lớp → liên tục tăng cường truy xuất.

**Tiểu thuyết → phim ngắn:** nhập từ dự án tiểu thuyết → viết lại kịch bản → storyboard & sinh tài nguyên → xuất tập (cùng workspace, dự án dùng chung).

## Ảnh chụp màn hình

| Đăng nhập | Cài đặt |
|:---:|:---:|
| ![Đăng nhập — đăng nhập vào workbench](./workbench-data/images/login.jpg) | ![Cài đặt — tài khoản, dịch vụ AI, thanh toán, agent](./workbench-data/images/setting.jpg) |

| Phát hiện AI | Tiểu thuyết — danh sách chương |
|:---:|:---:|
| ![Phát hiện tỷ lệ AI — văn bản, tệp, âm thanh, video](./workbench-data/images/ai.jpg) | ![Dự án tiểu thuyết — tập và tiến độ chương](./workbench-data/images/novel1.jpg) |

| Tiểu thuyết — trình soạn chương | Phim ngắn — workbench sản xuất |
|:---:|:---:|
| ![Nhà văn số — dàn ý, AI tiếp tục, bản nháp streaming](./workbench-data/images/novel_ch.jpg) | ![Đạo diễn số — storyboard, TTS, video AI, ghép từng cảnh](./workbench-data/images/video.jpg) |

### Thêm tính năng

| Khu vực | Bạn nhận được |
|------|----------------|
| Hai pipeline | Mỗi tập: **workbench video AI** hoặc **workbench trình chiếu khung hình tĩnh**; khung hình tĩnh dùng chuỗi keyframe + Ken Burns — không tiêu tín dụng mô hình video |
| Tài khoản | Xác thực đa người dùng, JWT, sổ cái tín dụng và lịch sử sử dụng |
| Thư viện mẫu | Xuất bản dự án phim ngắn thành mẫu tái sử dụng |
| Thư viện kinh nghiệm | Gợi ý theo agent được tiêm vào prompt theo thời gian |
| Mở rộng skill | Playbook SKILL.md trong `agent-skills/`; tải ZIP lên trong Cài đặt |

### Cấu trúc repository

```text
workbench/          Nuxt 3 workbench (dev :28555)
workbench-server/  Hono API + Drizzle + Mastra agents (dev :18555)
deploy/            Docker Compose + nginx (console + API)
workbench-data/      SQLite DB (default) + static media under workbench-data/static/
                     + docs screenshots under workbench-data/images/
agent-skills/      Agent SKILL.md playbooks (uploadable in Settings)
desktop/           Optional Electron shell (hosted console only)
```

---

## Tính năng

### Quy trình phim ngắn

- **Cast & bối cảnh** — Chân dung AI, tải lên, gán giọng và nghe thử
- **Storyboard** — Phân cảnh, prompt, still / chuỗi keyframe, cắt/lắp lưới
- **Video & âm thanh** — AI image-to-video, hoặc trình chiếu Ken Burns khung hình tĩnh; TTS (clip khung hình tĩnh theo thời lượng lồng tiếng), ghép FFmpeg từng cảnh, nối tập bất đồng bộ
- **Thư viện media** — Lưu trữ cục bộ với tiến độ job bất đồng bộ

### Mastra agents

| Agent id | Vai trò |
|---|---|
| **`drama_script_formatter`** | Văn xuôi thô → kịch bản quay đã định dạng |
| **`drama_cast_scene_extract`** | Trích xuất cast + bối cảnh |
| **`drama_storyboard_breakdown`** | Kịch bản → danh sách cảnh có thứ tự |
| **`drama_voice_assign`** | Gán giọng cho thành viên cast |
| **`drama_image_prompt`** | Gói prompt cho cast, cảnh, khung lưới |

### Ma trận nhà cung cấp

| Phương thức | Nhà cung cấp |
|---|---|
| **Văn bản** | OpenAI, Gemini, DeepSeek, GLM, MiniMax, Volcengine, Ali, OpenRouter |
| **Hình ảnh** | OpenAI, Gemini, MiniMax, Volcengine, Ali |
| **Video** | MiniMax, Volcengine/Seedance, Vidu, Ali |
| **TTS** | MiniMax |

### Chế độ tiểu thuyết

Dự án dài dùng **bộ nhớ liên tục bốn lớp**: ảnh chụp trạng thái toàn cục, đuôi chương trước, tóm tắt chương sớm hơn và sổ cái truy xuất theo từ khóa — tất cả được tiêm với giới hạn kích thước cứng để prompt có biên khi số chương tăng. Viết theo lô hỗ trợ brief → chương → kiểm tra nhất quán; chế độ nghiêm có thể lặp sửa cục bộ đến khi qua kiểm tra.

### Tác vụ batch phía server

Job Nhà văn số / Đạo diễn số chạy trên server sau khi client ngắt kết nối. Yêu cầu đăng nhập (JWT). Một job đang chạy cho mỗi drama; khôi phục tiến độ qua `GET /api/v1/batch-jobs/active`.

---

## Shell desktop (tùy chọn)

Gói [`desktop/`](./desktop/) là lớp bọc Electron mỏng cho console được host. Không đóng gói API cục bộ. Xem [desktop/README.md](./desktop/README.md).

---

## Bắt đầu nhanh

### Yêu cầu

| Công cụ | Tối thiểu | Ghi chú |
|------|---------|-------|
| Node.js | 22+ | API và dev server Nuxt |
| npm | 9+ | Trình quản lý gói |
| FFmpeg | 4.0+ | **Bắt buộc** cho ghép/nối |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### Cấu hình

```bash
cp deploy/config.example.yaml deploy/config.yaml   # optional; AI defaults, not DB driver
cp workbench-server/.env.example workbench-server/.env               # authoritative for DB
```

| Biến | Mặc định | Mục đích |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` hoặc `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | Tệp SQLite |
| `DATABASE_URL` | — | DSN MySQL |
| `DB_AUTO_INIT` | `true` | DDL + seed tự động khi khởi động |
| `PORT` | `18555` | Cổng lắng nghe API |

Khóa nhà cung cấp và mô hình cấu hình trong UI **Cài đặt** trên web.

### Cài đặt & chạy

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

- Console: `http://localhost:28555` (nên dùng `localhost` thay vì `127.0.0.1` trên một số thiết lập Windows)
- API: `http://localhost:18555/api/v1` (proxy dev Nuxt cho `/api` và `/static`)

**Một tiến trình (giống production cục bộ):**

```bash
cd workbench && npm run generate
cd ../workbench-server && npm start
# → http://localhost:18555
```

**Kiểm tra smoke:**

```bash
cd workbench-server && npm run smoke:flow
cd ../workbench && npm run smoke:proxy
```

### Cơ sở dữ liệu

**SQLite (mặc định)** — `workbench-data/huohuo_drama.db` được tạo khi khởi động lần đầu khi `DB_AUTO_INIT=true`.

**MySQL** — trong `workbench-server/.env`:

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

Gieo giọng MiniMax sau lần khởi động đầu: `cd workbench-server && npm run seed:voices`

---

## Triển khai

### Docker Compose (khuyến nghị)

**Console + API (SQLite mặc định, cổng 80):**

```bash
cd deploy
cp .env.example .env   # tùy chọn
docker compose up -d --build
```

Cấu hình `DB_DRIVER`, `DATABASE_URL`, khóa thanh toán… trong `deploy/.env` — xem `deploy/.env.example`.

**Docker + MySQL (instance từ xa hoặc tự host):**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | Hành vi |
|----------------|----------|
| `true` (mặc định) | Tạo bảng, vá cột, gieo dữ liệu tham chiếu |
| `false` | Chỉ kết nối — không DDL tự động |

### Thanh toán (tín dụng)

Env workbench-server: `STRIPE_*`, `PAYPAL_*`, `PINGPONG_*`, v.v., cùng `SITE_URL` (origin công khai cho redirect). Ví dụ webhook: `https://your-domain.com/api/v1/payments/stripe/webhook`. Bật kênh trong **Cài đặt → Thanh toán** (Stripe / PayPal / PingPong / WeChat / Alipay).

### Triển khai thủ công

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

Gắn `workbench-data/` cho DB và `workbench-data/static/` cho media. Mẫu Nginx: `deploy/nginx.conf` (console tại `/console/`).

---

## Ngăn xếp công nghệ

| Lớp | Lựa chọn |
|-------|---------|
| API | Node.js 22+, Hono |
| DB | Drizzle ORM, SQLite (mặc định) hoặc MySQL 8+ qua repositories |
| Agents | Mastra + AI SDK (OpenAI-compatible) |
| Media | FFmpeg, Sharp |
| UI | Nuxt 3 SPA, Vue 3, TypeScript |

---

## Câu hỏi thường gặp

**Docker → Ollama trên host:** Base URL `http://host.docker.internal:11434/v1`; host phải lắng nghe trên `0.0.0.0`. Trên Linux `docker run`, thêm `--add-host=host.docker.internal:host-gateway`.

**Thiếu FFmpeg:** Cài và xác minh `ffmpeg -version`. Image Docker đã có FFmpeg.

**Workbench không kết nối API:** Đảm bảo workbench-server trên `:18555`; proxy dev nằm trong `workbench/nuxt.config.ts`.

**Bảng chưa được tạo:** Đặt `DB_AUTO_INIT=true`; kiểm tra log thông báo kết nối SQLite/MySQL.

**MySQL production:** `DB_DRIVER=mysql` + `DATABASE_URL`; giữ `workbench-data/static` trên volume.

**API keys:** [Cổng tổng hợp mô hình](https://proxy-model.hcpzy.com/models)

---

## Đóng góp

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI: `.github/workflows/workbench-server-ci.yml` (typecheck, kiểm tra lớp, smoke SQLite/MySQL).
