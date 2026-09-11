"""中文字数统计的核心逻辑。

设计约束：
- 纯函数，不读写文件、不打印任何内容（MCP STDIO 传输里 stdout 是协议通道，
  任何 print 都会搅坏 JSON-RPC 帧，所以本模块与上层服务都不使用 print）。
- 不依赖 mcp 包，可被其他项目直接 import 复用，也便于纯单元测试。
"""

from __future__ import annotations

import unicodedata
from bisect import bisect_right
from typing import Any, Dict, Sequence

# 计入“中文”的 Unicode 码位区间：CJK 统一表意文字、各扩展区、兼容表意文字，
# 以及表意数字零“〇”。区间按起始码位升序排列，供 bisect 二分查找。
HAN_RANGES: Sequence[tuple[int, int]] = (
    (0x3007, 0x3007),    # 〇 表意数字零
    (0x3400, 0x4DBF),    # 扩展 A
    (0x4E00, 0x9FFF),    # 基本区
    (0xF900, 0xFAFF),    # 兼容表意文字
    (0x20000, 0x2A6DF),  # 扩展 B
    (0x2A700, 0x2B73F),  # 扩展 C
    (0x2B740, 0x2B81F),  # 扩展 D
    (0x2B820, 0x2CEAF),  # 扩展 E
    (0x2CEB0, 0x2EBEF),  # 扩展 F
    (0x2EBF0, 0x2EE5F),  # 扩展 I
    (0x2F800, 0x2FA1F),  # 兼容表意文字补充
    (0x30000, 0x3134F),  # 扩展 G
    (0x31350, 0x323AF),  # 扩展 H
)

_HAN_STARTS = tuple(start for start, _ in HAN_RANGES)
_HAN_ENDS = tuple(end for _, end in HAN_RANGES)

# 单次调用的文本长度上限与批量条数上限，避免客户端一次丢进超大 payload。
MAX_TEXT_LENGTH = 200_000
MAX_BATCH_SIZE = 500

# Unicode 类别归类的目标桶（顺序即返回结果中的字段顺序）。
CATEGORIES = ("chinese", "letters", "digits", "punctuation", "spaces", "other")

# 这些控制字符本质是空白，归入 spaces 桶。
_ASCII_WHITESPACE = "\t\n\r\v\f"


def is_chinese_char(char: str) -> bool:
    """判断单个字符是否计入“中文”。

    计入：CJK 统一表意文字（基本区、扩展 A~I、兼容表意文字）与“〇”。
    不计入：标点、空格、英文字母、阿拉伯数字、emoji 及其他文字（假名、谚文等）。
    """
    if not char:
        return False
    codepoint = ord(char)
    index = bisect_right(_HAN_STARTS, codepoint) - 1
    return index >= 0 and codepoint <= _HAN_ENDS[index]


def classify_char(char: str) -> str:
    """把字符归入 CATEGORIES 中的一个桶。"""
    if is_chinese_char(char):
        return "chinese"
    if char in _ASCII_WHITESPACE:
        return "spaces"
    category = unicodedata.category(char)
    first = category[0]
    if first == "L":
        return "letters"
    if first == "N":
        return "digits"
    if first == "Z":
        return "spaces"
    if first == "P":
        return "punctuation"
    return "other"


def count_text(text: str) -> Dict[str, Any]:
    """统计文本的中文字数并给出分项明细。

    :raises TypeError: text 不是字符串
    :raises ValueError: text 长度超过 MAX_TEXT_LENGTH
    """
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(
            "text is too long: %d characters (limit %d)" % (len(text), MAX_TEXT_LENGTH)
        )

    breakdown = {name: 0 for name in CATEGORIES}
    for char in text:
        breakdown[classify_char(char)] += 1

    chinese_count = breakdown["chinese"]
    total = len(text)
    return {
        "chinese_count": chinese_count,
        "total_characters": total,
        "chinese_ratio": round(chinese_count / total, 4) if total else 0.0,
        "breakdown": breakdown,
    }


def extract_chinese(text: str) -> str:
    """抽取文本中所有计入“中文”的字符，按原顺序拼接返回。"""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(
            "text is too long: %d characters (limit %d)" % (len(text), MAX_TEXT_LENGTH)
        )
    return "".join(char for char in text if is_chinese_char(char))


def count_batch(texts: Sequence[str]) -> Dict[str, Any]:
    """批量统计多条文本的中文字数。

    :raises TypeError: texts 不是列表/元组，或其中某项不是字符串
    :raises ValueError: 条数超过 MAX_BATCH_SIZE，或某条文本超长
    """
    if not isinstance(texts, (list, tuple)):
        raise TypeError("texts must be a list of strings")
    if len(texts) > MAX_BATCH_SIZE:
        raise ValueError(
            "too many texts: %d (limit %d)" % (len(texts), MAX_BATCH_SIZE)
        )

    results = []
    total_chinese = 0
    for index, item in enumerate(texts):
        item_counts = count_text(item)
        total_chinese += item_counts["chinese_count"]
        results.append(
            {
                "index": index,
                "total_characters": item_counts["total_characters"],
                "chinese_count": item_counts["chinese_count"],
                "chinese_ratio": item_counts["chinese_ratio"],
            }
        )
    return {
        "results": results,
        "text_count": len(results),
        "total_chinese_count": total_chinese,
    }
