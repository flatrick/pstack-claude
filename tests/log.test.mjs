import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const logScript = fileURLToPath(new URL("../plugins/pstack/skills/show-me-your-work/scripts/log.mjs", import.meta.url));

test("keeps literal cells and neutralizes spreadsheet or TSV prefixes", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const cells = ['"=HYPERLINK(""http://x"")"', "=1+1", "+1", "-1", "@SUM(A1)"];
    const result = spawnSync("node", [logScript, log, ...cells], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const rows = readFileSync(log, "utf8").trimEnd().split("\n");
    expect(rows[1].split("\t").slice(1)).toEqual(cells.map((cell) => `'${cell}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent writers append complete rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    // Windows limits a process's entire command line; POSIX permits larger rows.
    const value = "x".repeat(process.platform === "win32" ? 1000 : 100_000);
    const count = process.platform === "win32" ? 20 : 40;
    const writers = Array.from({ length: count }, (_, i) =>
      spawn("node", [logScript, log, `p${i}`, ...Array(4).fill(value)], { stdio: "ignore" }),
    );
    const exits = await Promise.all(writers.map((writer) => once(writer, "exit")));
    expect(exits.map(([code]) => code)).toEqual(Array(count).fill(0));
    const rows = readFileSync(log, "utf8").trimEnd().split("\n").filter((line) => !line.startsWith("ts\t"));
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((line) => line.split("\t")[1])).size).toBe(count);
    for (const line of rows) {
      const cells = line.split("\t");
      expect(cells).toHaveLength(6);
      expect(cells.slice(2)).toEqual(Array(4).fill(value));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
