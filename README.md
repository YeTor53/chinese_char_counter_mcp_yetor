# chinese-char-counter-mcp

一个用 Python 实现的 MCP 服务（Model Context Protocol Server，STDIO 传输），
用于统计**一段文本里的中文字数**——标点、空格、英文字母、数字、emoji 等一律不计入。

- 传输方式：STDIO（本地进程，无网络、无 API Key、无环境变量）
- 运行时依赖：Python >= 3.10、`mcp>=1.0.0,<2`
- 已通过 ModelScope MCP 广场托管部署所需的配置形态（`command` 为 `uvx`，包发布到 PyPI）

## 这个服务解决什么问题

大模型写中文文案时，"字数"常常对不上：把标点、空格、英文单词都算进去，或者把
emoji 也算成字。本服务给出一个确定的答案：只数中文字符，并把标点/字母/数字/空白
等分项一并返回，方便直接用于文案校验、作业字数检查、标题长度限制等场景。

## 客户端配置

把下面这段配置加入任意支持 MCP 的客户端（Claude Desktop、Cursor、Cherry Studio、
通义灵码、ModelScope MCP 实验场等）：

```json
{
  "mcpServers": {
    "chinese-char-counter": {
      "command": "uvx",
      "args": ["chinese-char-counter-mcp@latest"]
    }
  }
}
```

说明：

- `uvx`（来自 [uv](https://docs.astral.sh/uv/)）会自动从 PyPI 下载并运行本包，无需手动安装。
- 未装 uv 时，可先 `pip install uv`，或改用已安装方式：`"command": "python", "args": ["-m", "chinese_char_counter_mcp"]`。
- 本服务不需要任何环境变量，因此配置里没有 `env` 字段。

## 安装

```bash
# 方式一：pip 安装后直接启动（控制台命令）
pip install chinese-char-counter-mcp
chinese-char-counter-mcp

# 方式二：模块方式启动
python -m chinese_char_counter_mcp

# 方式三：不安装，临时运行（需要 uv）
uvx chinese-char-counter-mcp@latest
```

STDIO 服务启动后不打印任何内容、等待客户端的 JSON-RPC 请求，这是正常现象。

## 工具

### 1. `count_chinese_characters`

统计单条文本的中文字数。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | 是 | 待统计文本，长度上限 200000 个字符 |

返回字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chinese_count` | integer | 中文字数（唯一需要关心的结果） |
| `total_characters` | integer | 文本总字符数（含标点、空格等全部字符） |
| `chinese_ratio` | number | 中文占全部字符的比例，保留 4 位小数 |
| `breakdown` | object | 分项计数：`chinese` / `letters` / `digits` / `punctuation` / `spaces` / `other` |
| `error` | string | 失败原因；成功时为空字符串 |

调用 `count_chinese_characters(text="你好，World 2026！")` 的返回：

```text
{
  "chinese_count": 2,
  "total_characters": 14,
  "chinese_ratio": 0.1429,
  "breakdown": {
    "chinese": 2,
    "letters": 5,
    "digits": 4,
    "punctuation": 2,
    "spaces": 1,
    "other": 0
  },
  "error": ""
}
```

### 2. `count_chinese_characters_batch`

批量统计多条文本，并给出合计，适合一次校验多段文案。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `texts` | array<string> | 是 | 文本列表，最多 500 条，每条上限 200000 个字符 |

返回字段：`results`（与输入顺序一致，每项含 `index` / `total_characters` /
`chinese_count` / `chinese_ratio`）、`text_count`、`total_chinese_count`、`error`。

### 3. `extract_chinese_text`

抽取文本中的中文字符，剔除标点、空格、英文、数字等其它内容。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | 是 | 待处理文本，长度上限 200000 个字符 |

调用 `extract_chinese_text(text="Hello 世界 2026")` 的返回：

```text
{
  "chinese_text": "世界",
  "chinese_count": 2,
  "error": ""
}
```

三个工具都是只读、幂等操作（MCP `readOnlyHint` / `idempotentHint` 已标记为 true），
客户端可以安全地自动调用。

## 计数规则

计入中文：

- CJK 统一表意文字基本区（U+4E00–U+9FFF）与扩展 A–I 区
- 兼容表意文字（U+F900–U+FAFF、U+2F800–U+2FA1F）
- 表意数字零"〇"（U+3007）

不计入：

- 中文标点与英文标点：`，。、；：！？""''（）《》`、`,.;:!?()<>` 等
- 空白：空格、制表符、换行
- 英文字母与其它拉丁字母、阿拉伯数字
- emoji、各类符号
- 其它文字系统：日文假名、韩文谚文、西里尔字母等（归入 `other` / `letters`）

已知边界（刻意为之，不视为缺陷）：

- 日文汉字与中文汉字同属 CJK 表意文字区，Unicode 层面无法区分，一律计入中文。
- 日文迭字符"々"（U+3005）不是表意文字本体，不计入。
- 全角数字"１２３"属于数字，不计入；汉字数字"一二三"计入。

## 项目结构

```text
chinese-char-counter-mcp/
├── src/chinese_char_counter_mcp/
│   ├── counter.py     # 计数核心：纯函数，无副作用，可单独复用
│   ├── server.py      # MCP 工具定义与显式注册、控制台入口
│   └── __main__.py    # python -m 入口
├── tests/             # pytest 单元测试（计数规则 + 工具信封契约）
├── scripts/
│   └── e2e_stdio_client.py   # STDIO 端到端验证：initialize -> list_tools -> call_tool
├── docs/publish-guide.md     # 发布到 GitHub / PyPI / ModelScope MCP 广场的步骤
└── pyproject.toml
```

## 开发

```bash
pip install -e ".[dev]"
pytest -q                          # 单元测试
python scripts/e2e_stdio_client.py # STDIO 端到端验证（需已安装 mcp）
```

设计约定：

- `counter.py` 只做纯计算，不 import `mcp`，方便复用与测试。
- `server.py` 的工具永远返回 dict 信封、永不向 MCP 层抛裸异常：成功时 `error` 为空字符串，
  失败时 `error` 给出可直接阅读的原因，其余字段类型保持稳定。
- 服务端不向 stdout 打印任何内容（STDIO 传输里 stdout 是协议通道），日志走 stderr。

## 在 ModelScope（魔搭）MCP 广场上架

本仓库已按魔搭"从 GitHub 仓库快速创建"的要求准备：根目录 README 正文中包含可解析的
STDIO 服务配置（即上面的 `mcpServers` JSON 块），`command` 为 `uvx`，包已发布到 PyPI。
完整步骤与部署检测自查清单见 [docs/publish-guide.md](docs/publish-guide.md)。

## License

[MIT](LICENSE)
