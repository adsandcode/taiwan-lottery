#!/usr/bin/env node
/**
 * taiwan-lottery MCP server (stdio).
 *
 * Lets an assistant answer questions about official Taiwan Lottery draws with
 * the official numbers instead of guessing them. Every tool reads the official
 * API (read only); nothing is written anywhere.
 *
 * The selftest runs once at startup, against recorded official responses and
 * without the network, and the server refuses to start if it fails: a ticket
 * checker that cannot show it still names the right prize tiers should not
 * be answering.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { LotteryService } from "./service.js";
import { TOOLS } from "./tools.js";
import { InputError, NotFoundError } from "./errors.js";
import { resolveGame } from "./games.js";
import { moreLinks } from "./links.js";
import { run as runSelftest } from "./selftest.js";
import { VERSION } from "./version.js";

const service = new LotteryService();
const server = new McpServer({ name: "taiwan-lottery", version: VERSION });

const text = (payload: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] });

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args: Record<string, unknown>) => {
      try {
        return text(await tool.run(service, args));
      } catch (err) {
        const kind = err instanceof InputError ? "input" : err instanceof NotFoundError ? "not_found" : "upstream";
        const message = err instanceof Error ? err.message : String(err);
        const def = typeof args.game === "string" ? resolveGame(args.game) : null;
        const more = def ? moreLinks(def.id, tool.intent) : undefined;
        return { ...text({ error: message, kind, notice: "以台灣彩券官方公告為準。", ...(more ? { more } : {}) }), isError: true };
      }
    },
  );
}

async function main() {
  const lines: string[] = [];
  if (!(await runSelftest((s) => lines.push(s)))) {
    console.error("taiwan-lottery: selftest failed, refusing to start.");
    console.error(lines.join("\n"));
    process.exit(2);
  }
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("taiwan-lottery: fatal", err);
  process.exit(1);
});
