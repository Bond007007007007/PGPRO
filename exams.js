/* ============================================================
   GATE-CBT · Exam pattern configs (official formats)
   Edge config drives the engine: sections, marks, timing, marking.
   Question banks live in bank-*.js and register into window.GATE_BANK.
   ============================================================ */
const GATE_EXAMS = {
  xl: {
    code: "xl",
    name: "GATE XL · Life Sciences",
    org: "Conducted by IITs / IISc",
    durationMin: 180,
    totalQ: 65,
    totalMarks: 100,
    negType: "third",          // MCQ negative = marks/3  (1m: -1/3, 2m: -2/3)
    msqPartial: false,         // MSQ: full credit only when option set matches exactly
    natTol: 0.01,
    // composed: n = how many sampled per run, m = marks bucket, t = allowed types
    sections: [
      { id: "GA", name: "General Aptitude", q: 10, marks: 15, compose: [{ m: 1, n: 5, t: ["mcq"] }, { m: 2, n: 5, t: ["mcq"] }] },
      { id: "CHEM", name: "XL-P Chemistry (Compulsory)", q: 17, marks: 25, compose: [{ m: 1, n: 9, t: ["mcq", "msq", "nat"] }, { m: 2, n: 8, t: ["mcq", "msq", "nat"] }] }
    ],
    optionals: [
      { id: "BIOCHEM", name: "XL-Q Biochemistry" },
      { id: "BOTANY", name: "XL-R Botany" },
      { id: "MICRO", name: "XL-S Microbiology" },
      { id: "ZOO", name: "XL-T Zoology" },
      { id: "FOOD", name: "XL-U Food Technology" }
    ],
    optionalQ: 19,
    optionalMarks: 30,
    optionalCompose: [{ m: 1, n: 8, t: ["mcq", "msq", "nat"] }, { m: 2, n: 11, t: ["mcq", "msq", "nat"] }],
    optionalPick: 2
  },

  jam: {
    code: "jam",
    name: "IIT JAM · Biotechnology",
    org: "Conducted by IITs",
    durationMin: 180,
    totalQ: 60,
    totalMarks: 100,
    negType: "third",
    msqPartial: false,
    natTol: 0.01,
    // Official JAM BT (2023+): A) MCQ Q1-10 x1, Q11-30 x2 (50m)
    // B) MSQ Q31-40 x2 (20m) · C) NAT Q41-50 x1, Q51-60 x2 (30m)
    // Per-question marks live in the bank; section marks = totals for coverage.
    sections: [
      { id: "A", name: "Part A — MCQs (Q1-30: 10×1 + 20×2)", q: 30, marks: 50, compose: [{ m: 1, n: 10, t: ["mcq"] }, { m: 2, n: 20, t: ["mcq"] }] },
      { id: "B", name: "Part B — MSQs (10 × 2 marks)", q: 10, marks: 20, compose: [{ m: 2, n: 10, t: ["msq"] }] },
      { id: "C", name: "Part C — NATs (Q41-60: 10×1 + 10×2)", q: 20, marks: 30, compose: [{ m: 1, n: 10, t: ["nat"] }, { m: 2, n: 10, t: ["nat"] }] }
    ]
  },

  gatb: {
    code: "gatb",
    name: "GAT-B · DBT BET",
    org: "Conducted by DBT",
    durationMin: 180,
    totalQ: 160,
    totalMarks: 120,
    negType: "fixed",
    negFixed: 0.5,              // current NTA CBT scheme: +1 correct / −0.5 wrong
    msqPartial: false,
    natTol: 0.01,
    bestN: { section: "B", n: 60 },   // Section B: only best 60 of 100 count
    sections: [
      { id: "A", name: "Section A — Compulsory (10+2 Science)", q: 60, marks: 60, compose: [{ m: 1, n: 60, t: ["mcq"] }] },
      { id: "B", name: "Section B — Core Biotech (best 60 of 100)", q: 100, marks: 60, compose: [{ m: 1, n: 100, t: ["mcq"] }] }
    ]
  },

  cuet: {
    code: "cuet",
    name: "CUET PG · SCQP03 / SCQP17",
    org: "Conducted by NTA",
    durationMin: 105,
    totalQ: 75,
    totalMarks: 300,
    negType: "fixed",
    negFixed: 1,                 // +4 correct / -1 wrong
    msqPartial: false,
    natTol: 0.01,
    sections: [
      { id: "D", name: "Domain Questions (75 × 4 marks)", q: 75, marks: 300, compose: [{ m: 4, n: 75, t: ["mcq"] }] }
    ]
  }
};