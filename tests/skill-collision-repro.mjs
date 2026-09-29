#!/usr/bin/env node
// Manual skill-only slash check. Requires the native Claude CLI and API access.
// Usage: node tests/skill-collision-repro.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function runRepro(run = spawnSync) {
  const scratch = mkdtempSync(join(tmpdir(), "pstack-skill-collision-"));
  try {
    mkdirSync(join(scratch, ".claude-plugin"));
    mkdirSync(join(scratch, "skills/foo"), { recursive: true });
    writeFileSync(join(scratch, ".claude-plugin/plugin.json"), JSON.stringify({
      name: "testplug", version: "0.0.1", description: "skill-only slash repro",
    }) + "\n");
    writeFileSync(join(scratch, "skills/foo/SKILL.md"),
      "---\nname: foo\ndescription: skill-only slash test\n---\n\nSay exactly: SKILL-RAN\nThen stop. Do not invoke any skill or tool.\n");
    const result = run("claude", ["-p", "--plugin-dir", scratch, "--model", "haiku", "--max-turns", "3", "/testplug:foo"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    if (result.error) throw result.error;
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    if (result.status === 0 && output.includes("SKILL-RAN")) {
      return { status: 0, message: "ok: user-typed /plugin:name reaches the skill with no commands/ present" };
    }
    return { status: 1, message: `FAIL (claude exit ${result.status}): /testplug:foo did not run the skill, got: ${output}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    const result = runRepro();
    console.log(result.message);
    process.exitCode = result.status;
  } catch (error) {
    console.error(`skill-collision-repro.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
