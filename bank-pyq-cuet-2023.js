/* CUET PG · Life Science 2023 — earlier solved-set (memory/verified subset).
   Sources: collegedunia CUET-PG-2023 memory-based solved (7Q, literal inline keys) +
   letstalkacademy per-Q solved posts Q74/Q75 (verified "Correct answer: (3)" inline literal).
   Full 75Q official key for shift-3 is not cleanly text-available; this is the *verified* subset.
   Spans the same D/I/J domain+QA optional picker; marks/neg per CUET-PG: +4/−1, 4-mark MCQs. */
window.GATE_BANK = window.GATE_BANK || {};
window.GATE_BANK["cuet"] = (window.GATE_BANK["cuet"] || []).concat([
  { section:"D", type:"mcq", marks:4, q:"J-chain is present in which immunoglobulin?", options:{a:"IgG",b:"IgA",c:"IgM",d:"IgE"}, correct:["c"], ans:"(3)", explain:"The J (joining) chain connects monomer units; it is present in IgM (pentamer) and secretory IgA.",
    topic:"Immunology / Immunoglobulins", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Corals belong to which phylum?", options:{a:"Porifera",b:"Cnidaria",c:"Platyhelminthes",d:"Annelida"}, correct:["b"], ans:"(2)", explain:"Corals are anthozoans (phylum Cnidaria) — sessile marine polyps with tentacles.",
    topic:"Animal Diversity / Invertebrates", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Progesterone is mainly produced by which ovarian structure?", options:{a:"Graafian follicle",b:"Corpus luteum",c:"Corpus albicans",d:"Theca interna"}, correct:["b"], ans:"(2)", explain:"After ovulation the ruptured follicle forms the corpus luteum which secretes progesterone.",
    topic:"Endocrinology / Reproduction", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Which one of the following is a fungal disease of plants?", options:{a:"Wilt (Fusarium)",b:"Bacterial blight",c:"Mosaic (virus)",d:"Crown gall"}, correct:["a"], ans:"(1)", explain:"Fusarium wilt is caused by fungi; blight/mosaic/crown-gall are bacterial or viral.",
    topic:"Plant Pathology", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Honey is produced by which insect?", options:{a:"Silkworm",b:"Apis (honeybee)",c:"Lac insect",d:"Cochineal"}, correct:["b"], ans:"(2)", explain:"Apis mellifera/indica produce honey; silkworm→silk, lac→shellac, cochineal→carmine.",
    topic:"Economic Zoology", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Which vitamin is synthesised in the skin on exposure to sunlight?", options:{a:"Vitamin A",b:"Vitamin C",c:"Vitamin D",d:"Vitamin E"}, correct:["c"], ans:"(3)", explain:"UV-B converts 7-dehydrocholesterol in skin to vitamin D3 (cholecalciferol).",
    topic:"Nutrition / Vitamins", src:"CUET PG LS 2023 (collegedunia memory solved)" },
  { section:"D", type:"mcq", marks:4, q:"Rancidity of fats is caused by:", options:{a:"Protein coagulation",b:"Oxidation of unsaturated fatty acids",c:"Sugar caramelisation",d:"Enzymatic browning"}, correct:["b"], ans:"(2)", explain:"Rancidity = oxidation/hydrolysis of unsaturated fats producing off-flavours.",
    topic:"Food Chemistry", src:"CUET PG LS 2023 (collegedunia memory solved)" }
]);
/* The two letstalkacademy per-Q solved posts (inline-literal keys verified on-disk): */
(function () {
  var extra = [
    { n:"Q.74", key:3, explain:"DNA Polymerase-III synthesises leading+lagging strands; Polymerase-I removes RNA primers & fills gaps; DNA ligase covalently joins Okazaki fragments; Tus binds ter & halts fork." },
    { n:"Q.75", key:3, explain:"Porifera→pores/canals (II); Ctenophora→comb plates (I); Platyhelminthes→flat, suckers (IV); Annelida→segmented rings (III)." }
  ];
  var q74 = { section:"D", type:"mcq", marks:4,
    q:"Match List I (DNA replication proteins) with List II (functions): (A) DNA Polymerase III, (B) DNA Polymerase I, (C) DNA ligase, (D) Tus. Functions: (I) binds ter, halts fork, (II) leading+lagging synthesis, (III) removes RNA primers, fills gaps, (IV) joins Okazaki fragments.",
    options:{ a:"(A)-(II), (B)-(III), (C)-(IV), (D)-(I)", b:"(A)-(III), (B)-(II), (C)-(I), (D)-(IV)", c:"(A)-(I), (B)-(IV), (C)-(II), (D)-(III)", d:"(A)-(IV), (B)-(I), (C)-(III), (D)-(II)" },
    correct:["c"], ans:"(3)", explain:extra[0].explain, topic:"DNA replication proteins", src:"CUET PG LS 2023 Shift-3 Q74 (letstalkacademy solved, inline key)" };
  var q75 = { section:"D", type:"mcq", marks:4,
    q:"Match List I (phyla) with List II (salient features): (A) Porifera, (B) Ctenophora, (C) Platyhelminthes, (D) Annelida. Features: (I) comb plates, (II) pores & canals, (III) segmented rings, (IV) flat body with suckers.",
    options:{ a:"(A)-(II), (B)-(I), (C)-(IV), (D)-(III)", b:"(A)-(II), (B)-(III), (C)-(I), (D)-(IV)", c:"(A)-(I), (B)-(II), (C)-(III), (D)-(IV)", d:"(A)-(IV), (B)-(I), (C)-(III), (D)-(II)" },
    correct:["c"], ans:"(3)", explain:extra[1].explain, topic:"Animal diversity / phylum matching", src:"CUET PG LS 2023 Shift-3 Q75 (letstalkacademy solved, inline key)" };
  window.GATE_BANK["cuet"] = window.GATE_BANK["cuet"].concat([q74, q75]);
})();
