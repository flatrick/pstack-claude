#!/usr/bin/env node
// Usage: node log.mjs <logfile> <phase> <decision> <why> <evidence> <result>
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 6) {
  console.error("usage: node log.mjs <logfile> <phase> <decision> <why> <evidence> <result>");
  process.exitCode = 1;
} else {
  try {
    const [logfile, ...cells] = args;
    mkdirSync(dirname(logfile), { recursive: true });
    let size = 0;
    try {
      size = statSync(logfile).size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Append even the header so a failed existence check cannot erase prior rows.
    if (size === 0) appendFileSync(logfile, "ts\tphase\tdecision\twhy\tevidence\tresult\n", "utf8");
    const cleaned = cells.map((cell) => {
      const value = cell.replace(/[\t\n\r]/g, " ");
      return /^[=+\-@"]/.test(value) ? `'${value}` : value;
    });
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    appendFileSync(logfile, [timestamp, ...cleaned].join("\t") + "\n", "utf8");
  } catch (error) {
    console.error(`log.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
