"""counter 模块单元测试（pytest 风格，纯断言，无外部依赖）。"""

import pytest

from chinese_char_counter_mcp.counter import (
    MAX_BATCH_SIZE,
    MAX_TEXT_LENGTH,
    classify_char,
    count_batch,
    count_text,
    extract_chinese,
    is_chinese_char,
)


def test_counts_only_chinese_characters():
    result = count_text("你好，World 123！")
    assert result["chinese_count"] == 2
    assert result["total_characters"] == 13
    assert result["breakdown"]["chinese"] == 2
    assert result["breakdown"]["letters"] == 5
    assert result["breakdown"]["digits"] == 3
    assert result["breakdown"]["punctuation"] == 2
    assert result["breakdown"]["spaces"] == 1


def test_chinese_punctuation_is_not_counted():
    assert count_text("，。、；：！“”‘’（）《》")["chinese_count"] == 0


def test_letters_digits_and_whitespace_are_not_counted():
    assert count_text("abcXYZ 0123456789\t\n")["chinese_count"] == 0


def test_emoji_and_other_scripts_go_to_other_bucket():
    result = count_text("🙂こんにちは한글Привет")
    assert result["chinese_count"] == 0
    assert result["breakdown"]["other"] == 1
    assert result["breakdown"]["letters"] == 13


def test_ratio_and_empty_text():
    empty = count_text("")
    assert empty["chinese_count"] == 0
    assert empty["total_characters"] == 0
    assert empty["chinese_ratio"] == 0.0

    mixed = count_text("中文abc")
    assert mixed["chinese_ratio"] == round(2 / 5, 4)


def test_ideographic_zero_counts_as_chinese():
    assert is_chinese_char("〇") is True
    assert count_text("二〇二六年")["chinese_count"] == 5


def test_iteration_mark_is_not_chinese():
    # 々(U+3005) 是日文迭字符，不属于表意文字本体
    assert is_chinese_char("々") is False


def test_extension_a_and_compatibility_ideographs():
    assert is_chinese_char("\u3402") is True   # 扩展 A
    assert is_chinese_char("\uf900") is True   # 兼容表意文字
    assert is_chinese_char("\U00020000") is True  # 扩展 B


def test_classify_char_buckets():
    assert classify_char("字") == "chinese"
    assert classify_char("A") == "letters"
    assert classify_char("7") == "digits"
    assert classify_char("，") == "punctuation"
    assert classify_char(" ") == "spaces"
    assert classify_char("®") == "other"


def test_extract_chinese():
    assert extract_chinese("你好，World 123！再见") == "你好再见"


def test_count_batch_totals():
    batch = count_batch(["第一段", "abc 第二段"])
    assert batch["text_count"] == 2
    assert batch["total_chinese_count"] == 6
    assert [item["index"] for item in batch["results"]] == [0, 1]
    assert batch["results"][0]["chinese_count"] == 3
    assert batch["results"][1]["chinese_count"] == 3


def test_rejects_non_string_and_oversized_input():
    with pytest.raises(TypeError):
        count_text(123)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        count_text("中" * (MAX_TEXT_LENGTH + 1))
    with pytest.raises(TypeError):
        count_batch("不是列表")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        count_batch(["中"] * (MAX_BATCH_SIZE + 1))


def test_long_text_within_limit_is_fine():
    text = "中文" * 1000
    assert count_text(text)["chinese_count"] == 2000
