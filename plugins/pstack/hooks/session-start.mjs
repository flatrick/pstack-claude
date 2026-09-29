#!/usr/bin/env node
// Usage: node session-start.mjs <claude|codex|copilot>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkCopilotSheet, readSheet } from "./session-sheet.mjs";

const runtime = process.argv[2] ?? "";
if (!["claude", "codex", "copilot"].includes(runtime)) {
  console.error(`session-start.mjs: unknown runtime '${runtime}' (expected claude, codex, or copilot)`);
  process.exitCode = 2;
} else {
  try {
    const home = (process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) || homedir();
    const dirs = {
      claude: ["CLAUDE_CONFIG_DIR", ".claude", "CLAUDE_PLUGIN_ROOT"],
      codex: ["CODEX_HOME", ".codex", "CLAUDE_PLUGIN_ROOT"],
      copilot: ["COPILOT_HOME", ".copilot", "COPILOT_PLUGIN_ROOT"],
    };
    const [configVar, defaultDir, rootVar] = dirs[runtime];
    const config = process.env[configVar] || join(home, defaultDir);
    const sheet = readSheet(join(config, "pstack-models.md"));
    if (!sheet?.includes("session hook: off")) {
      const root = process.env[rootVar];
      if (!root) throw new Error(`${rootVar} is not set`);
      const hooks = join(root, "hooks");
      const mandate = readFileSync(join(hooks, "session-start-context.md"), "utf8");
      if (runtime === "copilot") {
        const note = (name) => readFileSync(join(hooks, name), "utf8").trimEnd();
        let notes = note("session-start-copilot.md");
        let problems = [];
        let values;
        let roles;
        if (sheet) {
          const models = JSON.parse(readFileSync(join(root, "models.json"), "utf8"));
          roles = models.roles;
          ({ problems, values } = checkCopilotSheet(sheet, models));
        }
        if (sheet && problems.length === 0) {
          notes += `\n\n${note("session-start-copilot-sheet.md")}\n\n`;
          notes += roles.map(({ role }) => `${role}: ${values.get(role)}`).join("\n");
          if (values.has("default effort")) notes += `\ndefault effort: ${values.get("default effort")}`;
        } else {
          if (sheet) notes += `\n\nsheet invalid: ${problems.join("; ")}`;
          notes += `\n\n${note("session-start-copilot-setup.md")}`;
        }
        const close = "</EXTREMELY_IMPORTANT>";
        const at = mandate.indexOf(close);
        const context = at < 0 ? `${mandate}\n${notes}` : `${mandate.slice(0, at)}\n${notes}\n${mandate.slice(at)}`;
        process.stdout.write(JSON.stringify({ additionalContext: context }) + "\n");
      } else {
        process.stdout.write(mandate);
      }
    }
  } catch (error) {
    console.error(`session-start.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
