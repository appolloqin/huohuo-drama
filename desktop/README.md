# 火火短剧 — 桌面端（本地 + 远程双模式）

## 模式

| 模式 | 说明 |
|------|------|
| **本地（默认）** | 启动内嵌 Node，运行编译后的 workbench-server；SQLite 数据在用户目录；**优先用系统 FFmpeg**，没有再回退到安装包内嵌 |

| **远程** | 不启本地进程，打开配置的控制台 URL（默认 seeddrama.com） |

菜单：**模式 → 本地（SQLite） / 远程 URL**

数据目录（升级不丢）：

- Windows: `%APPDATA%/huohuo-drama/workbench-data/`
- macOS: `~/Library/Application Support/huohuo-drama/workbench-data/`
- Linux: `~/.config/huohuo-drama/workbench-data/`

设置文件：同目录上级的 `desktop-settings.json`（`mode` / `remoteUrl`）。

**不**修改 `workbench` / `workbench-server` 源码；安装包内为编译产物。

## 开发

```bash
cd desktop
npm ci

# 可选：打完整本地 runtime（耗时：generate + tsc + Node/FFmpeg）
npm run prepare:runtime

npm run dev
```

未执行 `prepare:runtime` 时，开发态会尝试用**仓库根**作为 runtime（需本机已能跑 server，且 PATH 有 node；FFmpeg 可选）。完整本地体验请先 `prepare:runtime`。

## 打安装包

须在对应 OS 上打包（不可交叉编译 mac）：

```powershell
cd desktop
npm ci
npm run dist:win    # Windows
# npm run dist:mac / dist:linux
```

`dist:*` 会先跑 `prepare:runtime`，再 electron-builder。产物：`desktop/release/`。

### CI

[`.github/workflows/release.yml`](../.github/workflows/release.yml) 在各桌面 job 中构建 runtime 并打包。

## 自定义远程地址

```powershell
$env:HUOHUO_CONSOLE_URL="https://your-domain.com/console/login"
npm run dev
```

或编辑 `desktop-settings.json` 的 `remoteUrl`。

## 行为说明

- 仅 **同站点** origin 的链接在窗口内打开；其它 http(s) 用系统浏览器
- 单实例；退出时结束本地 Node 子进程
- 本地日志：`userData/logs/local-server.log`
- FFmpeg：启动时检测 PATH；已安装则直接用系统版。本地 `prepare:runtime` 若检测到系统 FFmpeg 会跳过内嵌；GitHub Actions 仍会内嵌一份，给没有 FFmpeg 的用户兜底
