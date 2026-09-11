/**
 * 中文字数统计核心逻辑（与仓库里的 Python 版逐字对齐）。
 *
 * 纯函数，不打印任何内容 —— MCP STDIO 传输里 stdout 是协议通道，
 * 任何 console.log 都会搅坏 JSON-RPC 帧（日志一律走 stderr）。
 */

// 计入「中文」的码位区间：CJK 统一表意文字、各扩展区、兼容表意文字，以及表意数字零「〇」。
// 与 Python 版 HAN_RANGES 完全一致，升序排列。
export const HAN_RANGES = [
  [0x3007, 0x3007],    // 〇 表意数字零
  [0x3400, 0x4dbf],    // 扩展 A
  [0x4e00, 0x9fff],    // 基本区
  [0xf900, 0xfaff],    // 兼容表意文字
  [0x20000, 0x2a6df],  // 扩展 B
  [0x2a700, 0x2b73f],  // 扩展 C
  [0x2b740, 0x2b81f],  // 扩展 D
  [0x2b820, 0x2ceaf],  // 扩展 E
  [0x2ceb0, 0x2ebef],  // 扩展 F
  [0x2ebf0, 0x2ee5f],  // 扩展 I
  [0x2f800, 0x2fa1f],  // 兼容表意文字补充
  [0x30000, 0x3134f],  // 扩展 G
  [0x31350, 0x323af],  // 扩展 H
];

export const MAX_TEXT_LENGTH = 200000;
export const MAX_BATCH_SIZE = 500;
export const CATEGORIES = ["chinese", "letters", "digits", "punctuation", "spaces", "other"];

const ASCII_WHITESPACE = new Set(["\t", "\n", "\r", "\v", "\f"]);

export function isChineseChar(char) {
  if (!char) return false;
  const cp = char.codePointAt(0);
  for (const [lo, hi] of HAN_RANGES) {
    if (cp >= lo && cp <= hi) return true;
    if (cp < lo) return false; // 区间升序，提前退出
  }
  return false;
}

export function classifyChar(char) {
  if (isChineseChar(char)) return "chinese";
  if (ASCII_WHITESPACE.has(char)) return "spaces";
  // 顺序与 Python 版一致：L → N → Z → P
  if (/\p{L}/u.test(char)) return "letters";
  if (/\p{N}/u.test(char)) return "digits";
  if (/\p{Z}/u.test(char)) return "spaces";
  if (/\p{P}/u.test(char)) return "punctuation";
  return "other";
}

/** 复刻 Python round(x, 4) 的「四舍六入五成双」行为。 */
export function roundRatio(value, digits = 4) {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded;
  if (Math.abs(diff - 0.5) < 1e-9) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / factor;
}

function emptyBreakdown() {
  return { chinese: 0, letters: 0, digits: 0, punctuation: 0, spaces: 0, other: 0 };
}

export function countText(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  // 按「码点」而不是 UTF-16 码元计数：Python 的 len(str) 数的是码点，
  // 用 text.length 会让 emoji / 扩展 B 生僻字（代理对）多算一倍。
  const characters = [...text];
  if (characters.length > MAX_TEXT_LENGTH) {
    throw new RangeError(
      `text is too long: ${characters.length} characters (limit ${MAX_TEXT_LENGTH})`,
    );
  }
  const breakdown = emptyBreakdown();
  for (const char of characters) breakdown[classifyChar(char)] += 1;
  const chineseCount = breakdown.chinese;
  const total = characters.length;
  return {
    chinese_count: chineseCount,
    total_characters: total,
    chinese_ratio: total ? roundRatio(chineseCount / total) : 0.0,
    breakdown,
  };
}

export function extractChinese(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const characters = [...text];
  if (characters.length > MAX_TEXT_LENGTH) {
    throw new RangeError(
      `text is too long: ${characters.length} characters (limit ${MAX_TEXT_LENGTH})`,
    );
  }
  let out = "";
  for (const char of characters) if (isChineseChar(char)) out += char;
  return out;
}

export function countBatch(texts) {
  if (!Array.isArray(texts)) throw new TypeError("texts must be a list of strings");
  if (texts.length > MAX_BATCH_SIZE) {
    throw new RangeError(`too many texts: ${texts.length} (limit ${MAX_BATCH_SIZE})`);
  }
  const results = [];
  let totalChinese = 0;
  texts.forEach((item, index) => {
    const counts = countText(item);
    totalChinese += counts.chinese_count;
    results.push({
      index,
      total_characters: counts.total_characters,
      chinese_count: counts.chinese_count,
      chinese_ratio: counts.chinese_ratio,
    });
  });
  return { results, text_count: results.length, total_chinese_count: totalChinese };
}
