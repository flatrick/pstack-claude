import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runRepro } from "./skill-collision-repro.mjs";

const pluginRoot = fileURLToPath(new URL("../plugins/pstack/", import.meta.url));
const logScript = join(pluginRoot, "skills/show-me-your-work/scripts/log.mjs");
const hookScript = join(pluginRoot, "hooks/session-start.mjs");
const context = readFileSync(join(pluginRoot, "hooks/session-start-context.md"), "utf8");
const fixtures = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "pstack node å "));
  fixtures.push(dir);
  return dir;
}
function node(script, args, env = {}) {
  const result = spawnSync("node", [script, ...args], {
    env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true,
  });
  if (result.error) throw result.error;
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe("Node decision log", () => {
  test("creates parent directories and appends UTF-8 rows with one header and UTC timestamps", () => {
    const file = join(tempDir(), "nested directory", "beslut.tsv");
    const cells = ["phase", "väljer 日本語", "", "evidence", "result"];
    const before = Date.now();
    expect(node(logScript, [file, ...cells])).toEqual({ status: 0, out: "", err: "" });
    const first = readFileSync(file, "utf8");
    expect(node(logScript, [file, ...cells])).toEqual({ status: 0, out: "", err: "" });
    const text = readFileSync(file, "utf8");
    expect(text.startsWith(first)).toBe(true);
    expect(text.startsWith("ts\tphase\tdecision\twhy\tevidence\tresult\n")).toBe(true);
    expect(text).not.toContain("\r");
    const lines = text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
    for (const line of lines.slice(1, 3)) {
      const [timestamp, ...actual] = line.split("\t");
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Date.parse(timestamp)).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
      expect(Date.parse(timestamp)).toBeLessThanOrEqual(Date.now());
      expect(actual).toEqual(cells);
    }
  });

  test("initializes an existing empty file", () => {
    const file = join(tempDir(), "log.tsv");
    writeFileSync(file, "");
    expect(node(logScript, [file, "", "", "", "", ""]).status).toBe(0);
    expect(readFileSync(file, "utf8").split("\n")).toHaveLength(3);
  });

  test("sanitizes every cell and neutralizes formula and quote prefixes", () => {
    const file = join(tempDir(), "log.tsv");
    const values = ['"=HYPERLINK(""http://x"")"', '"unterminated', "=1+1", "+1", "-1", "@SUM(A1)", "plain"];
    for (const value of values) {
      expect(node(logScript, [file, ...Array(5).fill(value + "\tline\nnext\rend")]).status).toBe(0);
    }
    const rows = readFileSync(file, "utf8").trimEnd().split("\n").slice(1);
    expect(rows).toHaveLength(values.length);
    rows.forEach((row, i) => {
      const expected = (i < values.length - 1 ? "'" : "") + values[i] + " line next end";
      expect(row.split("\t").slice(1)).toEqual(Array(5).fill(expected));
    });
  });

  test("rejects wrong argument counts without creating a log", () => {
    const file = join(tempDir(), "log.tsv");
    for (const args of [[], [file, "phase"], [file, "p", "d", "w", "e", "r", "extra"]]) {
      const result = node(logScript, args);
      expect(result.status).toBe(1);
      expect(result.out).toBe("");
      expect(result.err).toStartWith("usage: node log.mjs ");
      expect(existsSync(file)).toBe(false);
    }
  });

  test("reports a filesystem failure", () => {
    const dir = tempDir();
    const result = node(logScript, [dir, "p", "d", "w", "e", "r"]);
    expect(result.status).toBe(1);
    expect(result.err).toStartWith("log.mjs: ");
    expect(existsSync(dir)).toBe(true);
  });
});

describe("Node session hook", () => {
  for (const runtime of ["claude", "codex"]) {
    for (const relocated of [false, true]) {
      test(`${runtime}, relocated=${relocated}: reads only its own sheet and supports Windows line endings`, () => {
        const home = tempDir();
        const sheetRoot = join(home, relocated ? "custom config" : `.${runtime}`);
        mkdirSync(sheetRoot);
        const key = runtime === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
        const env = {
          HOME: home, USERPROFILE: home, CODEX_HOME: "", CLAUDE_CONFIG_DIR: "",
          CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_ROOT: "unrelated",
          ...(relocated ? { [key]: sheetRoot } : {}),
        };
        const other = join(home, runtime === "claude" ? ".codex" : ".claude");
        mkdirSync(other);
        writeFileSync(join(other, "pstack-models.md"), "session hook: off\n");
        expect(node(hookScript, [runtime], env)).toEqual({ status: 0, out: context, err: "" });
        for (const sheet of ["", "session hook: on\n", " session hook: off\n", "session hook: off \n"]) {
          writeFileSync(join(sheetRoot, "pstack-models.md"), sheet);
          expect(node(hookScript, [runtime], env)).toEqual({ status: 0, out: context, err: "" });
        }
        for (const sheet of ["session hook: off", "setting: value\nsession hook: off\n", "setting: value\r\nsession hook: off\r\n"]) {
          writeFileSync(join(sheetRoot, "pstack-models.md"), sheet);
          expect(node(hookScript, [runtime], env)).toEqual({ status: 0, out: "", err: "" });
        }
      });
    }
  }

  test("uses the Windows user profile when HOME is absent", () => {
    if (process.platform !== "win32") return;
    const home = tempDir();
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex/pstack-models.md"), "session hook: off\r\n");
    expect(node(hookScript, ["codex"], {
      HOME: "", USERPROFILE: home, CODEX_HOME: "", CLAUDE_PLUGIN_ROOT: pluginRoot,
    })).toEqual({ status: 0, out: "", err: "" });
  });

  test("rejects missing and invalid runtime arguments", () => {
    for (const args of [[], ["cursor"], ["CODEX"]]) {
      expect(node(hookScript, args)).toEqual({
        status: 2, out: "",
        err: `session-start.mjs: unknown runtime '${args[0] ?? ""}' (expected claude or codex)\n`,
      });
    }
  });

  test("reports a missing context file or plugin root", () => {
    for (const root of ["", tempDir()]) {
      const result = node(hookScript, ["codex"], { CODEX_HOME: tempDir(), CLAUDE_PLUGIN_ROOT: root });
      expect(result.status).toBe(1);
      expect(result.out).toBe("");
      expect(result.err).toStartWith("session-start.mjs: ");
    }
  });
});

describe("Node skill collision repro", () => {
  test("the CLI reports a missing Claude executable without making an API call", () => {
    const script = fileURLToPath(new URL("./skill-collision-repro.mjs", import.meta.url));
    const result = spawnSync("node", ["-e", `
      process.env.PATH = "";
      process.argv[1] = ${JSON.stringify(script)};
      import(${JSON.stringify(new URL("./skill-collision-repro.mjs", import.meta.url).href)});
    `], { encoding: "utf8", windowsHide: true });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("skill-collision-repro.mjs: spawnSync claude ENOENT");
  });

  for (const [status, stdout, stderr, expected] of [
    [0, "SKILL-RAN", "", 0], [0, "", "SKILL-RAN", 0],
    [0, "no skill", "", 1], [1, "SKILL-RAN", "error", 1], [null, "", "", 1],
  ]) {
    test(`checks status=${status}, stdout=${stdout}, stderr=${stderr}, then removes its fixture`, () => {
      let scratch;
      const result = runRepro((command, args, options) => {
        scratch = args[2];
        expect(command).toBe("claude");
        expect(args).toEqual(["-p", "--plugin-dir", scratch, "--model", "haiku", "--max-turns", "3", "/testplug:foo"]);
        expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
        expect(options.shell).toBeUndefined();
        expect(JSON.parse(readFileSync(join(scratch, ".claude-plugin/plugin.json"), "utf8")).name).toBe("testplug");
        expect(readFileSync(join(scratch, "skills/foo/SKILL.md"), "utf8")).toContain("Say exactly: SKILL-RAN");
        expect(existsSync(join(scratch, "commands"))).toBe(false);
        return { status, stdout, stderr };
      });
      expect(result.status).toBe(expected);
      expect(result.message).toStartWith(expected === 0 ? "ok:" : "FAIL");
      expect(existsSync(scratch)).toBe(false);
    });
  }

  for (const throws of [false, true]) {
    test(`cleans up after a launch failure, throws=${throws}`, () => {
      let scratch;
      const error = new Error("spawn claude ENOENT");
      expect(() => runRepro((_command, args) => {
        scratch = args[2];
        if (throws) throw error;
        return { error, status: null };
      })).toThrow("spawn claude ENOENT");
      expect(existsSync(scratch)).toBe(false);
    });
  }
});
