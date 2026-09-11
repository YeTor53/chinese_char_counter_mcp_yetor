#!/usr/bin/env node
/**
 * 中文字数统计 MCP 服务（STDIO，零依赖）。
 *
 * 用法：npx -y chinese-char-counter-mcp@latest
 * 与仓库里的 Python 版工具名、参数、返回结构完全一致。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "../lib/protocol.js";
import { countBatch, countText, extractChinese } from "../lib/counter.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

const SERVER_NAME = "chinese-char-counter";
const WEBSITE_URL = "https://github.com/YeTor53/chinese_char_counter_mcp_yetor";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    chinese: { type: "integer" },
    letters: { type: "integer" },
    digits: { type: "integer" },
    punctuation: { type: "integer" },
    spaces: { type: "integer" },
    other: { type: "integer" },
  },
  required: ["chinese", "letters", "digits", "punctuation", "spaces", "other"],
  additionalProperties: false,
};

function emptyResult(message) {
  return {
    chinese_count: 0,
    total_characters: 0,
    chinese_ratio: 0.0,
    breakdown: { chinese: 0, letters: 0, digits: 0, punctuation: 0, spaces: 0, other: 0 },
    error: message,
  };
}

function countChineseCharacters(args) {
  try {
    const counts = countText(args.text);
    return { ...counts, error: "" };
  } catch (error) {
    return emptyResult(`count_chinese_characters failed: ${error?.message ?? error}`);
  }
}

function countChineseCharactersBatch(args) {
  try {
    const batch = countBatch(args.texts);
    return { ...batch, error: "" };
  } catch (error) {
    return {
      results: [],
      text_count: 0,
      total_chinese_count: 0,
      error: `count_chinese_characters_batch failed: ${error?.message ?? error}`,
    };
  }
}

function extractChineseText(args) {
  try {
    const chineseText = extractChinese(args.text);
    return { chinese_text: chineseText, chinese_count: [...chineseText].length, error: "" };
  } catch (error) {
    return { chinese_text: "", chinese_count: 0, error: `extract_chinese_text failed: ${error?.message ?? error}` };
  }
}

const tools = [
  {
    name: "count_chinese_characters",
    description:
      "统计一段文本的中文字数（不算标点、空格、英文字母、数字等）。text 长度上限 200000 个字符；" +
      "返回 chinese_count（中文字数）、total_characters（文本总字符数）、chinese_ratio（中文占比，4 位小数）、" +
      "breakdown（chinese/letters/digits/punctuation/spaces/other 分项计数）与 error（成功时为空字符串）。",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "待统计的文本" } },
      required: ["text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        chinese_count: { type: "integer" },
        total_characters: { type: "integer" },
        chinese_ratio: { type: "number" },
        breakdown: BREAKDOWN_SCHEMA,
        error: { type: "string" },
      },
      required: ["chinese_count", "total_characters", "chinese_ratio", "breakdown", "error"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    handler: countChineseCharacters,
  },
  {
    name: "count_chinese_characters_batch",
    description:
      "批量统计多条文本的中文字数并给出合计。texts 最多 500 条、每条上限 200000 个字符；" +
      "返回 results（与输入顺序一致，含 index/total_characters/chinese_count/chinese_ratio）、" +
      "text_count、total_chinese_count 与 error。",
    inputSchema: {
      type: "object",
      properties: {
        texts: { type: "array", items: { type: "string" }, description: "待统计的文本列表" },
      },
      required: ["texts"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer" },
              total_characters: { type: "integer" },
              chinese_count: { type: "integer" },
              chinese_ratio: { type: "number" },
            },
            required: ["index", "total_characters", "chinese_count", "chinese_ratio"],
          },
        },
        text_count: { type: "integer" },
        total_chinese_count: { type: "integer" },
        error: { type: "string" },
      },
      required: ["results", "text_count", "total_chinese_count", "error"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    handler: countChineseCharactersBatch,
  },
  {
    name: "extract_chinese_text",
    description:
      "抽取文本中的中文字符，剔除标点、空格、英文、数字等其它字符。text 长度上限 200000 个字符；" +
      "返回 chinese_text（纯中文文本）、chinese_count 与 error。",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "待处理的文本" } },
      required: ["text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        chinese_text: { type: "string" },
        chinese_count: { type: "integer" },
        error: { type: "string" },
      },
      required: ["chinese_text", "chinese_count", "error"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    handler: extractChineseText,
  },
];

const server = createServer({
  name: SERVER_NAME,
  version: pkg.version,
  websiteUrl: WEBSITE_URL,
  instructions:
    "统计一段文本里的中文字数（不含标点、空格、英文字母、数字等）。" +
    "count_chinese_characters 返回中文字数与分项明细；" +
    "count_chinese_characters_batch 用于批量统计多条文本；" +
    "extract_chinese_text 返回剔除其它字符后的纯中文文本。",
  tools,
});

server.start();
