# 火火短剧 — 桌面壳（线上控制台）

桌面版 **只是一个壳**：用 Electron 窗口打开线上控制台，默认地址：

**https://www.seeddrama.com/console/login**

- **不**打包 workbench-server / workbench / SQLite / FFmpeg  
- **不**修改 Docker、nginx、`workbench-data/` 或本仓库部署方式  
- 登录、数据、API 全部走 seeddrama.com 线上服务（与浏览器访问相同）

## 开发

```bash
cd desktop
npm ci
npm run dev
```

## 打安装包

### 重要：不能跨平台交叉打包

[electron-builder](https://www.electron.build/multi-platform-build) **不支持在 Windows 上打 macOS 包**。  
若在 Windows 上执行 `npm run dist:mac`，会出现：

```text
Build for macOS is supported only on macOS
```

| 目标 | 在哪里执行 |
|------|------------|
| Windows `.exe` | **本机 Windows** → `npm run dist:win` |
| macOS `.dmg` | **Mac 或 GitHub Actions macOS** → `npm run dist:mac` |
| Linux `.AppImage` | **Linux 或 GitHub Actions Ubuntu** → `npm run dist:linux` |

### 在 Windows 上（你当前环境）

```powershell
cd desktop
npm ci
npm run dist:win
```

产物示例：`desktop/release/Huohuo-Drama-1.0.0-win-x64.exe`

### 在 macOS / Linux 上

```bash
cd desktop
npm ci
npm run dist:mac    # 仅 macOS
# 或
npm run dist:linux  # 仅 Linux
```

### 一次打出三端（推荐）

仓库已配置 [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml)：

1. **自动**：向 `main` 推送 `desktop/` 内变更（含本 workflow）时，并行构建 Win / Mac / Linux
2. **手动**：GitHub → **Actions** → **Desktop release** → **Run workflow**
3. **发版 tag（可选）**：`git tag desktop-v1.0.0 && git push origin desktop-v1.0.0`

完成后可在两处下载安装包：

- **Releases**（推荐对外分发）：仓库 **Releases** 页，每次 push `desktop/` 到 `main` 会生成预发布 `desktop-v{版本}-build.{编号}`，附带 Win / Mac / Linux 安装包
- **Actions → Artifacts**：同次构建的 `desktop-win` / `desktop-mac` / `desktop-linux`（约 90 天有效）

推送 tag `desktop-v1.0.0` 时也会构建，并创建**正式 Release**（非 pre-release）。

产物目录（本地打包时）：`desktop/release/`

## 自定义控制台地址（自建部署）

启动前设置环境变量（例如指向你自己的域名）：

```bash
# Windows PowerShell
$env:HUOHUO_CONSOLE_URL="https://your-domain.com/console/login"
npm run dev

# macOS / Linux
HUOHUO_CONSOLE_URL=https://your-domain.com/console/login npm run dev
```

打包后的应用可在快捷方式或启动脚本里带上同一变量。

## 行为说明

- 仅 **同站点**（与起始 URL 相同 origin）的链接在窗口内打开  
- 其它 http(s) 链接用系统默认浏览器打开  
- 支持单实例（重复打开会聚焦已有窗口）

## 与「本地完整版」的区别

| | 本桌面壳 | 本地 workbench-server 方案 |
|---|---------|------------------|
| 数据 | 线上账号 | 本机 SQLite / MySQL |
| 离线 | 需网络 | 可离线（需自建 API） |
| 维护 | 只更新网站即可 | 需随应用发版 |
| 体积 | 小（仅 Electron） | 大（Node + 依赖） |

当前仓库采用 **线上壳** 方案，适合作为 [seeddrama.com 控制台](https://www.seeddrama.com/console/login) 的快捷入口。
