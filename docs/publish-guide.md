# 发布指引：GitHub / PyPI / ModelScope MCP 广场

面向本仓库的一次性操作清单。三步互相依赖：
**GitHub 仓库 → PyPI 发布 → 魔搭 MCP 广场提交**。
魔搭的"托管部署"只认 PyPI/npm 上的包（不接受从 GitHub 拉源码或远程 URL），
所以第 2 步是能否上架托管的前提。

## 第 1 步：GitHub

```bash
cd chinese-char-counter-mcp
git init -b main
git add .
git commit -m "feat: chinese char counter MCP server (stdio)"
git remote add origin https://github.com/YeTor53/chinese_char_counter_mcp_yetor.git
git push -u origin main
```

推送后在仓库设置里补充 Homepage / Topics（建议：`mcp`、`model-context-protocol`、
`chinese`、`character-count`）。

注意：GitHub 仓库名是 `chinese_char_counter_mcp_yetor`，PyPI 包名是 `chinese-char-counter-mcp`，
两者不要求一致——客户端配置里 `uvx` 后面跟的必须是 **PyPI 包名**。

仓库根目录必须保留 `README.md`，且正文里保留那段含 `mcpServers` 的 JSON 配置——
魔搭快速创建就是从 README 正文解析服务介绍与服务配置的，缺失会直接中断创建。

## 第 1.5 步：发布前本地预验证（强烈建议）

魔搭的部署检测做的事就是"从包管理器装包 → 拉起服务 → 调 list_tools"。本地可以提前把这条链路跑通，
避免发上 PyPI 后才发现入口有问题：

```bash
uv build
uv tool run --from dist/*.whl chinese-char-counter-mcp
```

最后一条能把服务拉起来（无输出、等待 stdin）就说明入口没问题；再用任意 MCP 客户端连一下确认
`list_tools` 返回三个工具即可。本项目 2026-09-11 已按此验证通过（uv 0.11.14，装 31 个依赖后成功握手）。

## 第 2 步：发布到 PyPI（唯一不可跳过的步骤）

包名：`chinese-char-counter-mcp`（npm 与 PyPI 同名）。魔搭的部署检测会按 README 第一个配置块拉起服务
（本项目走 `npx -y chinese-char-counter-mcp@latest`；若改用 uvx 则是 `uvx chinese-char-counter-mcp@latest`），
**包不在 PyPI 上，连接与检测必定失败**（报 anyio TaskGroup 的 ExceptionGroup）。

### 2.1 账号与令牌

1. 注册/登录 https://pypi.org （需邮箱验证）。
2. 开启双因素认证（Account settings → Two-factor authentication，TOTP）。未开 2FA 无法创建令牌。
3. 创建 API token：Account settings → API tokens → Add API token。
   - 第一次必须选 scope = **Entire account**（项目还不存在，不能选项目级）。
   - 令牌只在创建时显示一次，形如 `pypi-xxxxx`，复制保存好。
   - 首次发布成功后，可再建一个 scope 限定到该项目的令牌用于日常发布。

### 2.2 上传

本机 uv 已在 PATH 上且 TLS 可用，**优先用 `uv publish`**（无需额外装依赖；`twine` 未安装）：

```powershell
cd G:\MCP\chinese-char-counter-mcp
uv publish --token pypi-你的令牌 dist/*
```

- 认证用户名由 uv 自动按 `__token__` 处理，不用手填。
- 传完看到 `Uploading ...` 两次（wheel + sdist）即成功。
- 想先确认文件与端点没问题：加 `--dry-run`（不发令牌也能跑）。
- 备用方式（uv 不可用时）：`python -m pip install --upgrade twine` 后
  `python -m twine upload -u __token__ -p pypi-你的令牌 dist/*`。

### 2.3 验证

> 刚发布后 PyPI 的 JSON / simple 索引有 **CDN 缓存**：立刻查可能仍显示旧版本（实测 0.1.1 已发布但
> `/pypi/<包名>/json` 还返回 0.1.0）。核验时加一个 cache-busting 参数即可：
> `https://pypi.org/pypi/chinese-char-counter-mcp/json?cb=<时间戳>`，或等 1~2 分钟再看。
> `uvx 包名@latest` 同理，紧跟着发布立刻拉可能仍是旧版本。

1. 打开 https://pypi.org/project/chinese-char-counter-mcp/ 能看到最新版本号。
2. 本机拉起（魔搭检测做的事就是这一步）：

```powershell
uvx chinese-char-counter-mcp@latest
```

无输出、停在等待 stdin 状态即正确（Ctrl+C 退出）。

### 2.4 走 CI 发布（可选，等价方案）

仓库自带 `.github/workflows/publish.yml`，用 Trusted Publishing 免令牌：

1. PyPI → Publishing → Add a pending publisher：填仓库 `YeTor53/chinese_char_counter_mcp_yetor`、
   workflow `publish.yml`、environment `pypi`。
2. GitHub 仓库 Settings → Environments 建 `pypi`。
3. 打 tag 触发：

```powershell
git tag v0.1.1
git push origin v0.1.1
```

### 2.5 以后每次更新版本

改 `pyproject.toml` 的 `version` 与 `src/chinese_char_counter_mcp/__init__.py` 的 `__version__` →
`uv build` → `uv publish --token ... dist/*` → 打 tag。客户端与魔搭用的是 `@latest`，无需重建服务。

发布后验证 `uvx` 能拉起服务（这一步就是魔搭部署检测实际做的事）：

```bash
uvx chinese-char-counter-mcp@latest
```

能正常启动（无输出、等待 stdin）即说明控制台入口
（`pyproject.toml` 里的 `[project.scripts] chinese-char-counter-mcp`）正确。

版本升级：改 `pyproject.toml` 的 `version` 与 `__init__.py` 的 `__version__`，重新打 tag 发布。

## 第 2.6 步：发布 npm 包（README 配置走 npx 时必需）

魔搭部署检测支持 `command` 为 `npx` 或 `uvx`，但**平台侧实际可用性以 npx 最稳**（本项目 README 的
配置块用的是 `npx`，平台只取第一个配置块，所以 npx 是主路径）。npx 路线要求包发布到 npm。

先决条件：npm 账号（https://www.npmjs.com/signup ，需邮箱验证）；建议同时开启 2FA。

> 本机 `npm config get registry` 指向的是 **registry.npmmirror.com（只读镜像，不能发布）**，
> 所以发布命令必须显式指定官方 registry。

```powershell
cd G:\MCP\chinese-char-counter-mcp\npm
npm test                                  # 15 项：计数规则 + STDIO 协议全链路
npm pack                                  # 可选：先看打进包里的文件清单

# 登录（交互）或用令牌（推荐，适合无人值守）
npm login --registry https://registry.npmjs.org
npm publish --registry https://registry.npmjs.org

# 令牌方式（在 npmjs.com → Access Tokens 建 granular token，勾选 Bypass 2FA）
npm publish --registry https://registry.npmjs.org --//registry.npmjs.org/:_authToken=npm_你的令牌
```

发布后验证（这一步就是魔搭检测做的事）：

```powershell
npm view chinese-char-counter-mcp version --registry https://registry.npmjs.org
npx -y chinese-char-counter-mcp@latest     # 无输出、停在等待 stdin 即正确
```

版本升级：改 `npm/package.json` 的 `version`（与 Python 版的版本号各自独立，不必同步），重跑上面两条发布命令。

## 第 3 步：提交到 ModelScope MCP 广场

入口：MCP 广场首页右上角"创建 MCP"，或用"从 GitHub 仓库快速创建"（推荐）。

快速创建只需填：

| 字段 | 本项目的填写内容 |
| --- | --- |
| GitHub 地址 | 第 1 步推送的公开仓库地址 |
| 英文名称 | `chinese-char-counter`（与所有者拼成服务 ID：`<owner>/chinese-char-counter`） |
| 展示名称 | `中文字数统计` |
| 所有者 | 当前用户（或所属组织） |
| 是否公开 | 公开（当前仅支持公开） |
| 托管类型 | 可托管部署 |
| 服务图标 | 上传一张方形图标 |

平台会自动解析 README：服务介绍取自正文，服务配置取自那段 `mcpServers` JSON，
环境变量取自配置里的 `env` 字段（本项目没有 `env`，无需填写）。

也可以走"自定义创建"，手动填同样的字段并选择 STDIO 方式填入同一段服务配置。

## 部署检测自查清单

平台对"可托管部署"的服务会跑自动部署检测，只支持下面这条路径，逐条核对：

- [ ] `command` 字段值为 `npx` 或 `uvx`（本项目 README 第一个配置块用 **npx**；平台只取第一个配置块）
- [ ] `args` 中能取到 npm/PyPI 包名：`-y chinese-char-counter-mcp@latest`（npx 路线；`-y` 表示免交互安装）
- [ ] 包**确实已发布**：npx 路线看 npm（`npm view <包名> version`），uvx 路线看 PyPI；两条都自测过 `npx -y <包名>@latest` / `uvx <包名>@latest` 能启动出 STDIO 服务
- [ ] 服务配置 JSON **无注释**、无多余字段（json 代码块必须是合法 JSON）
- [ ] README 中只放**一个**含 `mcpServers` 的配置块（多个时平台只取第一个）
- [ ] 服务不依赖本地绝对路径、不依赖任何必须由用户手填的参数
- [ ] 无需环境变量/密钥即可完成 `initialize` 与 `list_tools`（本项目天然满足）
- [ ] `args` 里的包名带 `@latest` 后缀，用户连接时总能拿到最新版

检测流程为：解析服务配置 → 从 `args` 取包名并安装 → 拉起服务 → 调用 `list_tools`。
`list_tools` 成功即通过（不会逐个调用工具）。任一步失败，即使创建时选了"可托管部署"，
该服务也不会被托管、页面上不会出现托管标签。

## 上架后验证

1. 详情页"查看"：确认介绍、分类、作者信息由 README 正确解析而来。
2. 详情页"连接"：本项目无需环境变量，直接点连接即可拿到 SSE 配置。
3. 详情页"工具测试"：依次调用 `count_chinese_characters`（`text="你好，World 2026！"`，
   期望 `chinese_count=2`）、`extract_chinese_text`、`count_chinese_characters_batch`。
4. 若工具测试报错，优先回到"部署检测自查清单"逐项排查，其次看 PyPI 上最新版本是否
   包含本次代码（`@latest` 会拉最新版本，刚发布的版本可能尚未同步到镜像）。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 快速创建中断，提示缺少服务介绍 | 仓库根目录 `README.md` 为空或正文取不到内容 |
| 快速创建中断，提示缺少服务配置 | README 里没有可解析的 `mcpServers` JSON 块，或 JSON 不合法/含注释 |
| 部署检测不通过：安装失败 | 包没发到 PyPI，或 `args` 里的包名写错（先 `uvx 包名@latest` 自测） |
| 连接报 `ExceptionGroup ... TaskGroup` | 多半就是包不在 PyPI 上；去 https://pypi.org/pypi/<包名>/json 确认返回 200 而非 404 |
| 部署检测不通过：`command` 不支持，或提示 uvx 不可用 | 改用 npx：确认 npm 包已发布，README 第一个配置块为
`{"command": "npx", "args": ["-y", "chinese-char-counter-mcp@latest"]}` |
| npm 发布报 403 / 需要 OTP | 账号开了 2FA：用 granular token（勾 Bypass 2FA）发布，或按提示输入一次性口令 |
| `npm publish` 报不能发到 mirror | 本机 registry 是 npmmirror，命令里必须显式带 `--registry https://registry.npmjs.org` |
| 连接失败、提示缺少环境变量 | 服务配置里带了 `env`，但平台未填测试值；本项目不需要 `env` |
| 托管后仍看不到托管标签 | 检测未通过，或创建时托管类型选了"仅本地可用" |
| `uvx 包名@latest` 解析失败 | 平台 uv 版本过旧不支持 `@latest`；把 README 配置里 `args` 的包名去掉 `@latest` 后再提交（同时改仓库 README 与广场里的服务配置） |
