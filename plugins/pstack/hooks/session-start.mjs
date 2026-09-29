#!/usr/bin/env node
// Usage: node session-start.mjs <claude|codex>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const runtime = process.argv[2] ?? "";
if (runtime !== "claude" && runtime !== "codex") {
  console.error(`session-start.mjs: unknown runtime '${runtime}' (expected claude or codex)`);
  process.exitCode = 2;
} else {
  try {
    const home = process.env.HOME || homedir();
    const config = runtime === "claude"
      ? process.env.CLAUDE_CONFIG_DIR || join(home, ".claude")
      : process.env.CODEX_HOME || join(home, ".codex");
    let sheet = "";
    try {
      sheet = readFileSync(join(config, "pstack-models.md"), "utf8");
    } catch {
      // Like grep -qs in the shell hook, an unreadable sheet leaves routing on.
    }
    if (!sheet.split(/\r?\n/).includes("session hook: off")) {
      if (!process.env.CLAUDE_PLUGIN_ROOT) throw new Error("CLAUDE_PLUGIN_ROOT is not set");
      process.stdout.write(readFileSync(join(process.env.CLAUDE_PLUGIN_ROOT, "hooks/session-start-context.md")));
    }
  } catch (error) {
    console.error(`session-start.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
