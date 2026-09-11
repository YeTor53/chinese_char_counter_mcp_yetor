"""MCP 服务入口：把中文字数统计暴露为 MCP 工具（STDIO 传输）。

工具统一返回 dict 信封（永远不向 MCP 层抛裸异常）：
成功时 error 为空字符串，失败时 error 为可直接阅读的失败原因，
其它字段保持稳定的类型，便于客户端与 Agent 直接解析。

返回值用 TypedDict 声明，MCP 客户端拿到的 structuredContent 才是扁平结构
（返回类型若写成 Dict[str, Any]，structuredContent 会被包成 {"result": {...}}）。
"""

from __future__ import annotations

from typing import List

# Python < 3.12 上 pydantic 只接受 typing_extensions.TypedDict，
# 用 typing.TypedDict 会在注册工具时报 PydanticUserError。
try:  # pragma: no cover - 取决于运行环境
    from typing_extensions import TypedDict
except ImportError:  # pragma: no cover
    from typing import TypedDict

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from .counter import count_batch, count_text, extract_chinese

SERVER_NAME = "chinese-char-counter"
SERVER_INSTRUCTIONS = (
    "统计一段文本里的中文字数（不含标点、空格、英文字母、数字等）。"
    "count_chinese_characters 返回中文字数与分项明细；"
    "count_chinese_characters_batch 用于批量统计多条文本；"
    "extract_chinese_text 返回剔除其它字符后的纯中文文本。"
)

READ_ONLY_TOOL = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)

mcp = FastMCP(name=SERVER_NAME, instructions=SERVER_INSTRUCTIONS)


class CharacterBreakdown(TypedDict):
    """分项字符计数。"""

    chinese: int
    letters: int
    digits: int
    punctuation: int
    spaces: int
    other: int


class ChineseCountResult(TypedDict):
    """单条文本的统计结果。"""

    chinese_count: int
    total_characters: int
    chinese_ratio: float
    breakdown: CharacterBreakdown
    error: str


class BatchItemResult(TypedDict):
    """批量统计中单条文本的结果。"""

    index: int
    total_characters: int
    chinese_count: int
    chinese_ratio: float


class ChineseCountBatchResult(TypedDict):
    """批量统计结果。"""

    results: List[BatchItemResult]
    text_count: int
    total_chinese_count: int
    error: str


class ExtractChineseResult(TypedDict):
    """纯中文抽取结果。"""

    chinese_text: str
    chinese_count: int
    error: str


def _empty_breakdown() -> CharacterBreakdown:
    return {
        "chinese": 0,
        "letters": 0,
        "digits": 0,
        "punctuation": 0,
        "spaces": 0,
        "other": 0,
    }


def _error_result(message: str) -> ChineseCountResult:
    """构造与成功返回同构的错误信封，保证字段与类型稳定。"""
    return {
        "chinese_count": 0,
        "total_characters": 0,
        "chinese_ratio": 0.0,
        "breakdown": _empty_breakdown(),
        "error": message,
    }


def count_chinese_characters(text: str) -> ChineseCountResult:
    """统计一段文本的中文字数（不算标点、空格、英文字母、数字等）。

    Args:
        text: 待统计的文本，长度上限 200000 个字符。

    Returns:
        chinese_count 为中文字数（CJK 表意文字，含扩展区与“〇”）；
        total_characters 为文本总字符数（含标点、空格等全部字符）；
        chinese_ratio 为中文占全部字符的比例（保留 4 位小数）；
        breakdown 为分项计数：chinese/letters/digits/punctuation/spaces/other；
        error 为失败原因，成功时为空字符串。
    """
    try:
        counts = count_text(text)
    except Exception as exc:  # 统一信封，不向 MCP 层抛裸异常
        return _error_result("count_chinese_characters failed: %s" % exc)
    return {
        "chinese_count": counts["chinese_count"],
        "total_characters": counts["total_characters"],
        "chinese_ratio": counts["chinese_ratio"],
        "breakdown": counts["breakdown"],
        "error": "",
    }


def count_chinese_characters_batch(texts: List[str]) -> ChineseCountBatchResult:
    """批量统计多条文本的中文字数，并给出合计。

    Args:
        texts: 文本列表，最多 500 条，每条长度上限 200000 个字符。

    Returns:
        results 与输入顺序一致，每项含 index/total_characters/chinese_count/chinese_ratio；
        text_count 为实际统计条数；total_chinese_count 为所有文本的中文字数合计；
        error 为失败原因，成功时为空字符串。
    """
    try:
        batch = count_batch(texts)
    except Exception as exc:
        return {
            "results": [],
            "text_count": 0,
            "total_chinese_count": 0,
            "error": "count_chinese_characters_batch failed: %s" % exc,
        }
    return {
        "results": batch["results"],
        "text_count": batch["text_count"],
        "total_chinese_count": batch["total_chinese_count"],
        "error": "",
    }


def extract_chinese_text(text: str) -> ExtractChineseResult:
    """抽取文本中的中文字符，剔除标点、空格、英文、数字等其它字符。

    Args:
        text: 待处理的文本，长度上限 200000 个字符。

    Returns:
        chinese_text 为仅由中文字符按原顺序组成的文本；
        chinese_count 为抽取出的中文字数；
        error 为失败原因，成功时为空字符串。
    """
    try:
        chinese_text = extract_chinese(text)
    except Exception as exc:
        return {
            "chinese_text": "",
            "chinese_count": 0,
            "error": "extract_chinese_text failed: %s" % exc,
        }
    return {"chinese_text": chinese_text, "chinese_count": len(chinese_text), "error": ""}


# 显式集中注册：一眼能数清暴露了几个工具，工具实现也不反向依赖入口。
TOOL_FUNCTIONS = (
    count_chinese_characters,
    count_chinese_characters_batch,
    extract_chinese_text,
)

for _function in TOOL_FUNCTIONS:
    mcp.tool(annotations=READ_ONLY_TOOL)(_function)


def main() -> None:
    """控制台入口：以 STDIO 方式启动 MCP 服务。"""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
