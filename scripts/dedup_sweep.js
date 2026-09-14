#!/usr/bin/env node
/* Dedup sweep across ALL bank files (per exam pool).
   Normalized stem -> first occurrence (index.html load order) is the ORIGINAL; later duplicates reported.
   Modes: --check prints report only; --remove rewrites later files dropping duplicates (only safe for
   machine-generated bank-practice-* files; hand-written banks keep formatting via a marker comment).
   Output: /tmp/opencode/pool/dedup_report.json */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = "/root/Desktop/Aaryan Sem V/gate-cbt";
const REMOVE = process.argv.includes("--remove");
const idx = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const order = [...idx.matchAll(/src="(bank-[\w.-]+\.js)"/g)].map(m => m[1]);
const windowStub = { GATE_BANK: {} };
const ctx = vm.createContext({ window: windowStub, console });

function lightNorm(s) {
  return String(s || "").replace(/\$[^$]*\$/g, " ").replace(/\\(?:text|mathrm|mathbf|textbf)\s*\{[^}]*\}/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
}
function norm(q) {
  return lightNorm((q && q.q) || "").replace(/[^a-z0-9]+/g, "");
}
const optSig = q => JSON.stringify(Object.values(q.options || {}).map(o => lightNorm(o)).sort());
const ansVal = q => {
  const key = (q.correct || [])[0];
  return (q.options || {})[key] !== undefined ? lightNorm(q.options[key]) : "";
};

const seen = new Map(); // pool|stem -> {file, qno}
const report = { total: 0, dupes: 0, byPool: {} };

for (const f of order) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
  catch (e) { console.error("VM FAIL", f, e.message); process.exit(1); }
}

for (const pool of Object.keys(windowStub.GATE_BANK)) {
  const qs = windowStub.GATE_BANK[pool];
  const local = new Map();
  const dupes = [];
  qs.forEach((q, i) => {
    const s = norm(q);
    if (!s || s.length < 12) return;
    const k = [pool, s, optSig(q), ansVal(q)].join("|");
    if (seen.has(k)) {
      dupes.push({ i, stem: s, origFile: seen.get(k).file });
    } else {
      seen.set(k, { file: "?", i });
      local.set(k, { file: "?", i });
    }
  });
  report.byPool[pool] = dupes;
  report.dupes += dupes.length;
}
report.total = seen.size;
fs.writeFileSync("/tmp/opencode/pool/dedup_report.json", JSON.stringify(report, null, 1));
console.log("pools:", Object.keys(windowStub.GATE_BANK).join(","), "| unique stems:", report.total, "| dupes:", report.dupes);
for (const pool of Object.keys(report.byPool)) {
  if (report.byPool[pool].length) console.log("  dups in", pool, ":", report.byPool[pool].length);
}