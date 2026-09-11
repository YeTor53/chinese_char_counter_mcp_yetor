import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, "..", "bin", "server.js");

/** 起一个真实子进程，按行收发 JSON-RPC。 */
function startServer() {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  const messages = [];
  const waiters = [];
  let buffer = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const parsed = JSON.parse(line); // 解析失败 = 协议被污染，直接抛
      messages.push(parsed);
      for (const waiter of [...waiters]) {
        if (waiter.match(parsed)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(parsed);
        }
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => (stderr += chunk));

  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  const waitFor = (match, label) =>
    new Promise((resolve, reject) => {
      const hit = messages.find(match);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), 10000);
      waiters.push({
        match,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });

  return { child, send, waitFor, messages, stderrText: () => stderr };
}

test("stdio 协议全链路：initialize / tools/list / tools/call / ping / 未知方法", async () => {
  const server = startServer();
  try {
    server.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    const init = await server.waitFor((m) => m.id === 1, "initialize");
    assert.equal(init.result.protocolVersion, "2025-06-18");
    assert.equal(init.result.serverInfo.name, "chinese-char-counter");
    assert.match(init.result.serverInfo.version, /^\d+\.\d+\.\d+$/);
    assert.equal(init.result.capabilities.tools.listChanged, false);

    server.send({ jsonrpc: "2.0", method: "notifications/initialized" });

    server.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const list = await server.waitFor((m) => m.id === 2, "tools/list");
    assert.deepEqual(
      list.result.tools.map((tool) => tool.name),
      ["count_chinese_characters", "count_chinese_characters_batch", "extract_chinese_text"],
    );
    for (const tool of list.result.tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.ok(tool.inputSchema.required.length >= 1);
      assert.equal(tool.annotations.readOnlyHint, true);
    }

    server.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "count_chinese_characters", arguments: { text: "你好，World 2026！" } },
    });
    const call = await server.waitFor((m) => m.id === 3, "tools/call");
    assert.equal(call.result.isError, false);
    assert.equal(call.result.structuredContent.chinese_count, 2);
    assert.equal(call.result.structuredContent.total_characters, 14);
    assert.equal(call.result.structuredContent.error, "");
    assert.equal(JSON.parse(call.result.content[0].text).chinese_count, 2);

    server.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "count_chinese_characters_batch", arguments: { texts: ["第一段", "abc 第二段"] } },
    });
    const batch = await server.waitFor((m) => m.id === 4, "batch call");
    assert.equal(batch.result.structuredContent.total_chinese_count, 6);

    server.send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "不存在", arguments: {} } });
    const unknownTool = await server.waitFor((m) => m.id === 5, "unknown tool");
    assert.equal(unknownTool.result.isError, true);

    server.send({ jsonrpc: "2.0", id: 6, method: "resources/list" });
    const unknownMethod = await server.waitFor((m) => m.id === 6, "unknown method");
    assert.equal(unknownMethod.error.code, -32601);

    server.send({ jsonrpc: "2.0", id: 7, method: "ping" });
    const pong = await server.waitFor((m) => m.id === 7, "ping");
    assert.deepEqual(pong.result, {});

    server.send({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "count_chinese_characters", arguments: { text: "中".repeat(200001) } } });
    const oversized = await server.waitFor((m) => m.id === 8, "oversized");
    assert.equal(oversized.result.isError, false);
    assert.match(oversized.result.structuredContent.error, /too long/);

    // stdout 里只允许出现合法协议帧（每条都已被上面的 JSON.parse 校验过）
    assert.equal(server.messages.length >= 7, true);
  } finally {
    server.child.kill();
  }
});

test("格式错误的输入回 -32700 且不影响后续请求", async () => {
  const server = startServer();
  try {
    server.child.stdin.write("{不是合法 JSON\n");
    const parseError = await server.waitFor((m) => m.error && m.error.code === -32700, "parse error");
    assert.equal(parseError.id, null);
    server.send({ jsonrpc: "2.0", id: 1, method: "ping" });
    const pong = await server.waitFor((m) => m.id === 1, "ping after parse error");
    assert.deepEqual(pong.result, {});
  } finally {
    server.child.kill();
  }
});
