const fs = require("fs");
const vm = require("vm");
const DIR = "/root/Desktop/Aaryan Sem V/gate-cbt";
const ctx = {};
vm.createContext(ctx);
ctx.window = ctx;
const files = fs.readdirSync(DIR).filter(f => /^bank-.*\.js$/.test(f));
for (const f of files) vm.runInContext(fs.readFileSync(DIR + "/" + f, "utf8"), ctx, { filename: f });
const EX = vm.runInContext(fs.readFileSync(DIR + "/exams.js", "utf8") + "\nGATE_EXAMS;", ctx, { filename: "exams.js" });
const BANK = ctx.GATE_BANK || {};

let totalQ = 0, totalMarks = 0;
const perExam = {}, errors = [];
for (const code in BANK) {
  perExam[code] = BANK[code].length;
  BANK[code].forEach(q => { totalQ++; totalMarks += q.marks || 0; });
  BANK[code].forEach((q, i) => {
    if (!q.section || !q.type || !q.q) errors.push(`${code}[${i}] missing section/type/q`);
    if (q.type !== "nat") {
      const nOpts = q.options ? Object.keys(q.options).length : 0;
      if (nOpts < 2 || !q.correct || !q.correct.length) errors.push(`${code}[${i}] bad options/correct`);
      else if (!q.correct.every(k => q.options[k] !== undefined)) errors.push(`${code}[${i}] correct key not in options`);
    } else if (typeof q.ans !== "number" || typeof q.tol !== "number") errors.push(`${code}[${i}] bad nat ans/tol`);
    if (q.src) {
      const sib = BANK[code].find((o, j) => j !== i && o.src === q.src && o.q === q.q);
      if (sib) errors.push(`${code}[${i}] DUP within ${q.src}`);
    }
  });
}
const bucketReport = [];
for (const code in EX) {
  const ex = EX[code];
  for (const sec of ex.sections) {
    for (const b of (sec.compose || [])) {
      const avail = (BANK[code] || []).filter(q => q.section === sec.id && q.marks === b.m && b.t.includes(q.type)).length;
      bucketReport.push(`${avail >= b.n ? "OK " : "LOW"} ${code}/${sec.id} m=${b.m} need${b.n} have${avail}`);
    }
  }
  if (ex.optionalCompose) for (const b of ex.optionalCompose) {
    const avail = (BANK[code] || []).filter(q => q.marks === b.m && b.t.includes(q.type)).length;
    bucketReport.push(`${avail >= b.n ? "OK " : "LOW"} ${code}/optional m=${b.m} need${b.n} have${avail}`);
  }
}
console.log("per-exam pools:", JSON.stringify(perExam));
console.log("total:", totalQ, "questions /", totalMarks, "marks");
console.log("--- compose buckets ---");
console.log(bucketReport.join("\n") || "(none)");
console.log(errors.length ? "ERRORS: " + errors.slice(0, 15).join(" | ") : "SCHEMA CLEAN · no same-source duplicates");
