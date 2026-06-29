# Huohuo Drama — แพลตฟอร์ม AI โอเพนซอร์สสำหรับละครสั้นและนิยาย

<div align="center">

**นักเขียนดิจิทัล · ผู้กำกับดิจิทัล · ตรวจจับ AI · ชำระเงินหลายช่องทาง**

[![Node Version](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat&logo=nuxt)](https://nuxt.com)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [ไทย](./README.th.md) · [Tiếng Việt](./README.vi.md) · [Русский](./README.ru.md) · [ความสามารถ](#ความสามารถ) · [ภาพหน้าจอ](#ภาพหน้าจอ) · [เริ่มต้นอย่างรวดเร็ว](#เริ่มต้นอย่างรวดเร็ว) · [การ deploy](#การ-deploy)

</div>

---

## ภาพรวม

**Huohuo Drama** คือแพลตฟอร์มโอเพนซอร์สแบบ full-stack สำหรับการผลิต **ละครสั้น AI** และ **นิยาย AI** ในพื้นที่ทำงานเดียว นำข้อความดิบไปสู่บทที่จัดรูปแบบแล้ว storyboard และสื่อ multimodal จนถึงตอนที่เสร็จสมบูรณ์ — พร้อม TTS การ mux ต่อช็อตด้วย FFmpeg และการส่งออก

แต่ละตอนรองรับสองสายการผลิต — **วิดีโอ AI** และ **สไลด์โชว์เฟรมนิ่ง** (workbench แยกกัน ทำงานขนานได้): สาย AI ใช้ image-to-video; สายเฟรมสร้างช็อตจากลำดับ keyframe ด้วย Ken Burns motion ของ FFmpeg ปรับความยาวคลิปให้ตรง TTS ใส่เพลงพื้นหลังในช็อตที่ไม่มีบทพูด จากนั้น mux และรวมเป็นตอนเต็ม

**การเขียนนิยาย AI:** **นักเขียนดิจิทัล** ในตัวรัน brief → ร่าง → ตรวจความสอดคล้องแบบ batch **โหมด causal-chain** เปิดเป็นค่าเริ่มต้น: ทุกบทจบด้วยบล็อก **Change Record** ที่ทุกการเปลี่ยนสถานะต้องระบุ trigger → process → outcome ระบบเก็บ ฉีด และตรวจสอบห่วงโซ่เหล่านี้ข้ามบทถัดไป — ร่วมกับหน่วยความจำความต่อเนื่องสี่ชั้น — เพื่อรักษาความสอดคล้องของตัวละคร ขอบเขต การวางปม และตรรกะข้ามบทในนิยายยาว

**นิยาย → ละครสั้น:** นำเข้าบทหรือนิยาย AI ทั้งเล่มเข้าโปรเจกต์ละครสั้น แปลงเป็นบทถ่ายทอดได้ จากนั้น storyboard breakdown และสายวิดีโอเต็มรูปแบบ — ไม่ต้องพิมพ์ซ้ำระหว่างรูปแบบ

ออกแบบสำหรับครีเอเตอร์และทีมเล็ก แพลตฟอร์มทำให้การเขียน การผลิต การตรวจคุณภาพ และการเรียกเก็บเงินเป็นระบบ:

| ความสามารถ | คำอธิบาย |
|------------|-------------|
| **นักเขียนดิจิทัล** | เขียนบทแบบ batch ฝั่งเซิร์ฟเวอร์: brief → ร่าง → ตรวจความสอดคล้อง; **causal-chain** change records ท้ายบทรักษาความต่อเนื่องของซีเรียลยาว |
| **ผู้กำกับดิจิทัล** | ตอนละครสั้นแบบ batch ฝั่งเซิร์ฟเวอร์: เลือก **วิดีโอ AI** หรือ **สไลด์โชว์เฟรมนิ่ง** ตอนเริ่ม; บท → storyboard → สินทรัพย์ → mux → รวมตอนทำงานเบื้องหลัง กู้คืนความคืบหน้าหลังรีเฟรช |
| **ตรวจจับ AI** | ตรวจจับข้อความ AI และการ rewrite ลดลักษณะ AI ในตัว (เส้นทางคอนโซล `/ai-detect`) สำหรับการเผยแพร่ที่เป็นไปตามข้อกำหนดและการขัดเกลา |
| **ชำระเงินหลายช่องทาง** | เรียกเก็บด้วยเครดิต พร้อม **Stripe, PayPal, PingPong, WeChat Pay และ Alipay** — แอดมินเปิดช่องทางผ่าน env vars และ UI การตั้งค่า |

**สายละครสั้น:** ภาพบทบาท → สกัดฉาก → storyboard → **AI image-to-video** หรือ **สไลด์ Ken Burns เฟรมนิ่ง** → TTS / mux ต่อช็อต → รวมตอนด้วย FFmpeg และส่งออก

**สายนิยาย:** batch นักเขียนดิจิทัล → **causal chain** (change records ท้ายบท + causal audit) → ฉีดหน่วยความจำสี่ชั้น → ความต่อเนื่องแบบ retrieval-augmented

**นิยาย → ละครสั้น:** นำเข้าจากโปรเจกต์นิยาย → rewrite บท → storyboard และการสร้าง → ส่งออกตอน (พื้นที่ทำงานเดียวกัน โปรเจกต์ร่วมกัน)

## ภาพหน้าจอ

| เข้าสู่ระบบ | การตั้งค่า |
|:---:|:---:|
| ![Login — sign in to the workbench](./workbench-data/images/login.jpg) | ![Settings — account, AI services, payments, agents](./workbench-data/images/setting.jpg) |

| ตรวจจับ AI | นิยาย — รายการบท |
|:---:|:---:|
| ![AI rate detection — text, file, audio, video](./workbench-data/images/ai.jpg) | ![Novel project — volumes and chapter progress](./workbench-data/images/novel1.jpg) |

| นิยาย — ตัวแก้ไขบท | ละครสั้น — workbench การผลิต |
|:---:|:---:|
| ![Digital Writer — outline, AI continue, streaming draft](./workbench-data/images/novel_ch.jpg) | ![Digital Director — storyboard, TTS, AI video, per-shot mux](./workbench-data/images/video.jpg) |

### ฟีเจอร์เพิ่มเติม

| ด้าน | สิ่งที่ได้ |
|------|----------------|
| สองสาย | ต่อตอน: **workbench วิดีโอ AI** หรือ **workbench สไลด์โชว์เฟรมนิ่ง**; เฟรมใช้ลำดับ keyframe + Ken Burns — ไม่ใช้เครดิตโมเดลวิดีโอ |
| บัญชี | หลายผู้ใช้ JWT บัญชีเครดิตและประวัติการใช้งาน |
| แกลเลอรีเทมเพลต | เผยแพร่โปรเจกต์ละครสั้นเป็นเทมเพลตนำกลับมาใช้ |
| คลังบทเรียน | คำแนะนำต่อ agent ฉีดเข้า prompt ตามเวลา |
| ส่วนขยาย skill | playbook SKILL.md ใน `agent-skills/`; อัปโหลด ZIP ในการตั้งค่า |

### โครงสร้าง repository

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

## ความสามารถ

### สายละครสั้น

- **นักแสดงและสถานที่** — ภาพ AI อัปโหลด กำหนดเสียงและพรีวิว
- **Storyboard** — แบ่งช็อต prompt ภาพนิ่ง / ลำดับ keyframe แยก/กำหนด grid
- **วิดีโอและเสียง** — AI image-to-video หรือสไลด์ Ken Burns เฟรมนิ่ง; TTS (คลิปเฟรมตามความยาว dub) mux FFmpeg ต่อช็อต รวมตอนแบบ async
- **คลังสื่อ** — เก็บในเครื่อง พร้อมความคืบหน้างาน async

### Mastra agents

| Agent id | บทบาท |
|---|---|
| **`drama_script_formatter`** | โปรสดิบ → บทถ่ายทอดที่จัดรูปแบบแล้ว |
| **`drama_cast_scene_extract`** | สกัดนักแสดง + สถานที่ |
| **`drama_storyboard_breakdown`** | บท → รายการช็อตเรียงลำดับ |
| **`drama_voice_assign`** | แมปเสียงกับสมาชิก cast |
| **`drama_image_prompt`** | ชุด prompt สำหรับ cast ฉาก และเฟรม grid |

### ตาราง provider

| Modality | ผู้ให้บริการ |
|---|---|
| **Text** | OpenAI, Gemini, DeepSeek, GLM, MiniMax, Volcengine, Ali, OpenRouter |
| **Image** | OpenAI, Gemini, MiniMax, Volcengine, Ali |
| **Video** | MiniMax, Volcengine/Seedance, Vidu, Ali |
| **TTS** | MiniMax |

### โหมดนิยาย

โปรเจกต์ยาวใช้ **หน่วยความจำความต่อเนื่องสี่ชั้น**: snapshot สถานะ global หางบทก่อนหน้า สรุปก่อนหน้า และ ledger จาก keyword retrieval — ฉีดทั้งหมดพร้อมขีดจำกัดขนาดเข้มงวดเพื่อให้ prompt มีขอบเขตเมื่อจำนวนบทเพิ่มขึ้น การเขียน batch รองรับ brief → บท → ตรวจความสอดคล้อง; โหมด strict วนซ้ำแก้ในเครื่องจนผ่านการตรวจ

### งาน batch ฝั่งเซิร์ฟเวอร์

งานนักเขียนดิจิทัล / ผู้กำกับดิจิทัลรันบนเซิร์ฟเวอร์หลังไคลเอนต์ตัดการเชื่อมต่อ ต้องเข้าสู่ระบบ (JWT) งานที่ใช้งานอยู่หนึ่งงานต่อละครสั้น กู้คืนความคืบหน้าผ่าน `GET /api/v1/batch-jobs/active`

---

## Desktop shell (ทางเลือก)

แพ็กเกจ [`desktop/`](./desktop/) เป็น Electron wrapper บางๆ สำหรับคอนโซลที่โฮสต์ ไม่ได้รวม API ในเครื่อง ดู [desktop/README.md](./desktop/README.md)

---

## เริ่มต้นอย่างรวดเร็ว

### สิ่งที่ต้องมี

| เครื่องมือ | ขั้นต่ำ | หมายเหตุ |
|------|---------|-------|
| Node.js | 22+ | เซิร์ฟเวอร์ dev API และ Nuxt |
| npm | 9+ | ตัวจัดการแพ็กเกจ |
| FFmpeg | 4.0+ | **จำเป็น** สำหรับ mux/concat |

```bash
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
ffmpeg -version
```

### การตั้งค่า

```bash
cp deploy/config.example.yaml deploy/config.yaml   # optional; AI defaults, not DB driver
cp workbench-server/.env.example workbench-server/.env               # authoritative for DB
```

| ตัวแปร | ค่าเริ่มต้น | วัตถุประสงค์ |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | `sqlite` หรือ `mysql` |
| `DB_PATH` | `workbench-data/huohuo_drama.db` | ไฟล์ SQLite |
| `DATABASE_URL` | — | MySQL DSN |
| `DB_AUTO_INIT` | `true` | DDL + seed อัตโนมัติตอนบูต |
| `PORT` | `18555` | พอร์ตฟัง API |

คีย์และโมเดล provider ตั้งค่าใน UI **การตั้งค่า** บนเว็บ

### ติดตั้งและรัน

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

- คอนโซล: `http://localhost:28555` (บาง Windows ควรใช้ `localhost` แทน `127.0.0.1`)
- API: `http://localhost:18555/api/v1` (Nuxt dev proxy สำหรับ `/api` และ `/static`)

**โปรเซสเดียว (คล้าย production ในเครื่อง):**

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

### ฐานข้อมูล

**SQLite (ค่าเริ่มต้น)** — `workbench-data/huohuo_drama.db` สร้างตอนบูตครั้งแรกเมื่อ `DB_AUTO_INIT=true`

**MySQL** — ใน `workbench-server/.env`:

```bash
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/huohuo_drama
```

Seed เสียง MiniMax หลังบูตครั้งแรก: `cd workbench-server && npm run seed:voices`

---

## การ deploy

### Docker Compose (แนะนำ)

**Console + API (SQLite ค่าเริ่มต้น พอร์ต 80):**

```bash
cd deploy
cp .env.example .env   # ทางเลือก
docker compose up -d --build
```

ตั้งค่า `DB_DRIVER`, `DATABASE_URL`, คีย์ชำระเงิน ฯลฯ ใน `deploy/.env` — ดู `deploy/.env.example`

**Docker + MySQL (instance ระยะไกลหรือ self-hosted):**

```bash
# deploy/.env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:pass@host:3306/huohuo_drama
```

```bash
cd deploy && docker compose up -d --build
```

| `DB_AUTO_INIT` | พฤติกรรม |
|----------------|----------|
| `true` (ค่าเริ่มต้น) | สร้างตาราง แพตช์คอลัมน์ seed ข้อมูลอ้างอิง |
| `false` | เชื่อมต่อเท่านั้น — ไม่มี DDL อัตโนมัติ |

### การชำระเงิน (เครดิต)

env ของ workbench-server: `STRIPE_*`, `PAYPAL_*`, `PINGPONG_*` ฯลฯ รวม `SITE_URL` (origin สาธารณะสำหรับ redirect) ตัวอย่าง webhook: `https://your-domain.com/api/v1/payments/stripe/webhook` เปิดช่องทางใน **การตั้งค่า → การชำระเงิน** (Stripe / PayPal / PingPong / WeChat / Alipay)

### Deploy ด้วยตนเอง

```bash
cd workbench && npm run generate    # → workbench/.output/public
cd ../workbench-server && npm start
```

เมาท์ `workbench-data/` สำหรับ DB และ `workbench-data/static/` สำหรับสื่อ ตัวอย่าง Nginx: `deploy/nginx.conf` (console ที่ `/console/`)

---

## สแต็กเทคโนโลยี

| ชั้น | ตัวเลือก |
|-------|---------|
| API | Node.js 22+, Hono |
| DB | Drizzle ORM, SQLite (ค่าเริ่มต้น) หรือ MySQL 8+ ผ่าน repositories |
| Agents | Mastra + AI SDK (OpenAI-compatible) |
| Media | FFmpeg, Sharp |
| UI | Nuxt 3 SPA, Vue 3, TypeScript |

---

## คำถามที่พบบ่อย

**Docker → Ollama บนโฮสต์:** Base URL `http://host.docker.internal:11434/v1`; โฮสต์ต้องฟังที่ `0.0.0.0` บน Linux `docker run` เพิ่ม `--add-host=host.docker.internal:host-gateway`

**ไม่มี FFmpeg:** ติดตั้งและตรวจ `ffmpeg -version` อิมเมจ Docker มี FFmpeg ในตัว

**Workbench เชื่อม API ไม่ได้:** ตรวจว่า workbench-server อยู่ที่ `:18555`; dev proxy อยู่ใน `workbench/nuxt.config.ts`

**ตารางไม่ถูกสร้าง:** ตั้ง `DB_AUTO_INIT=true`; ดู log ข้อความเชื่อมต่อ SQLite/MySQL

**MySQL production:** `DB_DRIVER=mysql` + `DATABASE_URL`; เก็บ `workbench-data/static` บน volume

**API keys:** [Model aggregation portal](https://huo.hcpzy.com/)

---

## การมีส่วนร่วม

```bash
cd workbench-server && npm run typecheck && npm run check:layers
cd ../workbench && npm run build
```

CI: `.github/workflows/workbench-server-ci.yml` (typecheck, layer checks, SQLite/MySQL smoke)
