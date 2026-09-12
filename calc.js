/* ============================================================
   GATE-CBT · Virtual Calculator (GATE-approved function set)
   + - × ÷ √ x² xʸ 1/x π e ( ) sin cos tan ln log · MC MR M+ M-
   Backspace · AC · +/- — shunting-yard evaluator, no eval().
   ============================================================ */
(function (global) {
  "use strict";

  var FNS = {
    sin: { args: 1, f: Math.sin }, cos: { args: 1, f: Math.cos }, tan: { args: 1, f: Math.tan },
    ln: { args: 1, f: Math.log }, log: { args: 1, f: Math.log10 },
    sqrt: { args: 1, f: Math.sqrt }, abs: { args: 1, f: Math.abs }
  };
  var PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
  var ASSOC_R = { "^": true };

  function tokenize(s) {
    var t = [], i = 0, n = s.length;
    while (i < n) {
      var c = s[i];
      if (c === " ") { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < n && /[0-9.]/.test(s[j])) j++;
        t.push({ k: 0, v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (c === "p" && s.slice(i, i + 2) === "pi") { t.push({ k: 0, v: Math.PI }); i += 2; continue; }
      if (c === "e" && !/[0-9.]/.test(s[i + 1] || "")) { t.push({ k: 0, v: Math.E }); i += 1; continue; }
      if (/[a-z]/.test(c)) {
        var k = i; while (k < n && /[a-z]/.test(s[k])) k++;
        t.push({ k: 2, v: s.slice(i, k) }); i = k; continue;
      }
      if ("+-*/^".indexOf(c) >= 0) { t.push({ k: 1, v: c }); i++; continue; }
      if (c === "(") { t.push({ k: 3 }); i++; continue; }
      if (c === ")") { t.push({ k: 4 }); i++; continue; }
      if (c === ",") { t.push({ k: 5 }); i++; continue; }
      return { err: "bad char" };
    }
    return t;
  }

  function shuntingYard(toks) {
    var out = [], ops = [], expOp = true, i;
    for (i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.k === 0) { out.push(tk); expOp = false; continue; }
      if (tk.k === 2) { ops.push(tk); expOp = true; continue; }
      if (tk.k === 1) {
        if (expOp && tk.v === "-") { out.push({ k: 2, v: "neg" }); continue; }
        if (expOp && tk.v === "+") { continue; }
        while (ops.length) {
          var o = ops[ops.length - 1];
          if (o.k === 1 && (PREC[o.v] > PREC[tk.v] || (PREC[o.v] === PREC[tk.v] && !ASSOC_R[tk.v]))) out.push(ops.pop());
          else break;
        }
        ops.push(tk); expOp = true; continue;
      }
      if (tk.k === 3) { ops.push(tk); expOp = true; continue; }
      if (tk.k === 4) {
        while (ops.length && ops[ops.length - 1].k !== 3) out.push(ops.pop());
        if (!ops.length) return { err: ")" };
        ops.pop();
        if (ops.length && ops[ops.length - 1].k === 2) out.push(ops.pop());
        expOp = false; continue;
      }
      if (tk.k === 5) {
        while (ops.length && ops[ops.length - 1].k !== 3) out.push(ops.pop());
        if (!ops.length) return { err: "," };
        continue;
      }
    }
    while (ops.length) {
      var o = ops.pop();
      if (o.k === 3) return { err: "(" };
      out.push(o);
    }
    return out;
  }

  function evalRPN(rpn) {
    var st = [];
    for (var i = 0; i < rpn.length; i++) {
      var tk = rpn[i];
      if (tk.k === 0) { st.push(tk.v); continue; }
      if (tk.k === 2) {
        var fn = tk.v === "neg" ? { args: 1, f: function (a) { return -a; } } : FNS[tk.v];
        if (!fn || st.length < fn.args) return { err: "arg" };
        var ar = []; for (var a = 0; a < fn.args; a++) ar.unshift(st.pop());
        var r = fn.f.apply(null, ar);
        if (!isFinite(r)) return { err: "Math error" };
        st.push(r); continue;
      }
      if (tk.k === 1) {
        if (st.length < 2) return { err: "operands" };
        var b = st.pop(), aa = st.pop(), v;
        switch (tk.v) {
          case "+": v = aa + b; break; case "-": v = aa - b; break;
          case "*": v = aa * b; break;
          case "/": v = b === 0 ? NaN : aa / b; break;
          case "^": v = Math.pow(aa, b); break;
        }
        if (!isFinite(v)) return { err: "Math error" };
        st.push(v); continue;
      }
      return { err: "rpn" };
    }
    if (st.length !== 1) return { err: "incomplete" };
    return { v: st[0] };
  }

  function calc(expr) {
    var t = tokenize(expr);
    if (t.err) return t;
    var r = shuntingYard(t);
    if (r.err) return r;
    return evalRPN(r);
  }

  function fmt(n) {
    if (!isFinite(n)) return "Math error";
    if (Math.abs(n) >= 1e12 || (n !== 0 && Math.abs(n) < 1e-9)) return n.toExponential(8);
    return String(+n.toPrecision(12));
  }

  var KEYS = [
    ["AC", "fn"], ["(", "op"], [")", "op"], ["×", "op"], ["÷", "op"], ["mc", "fn"],
    ["7", ""], ["8", ""], ["9", ""], ["del", "fn"], ["m+", "fn"], ["mr", "fn"],
    ["4", ""], ["5", ""], ["6", ""], ["−", "op"], ["√", "fn"], ["x²", "fn"],
    ["1", ""], ["2", ""], ["3", ""], ["+", "op"], ["π", ""], ["e", ""],
    ["0", ""], [".", ""], ["+/-", "fn"], ["=", "eq"], ["sin", "fn"], ["cos", "fn"],
    ["tan", "fn"], ["ln", "fn"], ["log", "fn"], ["xʸ", "op"], ["1/x", "fn"], ["m−", "fn"]
  ];

  function GATECalc(hostId) {
    var host = document.getElementById(hostId);
    if (!host) return null;
    var disp = "", mem = 0;
    var root = document.createElement("div");
    root.className = "calc";
    root.innerHTML = '<div class="mem">M: <span id="calc-mem"></span></div>' +
      '<div class="disp" id="calc-disp"></div><div class="keys"></div>';
    host.appendChild(root);
    var keys = root.querySelector(".keys"), dispEl = root.querySelector("#calc-disp"), memEl = root.querySelector("#calc-mem");

    function toOp(d) { return d.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/√\(/g, "sqrt("); }
    function hasTrailingOp(d) { return /[+\-*/^]$/.test(d); }
    function clip() { disp = disp.replace(/[^0-9+\-*/^().,piea-z×÷−]/g, ""); }

    function press(k) {
      if (k === "AC") disp = "";
      else if (k === "del") disp = disp.slice(0, -1);
      else if (k === "=") { var r = calc(toOp(disp)); disp = r.err ? r.err : fmt(r.v); }
      else if (k === "+/-") { disp = disp ? "-(" + disp + ")" : ""; }
      else if (k === "x²") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "(" + disp + ")^2"; }
      else if (k === "1/x") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "1/(" + (disp || "0") + ")"; }
      else if (k === "√") { if (!disp) disp = "sqrt(0)"; else disp = "sqrt(" + disp + ")"; }
      else if (k === "xʸ") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp += "^"; }
      else if (k === "mc") mem = 0;
      else if (k === "mr") disp += String(mem);
      else if (k === "m+") { var r1 = calc(toOp(disp)); if (r1.v !== undefined) mem += r1.v; }
      else if (k === "m−") { var r2 = calc(toOp(disp)); if (r2.v !== undefined) mem -= r2.v; }
      else if (["sin", "cos", "tan", "ln", "log"].indexOf(k) >= 0) disp = k + "(" + disp + ")";
      else if (k === "π") disp += "pi";
      else if (k === "e") disp += "e";
      else disp += k;
      if (k !== "=") clip();
      render();
    }

    function render() {
      dispEl.textContent = disp || "0";
      memEl.textContent = mem === 0 ? "" : "M=" + fmt(mem);
    }

    KEYS.forEach(function (k) {
      var b = document.createElement("button");
      b.textContent = k[0];
      if (k[1]) b.className = k[1];
      b.addEventListener("click", function () { press(k[0]); });
      keys.appendChild(b);
    });
    render();
    return { toggle: function () { root.classList.toggle("open"); }, root: root };
  }

  global.GATECalc = GATECalc;
})(window);