# Mobile 专用 API（`/api/v1/mobile/*`）

移动端指令台增量接口。**不修改**既有 `auth` / `dramas` / `batch-jobs` 等路由。

## 公开接口（无需 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/mobile/health` | 连通性探测 |
| GET | `/mobile/config` | 能力开关（微信登录/支付、Web 工作台 URL） |
| POST | `/mobile/auth/wechat-login` | 小程序 `wx.login` code → JWT |

### `POST /mobile/auth/wechat-login`

```json
{ "code": "wx_login_code" }
```

响应含 `token`、`user`、`wechat_mp_openid`、`is_new_user`。

环境变量：

- `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET`（或 `WECHAT_MP_*`）
- 支付 AppID 可复用 `WECHAT_PAY_APP_ID`，但小程序登录建议单独配置

## 需登录接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/mobile/home-summary` | 用户 + 项目列表 + 批量任务聚合 |
| POST | `/mobile/auth/wechat-bind` | 已有账号绑定微信 |
| GET | `/mobile/payments/plans` | 小程序 CNY 充值套餐 |
| POST | `/mobile/payments/wechat-jsapi` | 小程序 JSAPI 下单 |
| POST | `/mobile/commands/preview` | 解析指令（自然语言 / 结构化） |
| POST | `/mobile/commands` | 执行指令 |

### `POST /mobile/commands`

结构化：

```json
{
  "intent": "batch_write_remaining",
  "drama_id": 12
}
```

自然语言（先 preview 再 confirm 亦可）：

```json
{
  "text": "写剩余章节",
  "drama_id": 12
}
```

`intent` 枚举：

- `batch_write_remaining` — 批量撰写/制作剩余
- `batch_write_range` — 需 `scope.from_chapter`（及可选 `to_chapter`）
- `batch_cancel` — 停止该项目或指定 `job_id` 的任务
- `batch_status` — 查询进行中任务

内部调用现有 `batch-job-service`，不重复流水线逻辑。

### `POST /mobile/payments/wechat-jsapi`

```json
{
  "plan_id": "cny_m",
  "payer_openid": "可选，默认取用户绑定的 wechat_mp_openid"
}
```

返回 `order_no` 与 `payment`（`timeStamp` / `nonceStr` / `package` / `paySign`），供 `wx.requestPayment`。

异步通知仍走 **`POST /api/v1/payments/wechat/notify`**（与 Web Native 共用）。

## 数据库

`users` 表增量列（自动 provision）：

- `wechat_mp_openid`
- `wechat_unionid`

## 实现文件

- `routes/mobile/mobile.ts` — HTTP 薄层
- `services/mobile/*` — 业务逻辑
