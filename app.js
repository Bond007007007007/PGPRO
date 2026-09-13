/* ============================================================
   GATE-CBT · Engine (state, timer, palette, scoring, results)
   Three modes: Fixed Mock, Random Full Exam, Unlimited Drill.
   Four exam patterns driven by exams.js configs; banks in bank-*.js.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var BANK = window.GATE_BANK || {};
  var FIXED_STORE = {};          // "xl:3:BIOCHEM-BOTANY" -> built paper (deterministic replay)
  var MODE_INFO = {
    fixed:     { title: "Fixed Mock Test",  desc: "Same paper every time — Mock Test 1, 2, 3... Track your score growth." },
    random:    { title: "Random Full Exam",  desc: "Official paper pattern, fresh questions every run." },
    unlimited: { title: "Unlimited Drill",   desc: "Endless random practice with instant feedback. No timer." }
  };
var S = {
    exam: null, sections: [], paper: [], ans: [],
    idx: 0, endAt: 0, timerId: null, practice: false,
    submitted: false, results: null, paletteFilter: "all", reviewFilter: "all", selOptions: [], modalOpen: false,
    warned5: false, switches: 0, bannerTimer: null
  };
  var calc = null;
  var qStartAt = 0;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && el) { try { MathJax.typesetPromise([el]); } catch (e) { } } }
  function show(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
  }
  function hasAns(a) {
    if (!a || a.sel === null || a.sel === undefined) return false;
    if (Array.isArray(a.sel)) return a.sel.length > 0;
    return String(a.sel).trim() !== "";
  }
  function fmtClock(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function typeLabel(t) { return t === "mcq" ? "MCQ" : t === "msq" ? "MSQ" : "NAT"; }

  /* ---------- per-question elapsed time ---------- */
  function settleQTime() {
    if (!qStartAt || !S.paper.length || !S.ans[S.idx]) return;
    S.ans[S.idx].timeSpent = (S.ans[S.idx].timeSpent || 0) + (Date.now() - qStartAt);
    qStartAt = Date.now();
  }
  function fmtDur(ms) {
    var s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60), r = s % 60;
    return m + "m " + (r < 10 ? "0" : "") + r + "s";
  }

  /* ---------- scratchpad (persisted per exam) ---------- */
  function scratchLoad() {
    try { return localStorage.getItem("gct.scratch." + S.exam.code) || ""; } catch (e) { return ""; }
  }
  function scratchSave(v) {
    try { localStorage.setItem("gct.scratch." + S.exam.code, v); } catch (e) { }
  }

  /* ---------- SOUND (Web Audio API, offline — no assets) ---------- */
  var AC = null;
  function ensureAudio() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC && AC.state === "suspended") AC.resume();
    } catch (e) { }
  }
  function tone(freq, start, dur, vol, type) {
    if (!AC) return;
    try {
      var t0 = AC.currentTime + start;
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { }
  }
  function sndStart() { ensureAudio(); tone(523.25, 0, .12, .16); tone(659.25, .14, .12, .16); tone(783.99, .28, .24, .18); }
  function sndWarn()  { ensureAudio(); tone(783.99, 0, .1, .15, "square"); tone(783.99, .16, .1, .15, "square"); tone(783.99, .32, .18, .17, "square"); }
  function sndAlarm() { ensureAudio(); tone(880, 0, .14, .2, "square"); tone(587.33, .18, .14, .2, "square"); tone(880, .36, .14, .2, "square"); tone(587.33, .54, .32, .2, "square"); }

  /* ---------- PROCTOR BANNER ---------- */
  function showBanner(msg, kind) {
    var b = $("warn-banner");
    if (!b) return;
    b.textContent = msg;
    b.className = "warn-banner" + (kind ? " " + kind : "");
    clearTimeout(S.bannerTimer);
    S.bannerTimer = setTimeout(function () { b.classList.add("hidden"); }, 4200);
  }

  /* ---------- seeded PRNG (mulberry32) + helpers ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function shuffleKeys(rng) {
    var keys = ["a", "b", "c", "d"];
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    return keys;
  }

  /* ---------- HOME ---------- */
  function renderHome() {
    var cards = $("exam-cards"); cards.innerHTML = "";
    Object.keys(GATE_EXAMS).forEach(function (code) {
      var ex = GATE_EXAMS[code];
      var d = document.createElement("div"); d.className = "exam-card";
      d.innerHTML = "<h3>" + esc(ex.name) + "</h3><div class='org'>" + esc(ex.org) + "</div>" +
        "<div class='facts'><span>" + ex.totalQ + " questions/paper</span><span>" + ex.totalMarks + " marks</span><span>" + ex.durationMin + " min</span><span>mocks: " + (ex.mocks || 1) + "</span><span>pool: " + (BANK[code] || []).length + "</span></div>" +
        "<span class='tag'>→ Configure & start</span>";
      d.onclick = function () { openConfig(code); };
      cards.appendChild(d);
    });
    renderHistory();
  }

  /* ---------- CONFIG ---------- */
  function targetOf(secId) {
    var ex = S.exam;
    if (ex.optionals) {
      var o = ex.optionals.filter(function (x) { return x.id === secId; })[0];
      if (o) return { id: o.id, name: o.name, q: ex.optionalQ, marks: ex.optionalMarks };
    }
    var f = ex.sections.filter(function (s) { return s.id === secId; })[0];
    return f;
  }
  function coverage(secId) {
    var t = targetOf(secId), qs = (BANK[S.exam.code] || []).filter(function (q) { return q.section === secId; });
    var sum = qs.reduce(function (a, q) { return a + (q.marks || 1); }, 0);
    return { target: t, count: qs.length, marks: sum, ok: qs.length >= t.q, text: qs.length + "/" + t.q + " · " + sum + "/" + t.marks + " marks" };
  }
  function patternText() {
    var ex = S.exam, lines = [];
    lines.push(ex.totalQ + " questions · " + ex.totalMarks + " marks · " + ex.durationMin + " minutes · CBT");
    ex.sections.forEach(function (s) { lines.push("▸ " + s.name + " — " + s.q + " Q / " + s.marks + " marks"); });
    if (ex.optionals) lines.push("▸ Pick " + ex.optionalPick + " of " + ex.optionals.length + " optional sections (each " + ex.optionalQ + " Q / " + ex.optionalMarks + " marks)");
    var neg = ex.negType === "fixed" ? "MCQ: +4 / −" + ex.negFixed : "MCQ: negative = ⅓ of marks; MSQ & NAT: no negative";
    if (ex.bestN) neg += " · Section B: best " + ex.bestN.n + " of 100 answered questions count";
    lines.push("▸ Marking — " + neg);
    return lines.join("\n");
  }
  function openConfig(code) {
    S.exam = GATE_EXAMS[code];
    S.mode = "random"; S.fixedSet = 1; S.drill = null;
    if (S.exam.optionals) S.selOptions = S.exam.optionals.slice(0, 2).map(function (o) { return o.id; });
    $("config-title").textContent = S.exam.name;
    var html = '<div class="config-card"><h4>Exam pattern</h4><div class="pat">' + esc(patternText()) + "</div></div>";
    /* --- Mode selector --- */
    html += '<div class="config-card" id="cfg-modes"><h4>Mode</h4><div class="mode-grid">';
    ["fixed", "random", "unlimited"].forEach(function (m) {
      var info = MODE_INFO[m];
      html += '<label class="mode-card' + (m === "random" ? " sel" : "") + '" data-mode="' + m + '">' +
        '<input type="radio" name="cfg-mode" value="' + m + '"' + (m === "random" ? " checked" : "") + ">" +
        "<b>" + info.title + "</b><span>" + info.desc + "</span></label>";
    });
    html += '</div><div class="mode-extra hidden" id="mock-set-row"><label for="cfg-mockset" style="margin-right:8px;color:var(--muted)">Mock test</label>' +
      '<select id="cfg-mockset" style="background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:6px 10px;font-size:var(--fs-sm)">';
    for (var i = 1; i <= (S.exam.mocks || 1); i++) html += '<option value="' + i + '">Mock Test ' + i + "</option>";
    html += "</select></div></div>";
    /* --- Optional sections (XL etc.) --- */
    if (S.exam.optionals) {
      html += '<div class="config-card" id="cfg-optionals"><h4>Choose your ' + S.exam.optionalPick + ' optional sections</h4><div class="opt-group">';
      S.exam.optionals.forEach(function (o, i) {
        var cov = coverage(o.id);
        var on = cov.ok && cov.count > 0;                 // only content-backed units are pickable
        var disabled = on ? "" : "disabled";
        var checked = (on && i < 2) ? "checked" : "";
        html += '<label class="' + (on ? "" : "disabled") + '" title="' + (on ? "Bank has content" : "No questions in pool yet — not selectable") + '">' +
          '<input type="checkbox" value="' + o.id + '" ' + checked + " " + disabled + "> " +
          esc(o.name) + ' <span class="' + (cov.ok ? "ok" : "bad") + '">(' + cov.text + ")</span></label>";
      });
      html += '</div><p class="coverage">' + esc(S.exam.optionals[0].name) + ' &amp; ' + esc(S.exam.optionals[1].name) + " pre-selected (matches your syllabus pairing — XL-S + XL-Q). Others light up once their bank content exists.</p></div>";
    }
    /* --- Options --- */
    html += '<div class="config-card" id="cfg-options"><h4>Options</h4><label class="checkbox-row"><input type="checkbox" id="cfg-practice"> Untimed practice mode — instant feedback, no timer, no negative-marking pressure</label></div>';
    html += '<div id="cfg-coverage"></div>';
    html += '<div class="start-row"><button class="btn" id="btn-start"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 5.5v13l11-6.5-11-6.5z"/></svg> Start Exam</button><span id="cfg-status"></span></div>';
    $("config-body").innerHTML = html;
    /* --- Wire mode radios --- */
    document.querySelectorAll("input[name='cfg-mode']").forEach(function (r) {
      r.addEventListener("change", function () { applyMode(this.value); });
    });
    $("cfg-mockset").addEventListener("change", function () { S.fixedSet = parseInt(this.value) || 1; });
    $("btn-start").onclick = startExam;
    refreshCoverage();
    show("screen-config");
  }
  function applyMode(m) {
    S.mode = m;
    document.querySelectorAll(".mode-card").forEach(function (c) {
      c.classList.toggle("sel", c.dataset.mode === m);
    });
    var mrow = $("mock-set-row"), opts = $("cfg-optionals"), optsCard = $("cfg-options");
    if (mrow) mrow.classList.toggle("hidden", m !== "fixed");
    if (opts) opts.classList.toggle("hidden", m === "unlimited");
    if (optsCard) optsCard.classList.toggle("hidden", m === "unlimited");
    refreshCoverage();
  }
  function refreshCoverage() {
    if (S.mode === "unlimited") {
      var n = (BANK[S.exam.code] || []).length;
      $("cfg-coverage").innerHTML = '<div class="coverage"><span class="' + (n ? "ok" : "bad") + '">' + (n ? "✓" : "✗") + "</span> Practice pool — " + n + " questions across all sections.</div>";
      $("btn-start").disabled = !n;
      $("cfg-status").innerHTML = n ? '<span class="ok">✓ Drill pool ready — ' + n + " questions.</span>" : '<span class="bad">⚠ Question pool is empty.</span>';
      return;
    }
    var ids = [];
    S.exam.sections.forEach(function (s) { ids.push(s.id); });
    if (S.exam.optionals) S.selOptions.forEach(function (id) { ids.push(id); });
    var rows = ids.map(function (id) {
      var c = coverage(id);
      return '<div class="coverage"><span class="' + (c.ok ? "ok" : "bad") + '">' + (c.ok ? "✓" : "✗") + "</span> " + esc(c.target.name) + " — " + c.text + "</div>";
    });
    $("cfg-coverage").innerHTML = rows.join("");
    var bad = ids.filter(function (id) { return !coverage(id).ok; });
    if (bad.length) {
      $("btn-start").disabled = true;
      $("cfg-status").innerHTML = '<span class="bad">⚠ Question bank incomplete — add missing questions to bank files (' + bad.join(", ") + ") then reload.</span>";
    } else {
      $("btn-start").disabled = false;
      $("cfg-status").innerHTML = '<span class="ok">✓ Full paper ready — ' + ids.length + " sections.</span>";
    }
  }

  /* ---------- PAPER ---------- */
  function resolveSections() {
    var ex = S.exam, secs = ex.sections.map(function (s) { return { id: s.id, name: s.name, q: s.q, marks: s.marks, compose: s.compose }; });
    if (ex.optionals) S.selOptions.forEach(function (id) {
      var o = ex.optionals.filter(function (x) { return x.id === id; })[0];
      secs.push({ id: o.id, name: o.name, q: ex.optionalQ, marks: ex.optionalMarks, compose: ex.optionalCompose });
    });
    return secs;
  }
  /* sample without replacement; deterministic when rng is seeded */
  function sampleFrom(list, n, rng) {
    rng = rng || Math.random;
    var p = list.slice(), out = [];
    while (out.length < n && p.length) {
      var k = Math.floor(rng() * p.length);
      out.push(p.splice(k, 1)[0]);
    }
    return out;
  }
  function normalizeQ(q, sec) {
    return {
      section: sec.id, sectionName: sec.name, type: q.type, marks: q.marks || 1,
      q: q.q, options: q.options || null, correct: (q.correct || []).slice(),
      ans: q.ans, tol: q.tol != null ? q.tol : S.exam.natTol, unit: q.unit || "",
      explain: q.explain || "", topic: q.topic || "", src: q.src || "",
      optOrder: null
    };
  }
  /* build a FRESH paper per (mode, seed) — exact official pattern via compose buckets */
  function buildPaper(rng) {
    rng = rng || Math.random;
    var paper = [], short = [];
    S.sections.forEach(function (sec) {
      var comp = sec.compose || [{ m: sec.marks || 1, n: sec.q, t: null }];
      comp.forEach(function (b) {
        var cands = (BANK[S.exam.code] || []).filter(function (q) {
          return q.section === sec.id && (q.marks || 1) === b.m && (!b.t || b.t.indexOf(q.type) >= 0);
        });
        var pick = sampleFrom(cands, b.n, rng);
        if (pick.length < b.n) short.push(sec.id + ": " + b.m + "m ×" + b.n + " (only " + pick.length + " in pool)");
        pick.forEach(function (q) { paper.push(normalizeQ(q, sec)); });
      });
    });
    /* option display order: fixed mode deterministic from seed; random per-run */
    paper.forEach(function (q, i) {
      if (!q.options) return;
      var qr;
      if (S.mode === "fixed") {
        var qSeed = (S.fixedSeed ^ Math.imul((i + 1) * 2654435761, 1)) >>> 0;
        qr = mulberry32(qSeed);
      } else { qr = rng; }
      q.optOrder = shuffleKeys(qr);
    });
    return { paper: paper, short: short };
  }

  /* ---------- START EXAM ---------- */
  function startExam() {
    S.sections = resolveSections();
    /* Unlimited drill — separate flow */
    if (S.mode === "unlimited") { startDrill(); return; }
    /* Fixed mock (seeded, cached, always identical) or random */
    var built;
    if (S.mode === "fixed") {
      var key = S.exam.code + ":" + S.fixedSet + ":" + S.selOptions.join("-");
      if (!FIXED_STORE[key]) {
        S.fixedSeed = hashSeed("mock-" + S.exam.code + "-" + S.fixedSet);
        built = buildPaper(mulberry32(S.fixedSeed));
        FIXED_STORE[key] = built;
      }
      built = FIXED_STORE[key];
      S.paper = built.paper.slice();
    } else {
      built = buildPaper();
      S.paper = built.paper;
    }
    if (!S.paper.length) { alert("Question pool is empty. Add questions into the pool files (bank-*.js) first."); return; }
    if (built.short.length) {
      alert("⚠ Question pool is low in some slots:\n" + built.short.join("\n") +
        "\n\nStarting with what's available. Add more questions to the pool (scrape more PYQs) to get a full-length paper every time.");
    }
    showInstructions();
  }

  /* ---------- INSTRUCTIONS GATE (pre-exam, real-CBT style) ---------- */
  function showInstructions() {
    var ex = S.exam;
    $("instruct-exam").textContent = ex.name + " · " + ex.totalQ + " Q · " + ex.totalMarks + " marks · " + ex.durationMin + " min";
    $("instruct-ack").checked = false;
    $("btn-begin").disabled = true;
    $("instruct-hint").textContent = "Tick the confirmation box to enable Begin Exam.";
    var practice = S.mode !== "fixed" && $("cfg-practice") && $("cfg-practice").checked;
    var rules = [
      "The paper auto-submits when the timer reaches 00:00:00 — answers are saved automatically.",
      "Use the Question Palette to jump between questions. Mark for Review flags a question so you can return to it before submitting.",
      "The virtual calculator is available during the exam (external calculators are not permitted in the real CBT).",
      practice ? "Practice mode is ON: untimed, instant feedback on every answer, no negative marking."
        : "Negative marking applies to incorrect MCQ answers per the official scheme shown in the pattern above.",
      "Switching away from the app mid-exam is recorded and shown on your result summary — as in a real proctored session.",
      "All answers are stored locally on this device. Nothing is uploaded."
    ];
    $("instruct-list").innerHTML = rules.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("");
    show("screen-instructions");
  }

  function beginExam() {
    var ex = S.exam;
    S.practice = S.mode !== "fixed" && $("cfg-practice") && $("cfg-practice").checked;
    S.ans = S.paper.map(function () { return { sel: null, visited: false, marked: false, timeSpent: 0 }; });
    S.idx = 0; S.submitted = false; S.results = null; S.paletteFilter = "all";
    S.warned5 = false; S.switches = 0;
    qStartAt = Date.now();
    clearInterval(S.timerId);
    if (!S.practice) { S.endAt = Date.now() + ex.durationMin * 60000; $("timer").textContent = fmtClock(ex.durationMin * 60000); startTimer(); }
    else { S.endAt = 0; $("timer").textContent = "--:--:--"; }
    $("timer").classList.remove("warn");
    var label = ex.name;
    if (S.mode === "fixed") label += " · Mock Test " + S.fixedSet;
    else if (ex.code === "xl") label += " · " + S.sections.slice(2).map(function (s) { return s.name.split(" ")[1] || s.name; }).join(" + ");
    $("exam-name").textContent = label;
    $("practice-badge").classList.toggle("hidden", !S.practice);
    $("scratch-pad").value = scratchLoad();
    renderExam();
    show("screen-exam");
    sndStart();
  }

  /* ---------- TIMER ---------- */
  function startTimer() {
    clearInterval(S.timerId);
    S.timerId = setInterval(tick, 500);
  }
  function tick() {
    if (S.submitted || S.practice) return;
    var rem = S.endAt - Date.now();
    $("timer").textContent = fmtClock(rem);
    var warn = rem <= 300000 && rem > 0;
    $("timer").classList.toggle("warn", warn);
    if (warn && !S.warned5) { S.warned5 = true; sndWarn(); showBanner("5 minutes remaining — finish up and submit.", "warn"); }
    if (rem <= 0) { $("timer").textContent = "00:00:00"; sndAlarm(); submitExam(true); }
  }

  /* ---------- EXAM UI ---------- */
  function renderExam() {
    renderPalette();
    renderQuestion();
    $("btn-submit").onclick = function () { submitExam(false); };
    $("btn-prev").onclick = function () { goto(S.idx - 1); };
    $("btn-next").onclick = function () { goto(S.idx + 1); };
    $("btn-mark").onclick = function () { S.ans[S.idx].marked = !S.ans[S.idx].marked; renderPalette(); renderQuestion(); };
    $("btn-clear").onclick = function () { S.ans[S.idx].sel = null; renderPalette(); renderQuestion(); };
  }
  function goto(i) { if (i >= 0 && i < S.paper.length) { settleQTime(); S.idx = i; renderPalette(); renderQuestion(); window.scrollTo(0, 0); } }
  function palState(i) {
    var a = S.ans[i];
    if (hasAns(a)) return a.marked ? "answered marked" : "answered";
    if (a.marked) return "marked";
    if (a.visited) return "visited";
    return "untouched";
  }
  function renderPalette() {
    var tabs = $("section-tabs"); tabs.innerHTML = "";
    var allTab = document.createElement("button");
    allTab.textContent = "ALL";
    allTab.className = S.paletteFilter === "all" ? "active" : "";
    allTab.onclick = function () { S.paletteFilter = "all"; renderPalette(); };
    tabs.appendChild(allTab);
    S.sections.forEach(function (sec) {
      var b = document.createElement("button");
      b.textContent = sec.id;
      b.className = S.paletteFilter === sec.id ? "active" : "";
      b.onclick = function () { S.paletteFilter = sec.id; renderPalette(); };
      tabs.appendChild(b);
    });
    var grid = $("palette"); grid.innerHTML = "";
    S.paper.forEach(function (q, i) {
      if (S.paletteFilter !== "all" && q.section !== S.paletteFilter) return;
      var b = document.createElement("button");
      b.textContent = String(i + 1);
      b.className = palState(i) + (i === S.idx ? " current" : "");
      b.onclick = function () { settleQTime(); S.idx = i; renderPalette(); renderQuestion(); };
      grid.appendChild(b);
    });
  }
  function practiceFb(q, a) {
    var ok;
    if (q.type === "nat") { var v = parseFloat(a.sel); ok = !isNaN(v) && Math.abs(v - q.ans) <= q.tol; }
    else { var s = (a.sel || []).slice().sort().join(""); var c = q.correct.slice().sort().join(""); ok = s === c; }
    if (q.type === "mcq") ok = (a.sel || [])[0] === q.correct[0];
    var html = ok ? '<div class="instant-fb correct">✓ Correct! ' : '<div class="instant-fb wrong">✗ Not correct. ';
    if (!ok) html += q.type === "nat" ? "Answer: " + q.ans + (q.unit ? " " + esc(q.unit) : "") : "Correct: " + q.correct.map(function (k) { return k.toUpperCase(); }).join(", ");
    html += "</div>";
    return html;
  }
  function renderQuestion() {
    var q = S.paper[S.idx], a = S.ans[S.idx], area = $("question-area");
    var html = '<div class="q-meta">' +
      '<span class="chip">' + esc(q.sectionName) + "</span>" +
      '<span class="chip type-' + q.type + '">' + typeLabel(q.type) + "</span>" +
      '<span class="chip">' + q.marks + " mark" + (q.marks !== 1 ? "s" : "") + "</span>" +
      (q.topic ? '<span class="chip">' + esc(q.topic) + "</span>" : "") +
      (q.src ? '<span class="chip">' + esc(q.src) + "</span>" : "") + "</div>";
    html += '<div class="q-text">' + esc(q.q) + "</div>";
    if (q.type === "mcq" || q.type === "msq") {
      html += '<div class="opt-list">';
      (q.optOrder || ["a", "b", "c", "d"]).forEach(function (k) {
        if (!q.options || q.options[k] === undefined) return;
        var sel = (a.sel || []).indexOf(k) >= 0;
        html += '<label class="opt' + (sel ? " selected" : "") + '" data-key="' + k + '">' +
          '<input type="' + (q.type === "msq" ? "checkbox" : "radio") + '" name="qopt" ' + (sel ? "checked" : "") + ">" +
          '<span class="key">' + k.toUpperCase() + "</span><span>" + esc(q.options[k]) + "</span></label>";
      });
      html += "</div>";
      html += '<p class="coverage" style="font-size:12px">' + (q.type === "msq" ? "Multi-select — all correct options must be chosen. No negative marking." : "Single choice. Negative marking applies if wrong.") + "</p>";
    } else {
      html += '<div class="nat-input"><input id="nat-in" type="text" inputmode="decimal" value="' + esc(a.sel || "") + '" placeholder="Type your numerical answer">' +
        (q.unit ? '<span class="unit">' + esc(q.unit) + "</span>" : "") + "</div>";
      html += '<p class="coverage" style="font-size:12px">Numerical answer type — type a number (e.g. 42.5 or 1.2e-3). No negative marking.</p>';
    }
    if (S.practice && hasAns(a)) html += practiceFb(q, a);
    area.innerHTML = html;
    var opts = area.querySelectorAll(".opt");
    opts.forEach(function (el) {
      el.onclick = function () {
        var k = el.dataset.key;
        if (q.type === "mcq") a.sel = [k];
        else {
          var arr = (a.sel || []).slice();
          var ix = arr.indexOf(k);
          if (ix >= 0) arr.splice(ix, 1); else arr.push(k);
          a.sel = arr;
        }
        a.visited = true;
        renderPalette(); renderQuestion();
      };
    });
    var nat = $("nat-in");
    if (nat) {
      nat.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); goto(S.idx + 1); } };
      nat.oninput = function () {
        var v = nat.value.replace(/[^0-9.eE+\-]/g, "");
        if (nat.value !== v) nat.value = v;
        a.sel = v.trim() === "" ? null : v.trim();
        a.visited = true;
        renderPalette(); renderQuestion();
      };
    }
    $("btn-clear").disabled = !hasAns(a);
    $("btn-mark").innerHTML = a.marked ? '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Marked' : '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .9-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.6l6-.9L12 3.2z"/></svg> Mark for Review';
    typeset(area);
  }

  /* ---------- DRILL MODE (unlimited) ---------- */
  function secName(id) {
    var ex = S.exam, all = (ex.sections || []).concat(ex.optionals || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].name;
    return id;
  }
  function isCorrect(q, a) {
    if (!hasAns(a)) return false;
    if (q.type === "nat") { var v = parseFloat(a.sel); return !isNaN(v) && Math.abs(v - q.ans) <= q.tol; }
    if (q.type === "msq") return (a.sel || []).slice().sort().join("") === (q.correct || []).slice().sort().join("");
    return (a.sel || [])[0] === q.correct[0];
  }
  function shuffleAll(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function startDrill() {
    var pool = (BANK[S.exam.code] || []).slice();
    if (!pool.length) { alert("Question pool is empty. Add questions into the pool files (bank-*.js) first."); return; }
    S.drill = { queue: shuffleAll(pool), idx: 0, seen: 0, cor: 0, wro: 0, skip: 0, cycle: 0 };
    S.submitted = false; S.paletteFilter = "all";
    clearInterval(S.timerId);
    $("timer").textContent = "--:--:--";
    $("practice-badge").classList.add("hidden");
    document.body.classList.add("drill-mode");
    $("exam-name").textContent = S.exam.name + " · Unlimited Drill";
    nextDrillQ();
    renderDrill();
    show("screen-exam");
  }
  function nextDrillQ() {
    var d = S.drill;
    if (d.idx >= d.queue.length) {
      d.queue = shuffleAll(d.queue);
      d.idx = 0; d.cycle++;
    }
    var raw = d.queue[d.idx++];
    d.seen++;
    var q = normalizeQ(raw, { id: raw.section, name: secName(raw.section) });
    if (q.options) q.optOrder = shuffleKeys(Math.random);
    S.paper = [q];
    S.ans = [{ sel: null, visited: false, marked: false, locked: false, timeSpent: 0 }];
    S.idx = 0;
    qStartAt = Date.now();
  }
  function updateDrillStats() {
    var d = S.drill, a = S.ans[0];
    if (!a.locked) return;
    if (!hasAns(a)) { d.skip++; return; }
    if (isCorrect(S.paper[0], a)) d.cor++; else d.wro++;
  }
  function renderDrill() {
    var q = S.paper[0], a = S.ans[0], d = S.drill, area = $("question-area");
    var html = '<div class="drill-stats">' +
      '<span class="chip">Q ' + d.seen + (d.cycle ? " · pass " + (d.cycle + 1) : "") + "</span>" +
      '<span class="chip good">✓ ' + d.cor + "</span>" +
      '<span class="chip bad">✗ ' + d.wro + "</span>" +
      (d.skip ? '<span class="chip">· ' + d.skip + " skipped</span>" : "") +
      '<button class="btn ghost drill-end-btn" id="drill-end">End Drill</button></div>';
    html += '<div class="q-meta">' +
      '<span class="chip">' + esc(q.sectionName) + "</span>" +
      '<span class="chip type-' + q.type + '">' + typeLabel(q.type) + "</span>" +
      '<span class="chip">' + q.marks + " mark" + (q.marks !== 1 ? "s" : "") + "</span>" +
      (q.topic ? '<span class="chip">' + esc(q.topic) + "</span>" : "") +
      (q.src ? '<span class="chip">' + esc(q.src) + "</span>" : "") + "</div>";
    html += '<div class="q-text">' + esc(q.q) + "</div>";
    /* answer widget */
    if (q.type === "mcq" || q.type === "msq") {
      var order = q.optOrder || ["a", "b", "c", "d"];
      html += '<div class="opt-list">';
      order.forEach(function (k) {
        if (!q.options || q.options[k] === undefined) return;
        var sel = (a.sel || []).indexOf(k) >= 0;
        var cls = "opt";
        if (a.locked) {
          if (q.correct.indexOf(k) >= 0) cls += " correct-opt";
          else if (sel) cls += " your-wrong";
          cls += " opted";
        } else if (sel) cls += " selected";
        html += '<label class="' + cls + '" data-key="' + k + '">' +
          '<input type="' + (q.type === "msq" ? "checkbox" : "radio") + '" name="drill-opt" ' + (sel ? "checked" : "") + (a.locked ? " disabled" : "") + ">" +
          '<span class="key">' + k.toUpperCase() + "</span><span>" + esc(q.options[k]) + "</span></label>";
      });
      html += "</div>";
      if (!a.locked && q.type === "msq") html += '<div style="margin-top:12px"><button class="btn" id="drill-check" ' + (hasAns(a) ? "" : "disabled") + ">Check answer</button></div>";
    } else {
      html += '<div class="nat-input"><input id="drill-nat" type="text" inputmode="decimal" value="' + esc(a.sel || "") + '" placeholder="Type your numerical answer"' + (a.locked ? " disabled" : "") + ">" +
        (q.unit ? '<span class="unit">' + esc(q.unit) + "</span>" : "") + "</div>";
      if (!a.locked) html += '<div style="margin-top:12px"><button class="btn" id="drill-check">Check answer</button></div>';
    }
    /* feedback after locking */
    if (a.locked) {
      var ok = isCorrect(q, a);
      html += '<div class="instant-fb ' + (ok ? "correct" : "wrong") + '">' + (ok ? "✓ Correct!" : "✗ Not correct.") +
        (!ok ? (q.type === "nat" ? " Answer: " + q.ans + (q.unit ? " " + esc(q.unit) : "") : " Correct: " + (q.correct || []).map(function (k) { return k.toUpperCase(); }).join(", ")) : "") +
        "</div>";
      if (q.explain) html += '<div class="explain">' + esc(q.explain) + "</div>";
      html += '<div class="drill-actions"><button class="btn" id="drill-next"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg> Next question</button></div>';
    }
    area.innerHTML = html;
    typeset(area);
    /* wire drill handlers */
    $("drill-end").onclick = endDrill;
    if (!a.locked) {
      area.querySelectorAll(".opt").forEach(function (el) {
        el.onclick = function () {
          if (a.locked) return;
          var k = el.dataset.key;
          if (q.type === "mcq") { a.sel = [k]; a.locked = true; updateDrillStats(); }
          else {
            var arr = (a.sel || []).slice();
            var ix = arr.indexOf(k);
            if (ix >= 0) arr.splice(ix, 1); else arr.push(k);
            a.sel = arr;
          }
          renderDrill();
        };
      });
      var natIn = $("drill-nat");
      if (natIn) natIn.oninput = function () {
        var v = natIn.value.replace(/[^0-9.eE+\-]/g, "");
        if (natIn.value !== v) natIn.value = v;
        a.sel = v.trim() === "" ? null : v.trim();
        renderDrill();
      };
      var chk = $("drill-check");
      if (chk) chk.onclick = function () { a.locked = true; updateDrillStats(); renderDrill(); };
    } else {
      $("drill-next").onclick = function () { nextDrillQ(); renderDrill(); };
    }
  }
  function endDrill() {
    var d = S.drill, area = $("question-area");
    S.submitted = true;
    S.drill = null;
    var tot = d.cor + d.wro;
    var pct = tot ? Math.round(100 * d.cor / tot) : 0;
    area.innerHTML = '<div class="drill-end"><h3>Drill Complete</h3>' +
      '<div class="score-rows">' +
      '<div class="score-card good"><div class="big">' + d.cor + '</div><div class="lbl">Correct</div></div>' +
      '<div class="score-card bad"><div class="big">' + d.wro + '</div><div class="lbl">Wrong</div></div>' +
      '<div class="score-card"><div class="big">' + d.skip + '</div><div class="lbl">Skipped</div></div>' +
      '<div class="score-card"><div class="big">' + pct + '%</div><div class="lbl">Accuracy</div></div>' +
      "</div>" +
      '<p class="coverage">' + d.seen + " questions · " + (d.cycle + 1) + " pass" + (d.cycle ? "es" : "") + " through the pool</p>" +
      '<div class="drill-actions"><button class="btn" id="drill-done">Done</button></div></div>';
    $("drill-done").onclick = function () {
      S.submitted = false;
      document.body.classList.remove("drill-mode");
      show("screen-home");
      renderHome();
    };
  }

  /* ---------- SCORING ---------- */
  function perQScore(q, a) {
    var sel = a.sel, marks = q.marks, res = "skip", score = 0, neg = 0;
    if (q.type === "mcq") {
      if (hasAns(a)) {
        if (sel[0] === q.correct[0]) { score = marks; res = "cor"; }
        else { neg = S.exam.negType === "fixed" ? S.exam.negFixed : marks / 3; score = -neg; res = "wro"; }
      }
    } else if (q.type === "msq") {
      if (hasAns(a)) {
        var s = sel.slice().sort().join(""), c = q.correct.slice().sort().join("");
        if (s === c) { score = marks; res = "cor"; } else { score = 0; res = "wro"; }
      }
    } else {
      if (hasAns(a)) {
        var v = parseFloat(sel);
        if (!isNaN(v) && Math.abs(v - q.ans) <= q.tol) { score = marks; res = "cor"; } else { score = 0; res = "wro"; }
      }
    }
    return { section: q.section, marks: marks, score: score, res: res, neg: neg, excluded: false };
  }
  function computeResults() {
    var per = S.paper.map(function (q, i) { return perQScore(q, S.ans[i]); });
    if (S.exam.bestN) {
      var bn = S.exam.bestN;
      var idxs = [];
      S.paper.forEach(function (q, i) { if (q.section === bn.section) idxs.push(i); });
      var order = idxs.slice().sort(function (x, y) { return per[y].score - per[x].score; });
      var keep = order.slice(0, bn.n);
      idxs.forEach(function (i) { if (keep.indexOf(i) < 0) per[i].excluded = true; });
    }
    var sec = {};
    S.sections.forEach(function (s) { sec[s.id] = { name: s.name, score: 0, max: 0, att: 0, cor: 0, wro: 0, skip: 0, excl: 0, timeMs: 0 }; });
    var total = 0, max = 0, att = 0, cor = 0, wro = 0, skip = 0, neg = 0;
    per.forEach(function (r, i) {
      var s = sec[r.section];
      s.timeMs += (S.ans[i].timeSpent || 0);
      if (r.excluded) { s.excl++; return; }
      total += r.score; max += r.marks; neg += r.neg;
      if (r.res === "cor") { cor++; s.cor++; att++; s.att++; }
      else if (r.res === "wro") { wro++; s.wro++; att++; s.att++; }
      else { skip++; s.skip++; }
      s.score += r.score; s.max += r.marks;
    });
    var allMs = S.exam.durationMin * 60000;
    var timeMs = S.practice ? 0 : Math.max(0, Math.min(allMs, Date.now() - (S.endAt - allMs)));
    return { per: per, sec: sec, total: total, max: max, att: att, cor: cor, wro: wro, skip: skip, neg: neg, timeMs: timeMs, pct: max ? (total / max) * 100 : 0 };
  }

  /* ---------- RESULTS ---------- */
  function submitExam(auto) {
    if (S.submitted) return;
    if (!auto && !S.practice) { openSubmitModal(); return; }
    doSubmit(auto);
  }
  function openSubmitModal() {
    var ans = 0, marked = 0;
    S.ans.forEach(function (a) { if (hasAns(a)) ans++; if (a.marked) marked++; });
    var unans = S.paper.length - ans;
    var m = document.createElement("div");
    m.className = "modal-overlay";
    m.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Submit exam">' +
      '<h3>Submit exam?</h3>' +
      '<p class="coverage">Review your status before ending the test.</p>' +
      '<div class="modal-stats">' +
      '<div class="modal-stat"><b>' + ans + "</b><span>Answered</span></div>" +
      '<div class="modal-stat"><b>' + unans + "</b><span>Unanswered</span></div>" +
      '<div class="modal-stat"><b>' + marked + "</b><span>Marked</span></div>" +
      "</div>" +
      '<p class="coverage">Unanswered questions score 0. You cannot resume after submitting.</p>' +
      '<div class="modal-actions">' +
      '<button class="btn" id="modal-cancel">Keep Working</button>' +
      '<button class="btn danger" id="modal-confirm">Submit Now</button>' +
      "</div></div>";
    document.body.appendChild(m);
    S.modalOpen = true;
    function close() { S.modalOpen = false; m.remove(); document.removeEventListener("keydown", esc); }
    function esc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", esc);
    $("modal-cancel").onclick = close;
    $("modal-confirm").onclick = function () { close(); doSubmit(false); };
  }
  function doSubmit(auto) {
    if (S.submitted) return;
    S.submitted = true;
    clearInterval(S.timerId);
    settleQTime();
    var res = computeResults();
    S.results = res;
    saveHistory(res);
    renderResults();
    show("screen-result");
  }
  function renderResults() {
    var r = S.results, ex = S.exam;
    $("result-title").textContent = ex.name + (S.mode === "fixed" ? " — Mock Test " + S.fixedSet : "") + " — Result";
    var pctC = "score-card" + (r.pct >= 60 ? " good" : r.pct < 35 ? " bad" : "");
    $("result-summary").innerHTML =
      '<div class="score-rows">' +
      '<div class="' + pctC + '"><div class="big">' + (Math.round(r.total * 100) / 100) + " / " + r.max + "</div><div class='lbl'>Total marks</div></div>" +
      "<div class='score-card'><div class='big'>" + Math.round(r.pct) + "%</div><div class='lbl'>Percentage</div></div>" +
      "<div class='score-card'><div class='big'>" + r.att + "</div><div class='lbl'>Attempted</div></div>" +
      "<div class='score-card good'><div class='big'>" + r.cor + "</div><div class='lbl'>Correct</div></div>" +
      "<div class='score-card bad'><div class='big'>" + r.wro + "</div><div class='lbl'>Wrong</div></div>" +
      "<div class='score-card'><div class='big'>" + r.skip + "</div><div class='lbl'>Skipped</div></div>" +
      "<div class='score-card'><div class='big'>" + (Math.round(r.neg * 100) / 100) + "</div><div class='lbl'>Negative marks</div></div>" +
      "<div class='score-card'><div class='big'>" + (r.timeMs ? fmtClock(r.timeMs) : "n/a") + "</div><div class='lbl'>Time used</div></div>" +
      "</div>";
    var rows = S.sections.map(function (s) {
      var d = r.sec[s.id];
      return "<tr><td>" + esc(d.name) + "</td><td>" + (Math.round(d.score * 100) / 100) + " / " + d.max + "</td><td>" + d.att + "</td><td>" + d.cor + "</td><td>" + d.wro + "</td><td>" + d.skip + (d.excl ? " (" + d.excl + " not counted)" : "") + "</td><td>" + fmtDur(d.timeMs) + "</td></tr>";
    }).join("");
    $("result-sections").innerHTML =
      "<table class='sec-table'><thead><tr><th>Section</th><th>Score</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Time</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      (ex.bestN ? '<p class="coverage ok">GAT-B Section B: your best ' + ex.bestN.n + " answered questions were auto-selected for scoring.</p>" : "") +
      (S.switches > 0 ? '<p class="coverage bad">App was backgrounded ' + S.switches + ' time' + (S.switches > 1 ? "s" : "") + ' during the exam — recorded like a proctored session.</p>' : "");
    $("btn-review").onclick = renderReview;
    $("btn-retry").onclick = function () { startExam(); };
    $("btn-home").onclick = function () { show("screen-home"); renderHome(); };
    typeset($("result-summary"));
  }

  /* ---------- REVIEW ---------- */
  function renderReview() {
    var html = "";
    var counts = { all: 0, cor: 0, wro: 0, skip: 0 };
    S.results.per.forEach(function (r) { counts[r.res]++; counts.all++; });
    var tabs = [["all", "All"], ["cor", "Correct"], ["wro", "Wrong"], ["skip", "Skipped"]];
    html += '<div class="rev-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button class="rev-tab' + (S.reviewFilter === t[0] ? " on" : "") + '" data-f="' + t[0] + '">' + t[1] + ' <span class="cnt">' + counts[t[0]] + "</span></button>";
    }).join("") + "</div>";
    S.paper.forEach(function (q, i) {
      var r = S.results.per[i];
      if (S.reviewFilter !== "all" && r.res !== S.reviewFilter) return;
      var a = S.ans[i];
      var verdict = r.excluded ? "Not counted (outside best-60)" :
        r.res === "cor" ? "Correct ✓ (+" + q.marks + ")" :
          r.res === "wro" ? "Incorrect ✗ (" + (Math.round(r.score * 100) / 100) + ")" : "Not attempted";
      html += "<div class='rev-item'><div class='rq'><span class='chip'>Q" + (i + 1) + " · " + esc(q.sectionName) + "</span><span class='chip'>" + q.marks + "m " + typeLabel(q.type) + "</span>" + (q.src ? '<span class="chip">' + esc(q.src) + "</span>" : "") + '<span class="chip">' + fmtDur(a.timeSpent) + "</span> " + esc(q.q) + "</div>";
      if (q.type !== "nat") {
        ["a", "b", "c", "d"].forEach(function (k) {
          if (!q.options || q.options[k] === undefined) return;
          var cls = "";
          if (q.correct.indexOf(k) >= 0) cls += " correct-opt";
          if ((a.sel || []).indexOf(k) >= 0 && q.correct.indexOf(k) < 0) cls += " your-wrong";
          html += "<div class='opt" + cls + "'><span class='key'>" + k.toUpperCase() + "</span><span>" + esc(q.options[k]) + "</span></div>";
        });
      } else {
        html += "<p>Your answer: <b>" + esc(a.sel && String(a.sel).trim() !== "" ? a.sel : "—") + "</b> &nbsp;·&nbsp; Correct: <b>" + q.ans + (q.unit ? " " + esc(q.unit) : "") + "</b></p>";
      }
      html += "<div class='verdict " + (r.res === "cor" ? "ok" : r.res === "wro" ? "no" : "") + "'>" + verdict + "</div>";
      if (q.explain) html += "<div class='explain'>" + esc(q.explain) + "</div>";
      html += "</div>";
    });
    $("review-list").innerHTML = html;
    show("screen-review");
    window.scrollTo(0, 0);
    typeset($("review-list"));
  }

  /* ---------- HISTORY ---------- */
  function saveHistory(res) {
    try {
      var h = JSON.parse(localStorage.getItem("gct.history.v1") || "[]");
      h.unshift({
        code: S.exam.code, name: S.exam.name + (S.mode === "fixed" ? " · Mock " + S.fixedSet : ""), date: new Date().toISOString(),
        score: Math.round(res.total * 100) / 100, max: res.max, pct: Math.round(res.pct * 10) / 10,
        cor: res.cor, wro: res.wro, att: res.att
      });
      localStorage.setItem("gct.history.v1", JSON.stringify(h.slice(0, 30)));
    } catch (e) { }
  }
  function renderHistory() {
    var h = [];
    try { h = JSON.parse(localStorage.getItem("gct.history.v1") || "[]"); } catch (e) { }
    var p = $("history-panel"), b = $("btn-history");
    if (!h.length) { p.classList.add("hidden"); b.disabled = true; return; }
    b.disabled = false;
    var trend = "";
    if (h.length >= 2) {
      var recent = h.slice(0, 8).reverse();
      var W = 140, g = 4, pts = recent.map(function (x, i) {
        return [(i / (recent.length - 1)) * (W - 2 * g) + g, Math.max(g, 40 - (x.pct / 100) * 36)].join(",");
      }).join(" ");
      var last = [(recent.length - 1 === 0 ? g : W - g), Math.max(g, 40 - (recent[recent.length - 1].pct / 100) * 36) - 2].join(" ");
      trend = '<div class="trend-wrap"><svg class="trend" viewBox="0 0 ' + W + " 40" + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + last.split(",")[0] + '" cy="' + last.split(",")[1] + '" r="2.5" fill="var(--accent)"/></svg><div class="trend-lbl">Score trend — last ' + recent.length + " attempts</div></div>";
    }
    p.innerHTML = "<h3><svg class='ic' viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='8.5'/><path d='M12 7.5V12l3 2'/></svg> Attempt history (last " + h.length + ")</h3>" + trend + "<table><thead><tr><th>Date</th><th>Exam</th><th>Score</th><th>%</th><th>Att</th><th>✓</th><th>✗</th></tr></thead><tbody>" +
      h.map(function (x) {
        return "<tr><td>" + esc(x.date.slice(0, 16).replace("T", " ")) + "</td><td>" + esc(x.name) + "</td><td>" + x.score + " / " + x.max + "</td><td>" + x.pct + "%</td><td>" + x.att + "</td><td>" + x.cor + "</td><td>" + x.wro + "</td></tr>";
      }).join("") + "</tbody></table>";
    p.classList.remove("hidden");
  }

  /* ---------- WIRING ---------- */
  function wire() {
    document.addEventListener("click", function (e) {
      var f = e.target.closest("[data-f]");
      if (f) { S.reviewFilter = f.dataset.f; renderReview(); return; }
      var t = e.target.closest("[data-go]");
      if (!t) return;
      var go = t.dataset.go;
      if (go === "home") { document.body.classList.remove("drill-mode"); show("screen-home"); renderHome(); }
      else if (go === "result") { renderResults(); show("screen-result"); }
    });
    $("btn-history").onclick = function () { $("history-panel").classList.toggle("hidden"); };
    $("instruct-ack").onchange = function () {
      var ok = $("instruct-ack").checked;
      $("btn-begin").disabled = !ok;
      $("instruct-hint").textContent = ok ? "Ready? Begin when you are." : "Tick the confirmation box to enable Begin Exam.";
    };
    $("btn-begin").onclick = beginExam;
    document.addEventListener("visibilitychange", function () {
      if (!$("screen-exam").classList.contains("active") || S.submitted) return;
      if (document.hidden) S.switches++;
      else if (S.switches > 0) showBanner("App backgrounded " + S.switches + " time" + (S.switches > 1 ? "s" : "") + " during the exam — recorded like a proctored session.", "warn");
    });
    document.addEventListener("keydown", function (e) {
      // never hijack keys while the user types (NAT answer input)
      var tgt = e.target;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (S.modalOpen) return;
      if (!$("screen-exam").classList.contains("active") || S.submitted) return;
      /* drill-mode keys: 1-4 select, Enter advances */
      if (S.mode === "unlimited" && S.drill) {
        var dq = S.paper[0], da = S.ans[0];
        if (e.key === "Enter") { e.preventDefault(); if (da.locked) { nextDrillQ(); renderDrill(); } }
        else if (dq.type === "mcq" && !da.locked && ["1", "2", "3", "4"].indexOf(e.key) >= 0) {
          var dk = (dq.optOrder || ["a", "b", "c", "d"])[+e.key - 1];
          if (dq.options && dq.options[dk] !== undefined) { da.sel = [dk]; da.locked = true; updateDrillStats(); renderDrill(); e.preventDefault(); }
        }
        return;
      }
      var q = S.paper[S.idx];
      if (e.key === "ArrowRight") { goto(S.idx + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { goto(S.idx - 1); e.preventDefault(); }
      else if (q.type === "mcq" && ["1", "2", "3", "4"].indexOf(e.key) >= 0) {
        var keys = q.optOrder || ["a", "b", "c", "d"];
        var k = keys[+e.key - 1];
        if (!q.options || q.options[k] === undefined) return;
        S.ans[S.idx].sel = [k]; S.ans[S.idx].visited = true;
        renderPalette(); renderQuestion(); e.preventDefault();
      }
    });
    calc = GATECalc("calc-host");
    $("btn-calc").onclick = function () { calc.toggle(); };
    $("btn-scratch").onclick = function () {
      var p = $("scratch-pad");
      p.classList.toggle("hidden");
      if (!p.classList.contains("hidden")) p.focus();
    };
    $("scratch-pad").addEventListener("input", function () { scratchSave(this.value); });
    renderHome();
  }
  /* Android back-stack hook (consumed by the APK wrapper's hardware back button) */
  window.__cbt = {
    goHome: function () {
      clearInterval(S.timerId);
      S.submitted = false;
      document.body.classList.remove("drill-mode");
      S.drill = null;
      show("screen-home");
      renderHome();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();