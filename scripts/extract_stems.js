#!/usr/bin/env node
/* Extract per-pool question SIGNATURES from all existing banks (index.html load order).
   signature = { stem, opts (sorted normalized option values), ans (normalized correct value) }
   First bank file (index.html order) wins per signature = "original".
   Output: /tmp/opencode/pool/existing_stems.json  { "pool": [ {stem, opts, ans, file}, ... ] } */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = "/root/Desktop/Aaryan Sem V/gate-cbt";
const idx = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const excludeRe = process.argv.includes("--exclude")
  ? new RegExp(process.argv[process.argv.indexOf("--exclude") + 1])
  : null;
const order = [...idx.matchAll(/src="(bank-[\w.-]+\.js)"/g)]
  .map(m => m[1])
  .filter(f => fs.existsSync(path.join(DIR, f)) && (!excludeRe || !excludeRe.test(f)));

const N = s => String(s || "").replace(/\$[^$]*\$/g, " ").replace(/\\(?:text|mathrm|mathbf|textbf)\s*\{[^}]*\}/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "");
const optSig = q => JSON.stringify(Object.values(q.options || {}).map(N).sort());
const ansVal = q => {
  const key = (q.correct || [])[0];
  return N((q.options || {})[key] !== undefined ? q.options[key] : (q.ans || ""));
};
const sig = q => ({ stem: N(q.q), opts: optSig(q), ans: ansVal(q) });

const seen = new Set(); // pool+"|"+stem+"|"+opts+"|"+ans -> true
const out = {};
const windowStub = { GATE_BANK: {} };
const ctx = vm.createContext({ window: windowStub, console });

for (const f of order) {
  try { vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f }); }
  catch (e) { console.error("VM FAIL", f, e.message); continue; }
  for (const pool of Object.keys(windowStub.GATE_BANK)) {
    for (const q of windowStub.GATE_BANK[pool]) {
      const s = sig(q);
      if (s.stem.length < 12) continue;
      const key = [pool, s.stem, s.opts, s.ans].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      (out[pool] = out[pool] || []).push({ stem: s.stem, opts: JSON.parse(s.opts), ans: s.ans, file: f });
    }
  }
}
fs.writeFileSync("/tmp/opencode/pool/existing_stems.json", JSON.stringify(out));
let total = 0;
for (const p of Object.keys(out)) total += out[p].length;
console.log("done. pools:", Object.keys(out).join(","), "signatures:", total);