import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BATCH_SIZE,
  MAX_TEXT_LENGTH,
  classifyChar,
  countBatch,
  countText,
  extractChinese,
  isChineseChar,
} from "../lib/counter.js";

test("只统计中文，标点/英文/数字/空格都不计入", () => {
  const result = countText("你好，World 2026！");
  assert.equal(result.chinese_count, 2);
  assert.equal(result.total_characters, 14);
  assert.deepEqual(result.breakdown, {
    chinese: 2,
    letters: 5,
    digits: 4,
    punctuation: 2,
    spaces: 1,
    other: 0,
  });
});

test("中文标点不计入", () => {
  assert.equal(countText("，。、；：！“”‘’（）《》").chinese_count, 0);
});

test("英文字母/数字/空白不计入", () => {
  assert.equal(countText("abcXYZ 0123456789\t\n").chinese_count, 0);
});

test("emoji 与其它文字系统归入 other / letters", () => {
  const result = countText("🙂こんにちは한글Привет");
  assert.equal(result.chinese_count, 0);
  assert.equal(result.breakdown.other, 1);
  assert.equal(result.breakdown.letters, 13);
});

test("空文本与占比", () => {
  const empty = countText("");
  assert.equal(empty.chinese_count, 0);
  assert.equal(empty.total_characters, 0);
  assert.equal(empty.chinese_ratio, 0.0);
  assert.equal(countText("中文abc").chinese_ratio, 0.4);
});

test("表意数字零「〇」计入，日文迭字符「々」不计入", () => {
  assert.equal(isChineseChar("〇"), true);
  assert.equal(countText("二〇二六年").chinese_count, 5);
  assert.equal(isChineseChar("々"), false);
});

test("扩展 A / 兼容表意文字 / 扩展 B（代理对）都计入", () => {
  assert.equal(isChineseChar("\u3402"), true);
  assert.equal(isChineseChar("\uf900"), true);
  assert.equal(isChineseChar("\u{20000}"), true);
  assert.equal(countText("𠀀").chinese_count, 1);
});

test("total_characters 按码点计（代理对算 1 个，与 Python len() 一致）", () => {
  assert.equal(countText("𠀀").total_characters, 1);
  assert.equal(countText("𠀀𠀁").total_characters, 2);
  assert.equal(countText("😀😀😀emoji测试🎉").total_characters, 11);
  assert.equal(countText("😀😀😀emoji测试🎉").chinese_ratio, 0.1818);
  assert.equal(countText("𠮷野家").total_characters, 3);
});

test("分类桶", () => {
  assert.equal(classifyChar("字"), "chinese");
  assert.equal(classifyChar("A"), "letters");
  assert.equal(classifyChar("7"), "digits");
  assert.equal(classifyChar("，"), "punctuation");
  assert.equal(classifyChar(" "), "spaces");
  assert.equal(classifyChar("®"), "other");
});

test("抽取纯中文", () => {
  assert.equal(extractChinese("你好，World 123！再见"), "你好再见");
});

test("批量统计与合计", () => {
  const batch = countBatch(["第一段", "abc 第二段"]);
  assert.equal(batch.text_count, 2);
  assert.equal(batch.total_chinese_count, 6);
  assert.deepEqual(batch.results.map((item) => item.index), [0, 1]);
});

test("非法输入与超限输入抛错", () => {
  assert.throws(() => countText(123), TypeError);
  assert.throws(() => countText("中".repeat(MAX_TEXT_LENGTH + 1)), RangeError);
  assert.throws(() => countBatch("不是数组"), TypeError);
  assert.throws(() => countBatch(["中", 123]), TypeError);
  assert.throws(() => countBatch(Array(MAX_BATCH_SIZE + 1).fill("中")), RangeError);
});

test("上限内的大文本正常", () => {
  assert.equal(countText("中文".repeat(1000)).chinese_count, 2000);
});
