/* ============================================================
   GATE-CBT · Engine (state, timer, palette, scoring, results)
   Four exam patterns driven by exams.js configs; banks in bank-*.js.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var BANK = window.GATE_BANK || {};
  var S = {
    exam: null, sections: [], paper: [], ans: [],
    idx: 0, endAt: 0, timerId: null, practice: false,
    submitted: false, results: null, paletteFilter: "all", selOptions: []
  };
  var calc = null;

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

  /* ---------- HOME ---------- */
  function renderHome() {
    var cards = $("exam-cards"); cards.innerHTML = "";
    Object.keys(GATE_EXAMS).forEach(function (code) {
      var ex = GATE_EXAMS[code];
      var d = document.createElement("div"); d.className = "exam-card";
      d.innerHTML = "<h3>" + esc(ex.name) + "</h3><div class='org'>" + esc(ex.org) + "</div>" +
        "<div class='facts'><span>" + ex.totalQ + " questions/paper</span><span>" + ex.totalMarks + " marks</span><span>" + ex.durationMin + " min</span><span>pool: " + (BANK[code] || []).length + "</span></div>" +
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
    if (S.exam.optionals) S.selOptions = S.exam.optionals.slice(0,2).map(function(o){return o.id;});
    $("config-title").textContent = S.exam.name;
    var html = '<div class="config-card"><h4>Exam pattern</h4><div class="pat">' + esc(patternText()) + "</div></div>";
    if (S.exam.optionals) {
      html += '<div class="config-card"><h4>Choose your ' + S.exam.optionalPick + ' optional sections</h4><div class="opt-group">' +
        S.exam.optionals.map(function (o, i) {
          var cov = coverage(o.id);
          var on = cov.ok && cov.count > 0;                 // only content-backed units are pickable
          var disabled = on ? "" : "disabled";
          var checked = (on && i < 2) ? "checked" : "";
          return '<label class="' + (on ? "" : "disabled") + '" title="' + (on ? "Bank has content" : "No questions in pool yet — not selectable") + '">' +
            '<input type="checkbox" value="' + o.id + '" ' + checked + " " + disabled + "> " +
            esc(o.name) + ' <span class="' + (cov.ok ? "ok" : "bad") + '">(' + cov.text + ")</span></label>";
        }).join("") + "</div>" +
        '<p class="coverage">' + esc(S.exam.optionals[0].name) + ' &amp; ' + esc(S.exam.optionals[1].name) + " pre-selected (matches your syllabus pairing — XL-S + XL-Q). Others light up once their bank content exists.</p></div>";
    }
    html += '<div class="config-card"><h4>Options</h4><label class="checkbox-row"><input type="checkbox" id="cfg-practice"> Untimed practice mode — instant feedback, no timer, no negative-marking pressure</label></div>';
    html += '<div id="cfg-coverage"></div>';
    html += '<div class="start-row"><button class="btn" id="btn-start">▶ Start Exam</button><span id="cfg-status"></span></div>';
    $("config-body").innerHTML = html;
    $("btn-start").onclick = startExam;
    refreshCoverage();
    show("screen-config");
  }
  function refreshCoverage() {
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
  /* build a FRESH random paper each run: sample per (section, marks, type) bucket */
  function sampleFrom(list, n) {
    var p = list.slice(), out = [];
    while (out.length < n && p.length) {
      var k = Math.floor(Math.random() * p.length);
      out.push(p.splice(k, 1)[0]);
    }
    return out;
  }
  function normalizeQ(q, sec) {
    return {
      section: sec.id, sectionName: sec.name, type: q.type, marks: q.marks || 1,
      q: q.q, options: q.options || null, correct: (q.correct || []).slice(),
      ans: q.ans, tol: q.tol != null ? q.tol : S.exam.natTol, unit: q.unit || "",
      explain: q.explain || "", topic: q.topic || "", src: q.src || ""
    };
  }
  function buildPaper() {
    var paper = [], short = [];
    S.sections.forEach(function (sec) {
      var comp = sec.compose || [{ m: sec.marks || 1, n: sec.q, t: null }];
      comp.forEach(function (b) {
        var cands = (BANK[S.exam.code] || []).filter(function (q) {
          return q.section === sec.id && (q.marks || 1) === b.m && (!b.t || b.t.indexOf(q.type) >= 0);
        });
        var pick = sampleFrom(cands, b.n);
        if (pick.length < b.n) short.push(sec.id + ": " + b.m + "m ×" + b.n + " (only " + pick.length + " in pool)");
        pick.forEach(function (q) { paper.push(normalizeQ(q, sec)); });
      });
    });
    return { paper: paper, short: short };
  }
  function startExam() {
    S.sections = resolveSections();
    var built = buildPaper();
    S.paper = built.paper;
    if (!S.paper.length) { alert("Question pool is empty. Add questions into the pool files (bank-*.js) first."); return; }
    if (built.short.length) {
      alert("⚠ Question pool is low in some slots:\n" + built.short.join("\n") +
        "\n\nStarting with what's available. Add more questions to the pool (scrape more PYQs) to get a full-length paper every time.");
    }
    S.practice = $("cfg-practice") && $("cfg-practice").checked;
    S.ans = S.paper.map(function () { return { sel: null, visited: false, marked: false }; });
    S.idx = 0; S.submitted = false; S.results = null; S.paletteFilter = "all";
    clearInterval(S.timerId);
    if (!S.practice) { S.endAt = Date.now() + S.exam.durationMin * 60000; $("timer").textContent = fmtClock(S.exam.durationMin * 60000); startTimer(); }
    else { S.endAt = 0; $("timer").textContent = "--:--:--"; }
    $("timer").classList.remove("warn");
    $("exam-name").textContent = S.exam.name + (S.exam.code === "xl" ? " · " + S.sections.slice(2).map(function (s) { return s.name.split(" ")[1] || s.name; }).join(" + ") : "");
    $("practice-badge").classList.toggle("hidden", !S.practice);
    renderExam();
    show("screen-exam");
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
    $("timer").classList.toggle("warn", rem <= 300000 && rem > 0);
    if (rem <= 0) { $("timer").textContent = "00:00:00"; submitExam(true); }
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
  function goto(i) { if (i >= 0 && i < S.paper.length) { S.idx = i; renderPalette(); renderQuestion(); window.scrollTo(0, 0); } }
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
      b.onclick = function () { S.idx = i; renderPalette(); renderQuestion(); };
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
      (q.topic ? '<span class="chip">' + esc(q.topic) + "</span>" : "") + "</div>";
    html += '<div class="q-text">' + esc(q.q) + "</div>";
    if (q.type === "mcq" || q.type === "msq") {
      html += '<div class="opt-list">';
      ["a", "b", "c", "d"].forEach(function (k) {
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
    $("btn-mark").textContent = a.marked ? "⭑ Marked ✓" : "⭑ Mark for Review";
    typeset(area);
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
    S.sections.forEach(function (s) { sec[s.id] = { name: s.name, score: 0, max: 0, att: 0, cor: 0, wro: 0, skip: 0, excl: 0 }; });
    var total = 0, max = 0, att = 0, cor = 0, wro = 0, skip = 0, neg = 0;
    per.forEach(function (r) {
      var s = sec[r.section];
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
    if (!auto && !S.practice && !confirm("Submit the exam now?")) return;
    S.submitted = true;
    clearInterval(S.timerId);
    var res = computeResults();
    S.results = res;
    saveHistory(res);
    renderResults();
    show("screen-result");
  }
  function renderResults() {
    var r = S.results, ex = S.exam;
    $("result-title").textContent = ex.name + " — Result";
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
      return "<tr><td>" + esc(d.name) + "</td><td>" + (Math.round(d.score * 100) / 100) + " / " + d.max + "</td><td>" + d.att + "</td><td>" + d.cor + "</td><td>" + d.wro + "</td><td>" + d.skip + (d.excl ? " (" + d.excl + " not counted)" : "") + "</td></tr>";
    }).join("");
    $("result-sections").innerHTML =
      "<table class='sec-table'><thead><tr><th>Section</th><th>Score</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Skipped</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      (ex.bestN ? '<p class="coverage ok">GAT-B Section B: your best ' + ex.bestN.n + " answered questions were auto-selected for scoring.</p>" : "");
    $("btn-review").onclick = renderReview;
    $("btn-retry").onclick = function () { startExam(); };
    $("btn-home").onclick = function () { show("screen-home"); renderHome(); };
    typeset($("result-summary"));
  }

  /* ---------- REVIEW ---------- */
  function renderReview() {
    var html = "";
    S.paper.forEach(function (q, i) {
      var a = S.ans[i], r = S.results.per[i];
      var verdict = r.excluded ? "Not counted (outside best-60)" :
        r.res === "cor" ? "Correct ✓ (+" + q.marks + ")" :
          r.res === "wro" ? "Incorrect ✗ (" + (Math.round(r.score * 100) / 100) + ")" : "Not attempted";
      html += "<div class='rev-item'><div class='rq'><span class='chip'>Q" + (i + 1) + " · " + esc(q.sectionName) + "</span><span class='chip'>" + q.marks + "m " + typeLabel(q.type) + "</span>" + (q.src ? '<span class="chip">' + esc(q.src) + "</span>" : "") + " " + esc(q.q) + "</div>";
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
        code: S.exam.code, name: S.exam.name, date: new Date().toISOString(),
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
    p.innerHTML = "<h3>📜 Attempt history (last " + h.length + ")</h3><table><thead><tr><th>Date</th><th>Exam</th><th>Score</th><th>%</th><th>Att</th><th>✓</th><th>✗</th></tr></thead><tbody>" +
      h.map(function (x) {
        return "<tr><td>" + esc(x.date.slice(0, 16).replace("T", " ")) + "</td><td>" + esc(x.name) + "</td><td>" + x.score + " / " + x.max + "</td><td>" + x.pct + "%</td><td>" + x.att + "</td><td>" + x.cor + "</td><td>" + x.wro + "</td></tr>";
      }).join("") + "</tbody></table>";
    p.classList.remove("hidden");
  }

  /* ---------- WIRING ---------- */
  function wire() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-go]");
      if (!t) return;
      var go = t.dataset.go;
      if (go === "home") { show("screen-home"); renderHome(); }
      else if (go === "result") { renderResults(); show("screen-result"); }
    });
    $("btn-history").onclick = function () { $("history-panel").classList.toggle("hidden"); };
    document.addEventListener("keydown", function (e) {
      // never hijack keys while the user types (NAT answer input)
      var tgt = e.target;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (!$("screen-exam").classList.contains("active") || S.submitted) return;
      var q = S.paper[S.idx];
      if (e.key === "ArrowRight") { goto(S.idx + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { goto(S.idx - 1); e.preventDefault(); }
      else if (q.type === "mcq" && ["1", "2", "3", "4"].indexOf(e.key) >= 0) {
        var keys = ["a", "b", "c", "d"];
        var k = keys[+e.key - 1];
        if (!q.options || q.options[k] === undefined) return; // question has <4 options
        S.ans[S.idx].sel = [k]; S.ans[S.idx].visited = true;
        renderPalette(); renderQuestion(); e.preventDefault();
      }
    });
    calc = GATECalc("calc-host");
    $("btn-calc").onclick = function () { calc.toggle(); };
    renderHome();
  }
  /* Android back-stack hook (consumed by the APK wrapper's hardware back button) */
  window.__cbt = {
    goHome: function () {
      clearInterval(S.timerId);
      show("screen-home");
      renderHome();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();