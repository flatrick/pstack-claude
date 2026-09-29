#!/usr/bin/env node
// Usage: node log.mjs <logfile> <phase> <decision> <why> <evidence> <result>
import { closeSync, mkdirSync, openSync, statSync, writeSync } from "node:fs";
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
    function append(row) {
      const bytes = Buffer.from(row, "utf8");
      const fd = openSync(logfile, "a");
      try {
        const written = writeSync(fd, bytes, 0, bytes.length);
        if (written !== bytes.length) throw new Error(`short write, appended ${written} of ${bytes.length} bytes of the row`);
      } finally {
        closeSync(fd);
      }
    }
    if (size === 0) append("ts\tphase\tdecision\twhy\tevidence\tresult\n");
    const cleaned = cells.map((cell) => {
      const value = cell.replace(/[\t\n\r]/g, " ");
      return /^[=+\-@"]/.test(value) ? `'${value}` : value;
    });
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    append([timestamp, ...cleaned].join("\t") + "\n");
  } catch (error) {
    console.error(`log.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
