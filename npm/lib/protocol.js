/**
 * 极简 MCP STDIO 服务端（JSON-RPC 2.0，零依赖）。
 *
 * 只实现本服务需要的部分：initialize / notifications/initialized / ping /
 * tools/list / tools/call；其余方法一律回 -32601，未知通知忽略。
 *
 * 铁律：stdout 只允许出现协议帧；日志一律走 stderr。
 */

import { createInterface } from "node:readline";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export function createServer({ name, version, instructions, websiteUrl, tools }) {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  const write = (message) => {
    process.stdout.write(JSON.stringify(message) + "\n");
  };
  const reply = (id, result) => write({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => write({ jsonrpc: "2.0", id, error: { code, message } });

  const listTools = () =>
    [...toolMap.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));

  async function handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      fail(null, -32600, "Invalid Request");
      return;
    }
    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const { method, params } = message;

    if (typeof method !== "string") {
      if (hasId) fail(message.id ?? null, -32600, "Invalid Request");
      return;
    }

    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : LATEST_PROTOCOL_VERSION;
        reply(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version, ...(websiteUrl ? { websiteUrl } : {}) },
          ...(instructions ? { instructions } : {}),
        });
        return;
      }
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/roots/list_changed":
        return; // 通知不需要回复
      case "ping":
        reply(message.id, {});
        return;
      case "tools/list":
        reply(message.id, { tools: listTools() });
        return;
      case "tools/call": {
        const toolName = params?.name;
        const tool = toolMap.get(toolName);
        if (!tool) {
          reply(message.id, {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          });
          return;
        }
        let result;
        try {
          result = tool.handler(params?.arguments ?? {});
        } catch (error) {
          result = { error: `${toolName} failed: ${error?.message ?? error}` };
        }
        reply(message.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
        return;
      }
      default:
        if (hasId) fail(message.id ?? null, -32601, `Method not found: ${method}`);
    }
  }

  function start() {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        fail(null, -32700, `Parse error: ${error?.message ?? error}`);
        return;
      }
      const jobs = Array.isArray(message) ? message : [message];
      for (const job of jobs) {
        Promise.resolve(handle(job)).catch((error) => {
          process.stderr.write(`handler error: ${error?.stack ?? error}\n`);
        });
      }
    });
    rl.on("close", () => process.exit(0));
  }

  return { start, handle, listTools };
}
