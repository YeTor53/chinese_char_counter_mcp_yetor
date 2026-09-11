"""中文字数统计 MCP 服务（STDIO）。"""

from .counter import (
    CATEGORIES,
    MAX_BATCH_SIZE,
    MAX_TEXT_LENGTH,
    classify_char,
    count_batch,
    count_text,
    extract_chinese,
    is_chinese_char,
)

__version__ = "0.1.1"

__all__ = [
    "CATEGORIES",
    "MAX_BATCH_SIZE",
    "MAX_TEXT_LENGTH",
    "__version__",
    "classify_char",
    "count_batch",
    "count_text",
    "extract_chinese",
    "is_chinese_char",
]
