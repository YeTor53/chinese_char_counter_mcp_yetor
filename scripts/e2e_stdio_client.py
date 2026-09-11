"""STDIO 端到端验证：initialize -> list_tools -> call_tool。

用法（项目根目录下，用 >=3.10 且装了 mcp 的解释器）：
    python scripts/e2e_stdio_client.py

判据：stdout 只有本脚本自己打印的内容；服务端日志若出现，只能出现在 stderr。
"""

import asyncio
import os
import pathlib
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


async def main() -> None:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(SRC) + os.pathsep + env.get("PYTHONPATH", "")
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "chinese_char_counter_mcp"],
        cwd=str(ROOT),
        env=env,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("list_tools:", [tool.name for tool in tools.tools])

            result = await session.call_tool(
                "count_chinese_characters", {"text": "你好，World 2026！"}
            )
            print("count_chinese_characters ->", result.structuredContent)

            result = await session.call_tool(
                "count_chinese_characters_batch", {"texts": ["第一段", "abc 第二段"]}
            )
            print("count_chinese_characters_batch ->", result.structuredContent)

            result = await session.call_tool(
                "extract_chinese_text", {"text": "Hello 世界 2026"}
            )
            print("extract_chinese_text ->", result.structuredContent)

            result = await session.call_tool(
                "count_chinese_characters", {"text": "中文" * 200001}
            )
            print("oversized input ->", result.structuredContent)


if __name__ == "__main__":
    asyncio.run(main())
