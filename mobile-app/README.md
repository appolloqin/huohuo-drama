# 火火指令台（mobile-app）

移动端 **指令台**：选项目 → 发指令 → 看批量任务进度 → 跳转 Web 精修。  
基于 **uni-app（Vue 3 + TypeScript）**，一套代码编译为微信小程序 / Android / iOS / H5。

## 原则

1. **不改造现有 API**：业务仍可调 `/api/v1/auth`、`/dramas`、`/batch-jobs`。
2. **移动端增量接口**：`/api/v1/mobile/*`（指令、聚合、微信登录/支付）。
3. **详细编辑在 Web**：正文、分镜、合成等在 `workbench` 完成。

## 后端 mobile 接口一览

| 方法 | 路径 | 鉴权 |
|------|------|------|
| GET | `/mobile/health` | 否 |
| GET | `/mobile/config` | 否 |
| POST | `/mobile/auth/wechat-login` | 否 |
| POST | `/mobile/auth/wechat-bind` | 是 |
| GET | `/mobile/home-summary` | 是 |
| GET | `/mobile/payments/plans` | 是 |
| POST | `/mobile/payments/wechat-jsapi` | 是 |
| POST | `/mobile/commands/preview` | 是 |
| POST | `/mobile/commands` | 是 |

指令页默认走 **`POST /mobile/commands`**；任务列表仍用 `/batch-jobs` 轮询。

## 开发

```bash
cd mobile-app
cp .env.example .env
npm install

# 先启动 workbench-server（18555）
cd ../workbench-server && npm run dev

# H5 调试（48555，/api 代理到 18555）
cd ../mobile-app
npm run dev:h5

# 微信小程序
npm run dev:mp-weixin
```

### 环境变量（`.env`）

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | API 根路径，含 `/api/v1` |
| `VITE_WEB_CONSOLE_URL` | Web 工作台地址 |

服务端微信小程序登录需配置 `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET`（见 `workbench-server/.env.example`）。

## 目录

```
src/
  api/           # client + mobileApi
  pages/         # login / projects / command / tasks / me
  components/
  composables/
```
