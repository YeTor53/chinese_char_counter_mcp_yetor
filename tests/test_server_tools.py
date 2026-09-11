"""MCP 工具层测试：信封字段与错误处理（不启动传输层）。"""

from chinese_char_counter_mcp import server


def test_tool_returns_envelope_with_clean_error():
    result = server.count_chinese_characters("你好，世界！")
    assert result["chinese_count"] == 4
    assert result["error"] == ""


def test_tool_reports_error_instead_of_raising():
    result = server.count_chinese_characters(None)  # type: ignore[arg-type]
    assert result["chinese_count"] == 0
    assert result["error"].startswith("count_chinese_characters failed:")
    # 错误信封与成功信封字段同构，类型稳定
    assert set(result) == {
        "chinese_count",
        "total_characters",
        "chinese_ratio",
        "breakdown",
        "error",
    }


def test_batch_tool_envelope():
    result = server.count_chinese_characters_batch(["中文一", "two 二三"])
    assert result["text_count"] == 2
    assert result["total_chinese_count"] == 5
    assert result["error"] == ""


def test_batch_tool_error_envelope():
    result = server.count_chinese_characters_batch(["ok", 123])  # type: ignore[list-item]
    assert result["results"] == []
    assert result["total_chinese_count"] == 0
    assert result["error"].startswith("count_chinese_characters_batch failed:")


def test_extract_tool_envelope():
    result = server.extract_chinese_text("Hello 世界 2026")
    assert result["chinese_text"] == "世界"
    assert result["chinese_count"] == 2
    assert result["error"] == ""


def test_all_tools_are_registered():
    registered = {function.__name__ for function in server.TOOL_FUNCTIONS}
    assert registered == {
        "count_chinese_characters",
        "count_chinese_characters_batch",
        "extract_chinese_text",
    }
