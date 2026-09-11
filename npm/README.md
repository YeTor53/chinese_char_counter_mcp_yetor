# chinese-char-counter-mcp

MCP 服务（STDIO，**零依赖** Node 实现）：统计一段文本里的**中文字数**——标点、空格、英文字母、
数字、emoji 一律不计入。

- 传输：STDIO（本地进程，无网络、无 API Key、无环境变量）
- 运行时：Node >= 18，无任何第三方依赖
- 与同仓库的 Python 版（PyPI 包同名）工具名、参数、返回结构完全一致，已做逐字段一致性测试

## 安装 / 运行

```bash
npx -y chinese-char-counter-mcp@latest
```

## 客户端配置

```json
{
  "mcpServers": {
    "chinese-char-counter": {
      "command": "npx",
      "args": ["-y", "chinese-char-counter-mcp@latest"]
    }
  }
}
```

## 工具

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `count_chinese_characters` | `text: string`（≤200000 码点） | `chinese_count` / `total_characters` / `chinese_ratio` / `breakdown` / `error` |
| `count_chinese_characters_batch` | `texts: string[]`（≤500 条） | `results` / `text_count` / `total_chinese_count` / `error` |
| `extract_chinese_text` | `text: string` | `chinese_text` / `chinese_count` / `error` |

三个工具都是只读、幂等操作（已标 `readOnlyHint` / `idempotentHint`）。

## 计数规则

- 计入：CJK 统一表意文字（基本区 + 扩展 A~I + 兼容表意文字）与表意数字零「〇」（U+3007）
- 不计入：中英文标点、空白、英文字母、数字、emoji、其它文字系统（假名/谚文/西里尔等，归类见 `breakdown`）
- 日文汉字与中文汉字同属 CJK 表意文字区，Unicode 层面无法区分，一律计入
- 字符数按 **码点** 计（emoji / 扩展 B 生僻字算 1 个），与 Python 版 `len()` 一致

## 开发

```bash
npm test     # node --test：计数规则 + STDIO 协议全链路
```

源码与 Python 版同仓库：<https://github.com/YeTor53/chinese_char_counter_mcp_yetor>

## License

MIT
