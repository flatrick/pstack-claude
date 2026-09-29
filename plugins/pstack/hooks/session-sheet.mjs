import { readFileSync } from "node:fs";

// PowerShell 5.1 writes UTF-16LE with a BOM; the other runtimes use UTF-8.
export function readSheet(path) {
  try {
    const bytes = readFileSync(path);
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8";
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    return text.split("\n").map((line) => line.replace(/\r$/, ""));
  } catch {
    return null;
  }
}

export function checkCopilotSheet(lines, models) {
  const roles = models.roles;
  const values = new Map();
  const efforts = new Set(models.efforts);
  let anyVendor = false;
  for (const line of lines) {
    if (/^[ \t]/.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (roles.some(({ role }) => role === key) || key === "default effort") values.set(key, value);
    else if (key === "panel vendors" && value === "any") anyVendor = true;
  }

  const problems = [];
  for (const { role } of roles) if (!values.has(role)) problems.push(`missing role \`${role}\``);
  if (values.has("default effort") && values.get("default effort") !== "session" && !efforts.has(values.get("default effort"))) {
    problems.push("default effort is not session or a level");
  }
  for (const { role, models: tier } of roles) {
    if (!values.has(role)) continue;
    const vendors = new Set();
    let realModel = false;
    for (const entry of values.get(role).split(",")) {
      let model = entry.trim();
      const suffix = model.match(/[ \t]+@([a-z]+)$/);
      if (suffix && efforts.has(suffix[1])) model = model.slice(0, suffix.index);
      if (!model) problems.push(`an empty entry in \`${role}\``);
      else if (model !== "inherit-parent" && model !== "auto") {
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(model)) problems.push(`\`${role}\` has an entry that is not a model ID`);
        else {
          realModel = true;
          vendors.add(model.split("-")[0]);
        }
      }
    }
    if (tier === "panel" && realModel && vendors.size < 2 && !anyVendor) {
      problems.push(`\`${role}\` has models from one vendor (${[...vendors].join(", ")})`);
    }
  }
  return { problems, values };
}
