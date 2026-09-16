/* ============================================================
   GATE-CBT · Virtual Calculator (GATE-approved function set)
   Trig: sin cos tan sin⁻¹ cos⁻¹ tan⁻¹ | Hyper: sinh cosh tanh
   Pow/root: x² x³ xʸ ³√x y√x √x 1/x | Misc: n! |x| % π e EXP log₂ ln log
   Memory: MC MR M+ M− | Deg/Rad | AC CE del ± — shunting-yard, no eval().
   ============================================================ */
(function (global) {
  "use strict";

  var degMode = true;                          /* default DEGREES — matches official TCS iON GATE calculator */
  function toRad(x) { return x * Math.PI / 180; }
  function fromRad(x) { return x * 180 / Math.PI; }
  function fact(n) { if (n < 0 || n > 170 || n !== Math.floor(n)) return NaN; var r = 1, i; for (i = 2; i <= n; i++) r *= i; return r; }
  var FNS = {
    sin: { args: 1, f: function (x) { return Math.sin(degMode ? toRad(x) : x); } },
    cos: { args: 1, f: function (x) { return Math.cos(degMode ? toRad(x) : x); } },
    tan: { args: 1, f: function (x) { return Math.tan(degMode ? toRad(x) : x); } },
    asin: { args: 1, f: function (x) { var r = Math.asin(x); return degMode ? fromRad(r) : r; } },
    acos: { args: 1, f: function (x) { var r = Math.acos(x); return degMode ? fromRad(r) : r; } },
    atan: { args: 1, f: function (x) { var r = Math.atan(x); return degMode ? fromRad(r) : r; } },
    sinh: { args: 1, f: Math.sinh }, cosh: { args: 1, f: Math.cosh }, tanh: { args: 1, f: Math.tanh },
    ln: { args: 1, f: Math.log }, log: { args: 1, f: Math.log10 },
    logtwo: { args: 1, f: function (x) { return Math.log2(x); } },
    exp: { args: 1, f: Math.exp },
    tenx: { args: 1, f: function (x) { return Math.pow(10, x); } },
    sqrt: { args: 1, f: Math.sqrt }, abs: { args: 1, f: Math.abs },
    fact: { args: 1, f: fact }
  };
  var PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
  var NEG_PREC = 5;   /* unary minus binds tighter than any binary op — sign-toggle semantics */
  var ASSOC_R = { "^": true };

  function tokenize(s) {
    var t = [], i = 0, n = s.length;
    while (i < n) {
      var c = s[i];
      if (c === " ") { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < n && /[0-9.]/.test(s[j])) j++;
        if (j < n && (s[j] === "e" || s[j] === "E")) {
          var jj = j + 1;
          if (s[jj] === "+" || s[jj] === "-") jj++;
          if (jj < n && /[0-9]/.test(s[jj])) {
            while (jj < n && /[0-9]/.test(s[jj])) jj++;
            t.push({ k: 0, v: parseFloat(s.slice(i, jj)) }); i = jj; continue;
          }
        }
        t.push({ k: 0, v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (c === "p" && s.slice(i, i + 2) === "pi") { t.push({ k: 0, v: Math.PI }); i += 2; continue; }
      if (c === "e" && !/[0-9.a-z]/.test(s[i + 1] || "")) { t.push({ k: 0, v: Math.E }); i += 1; continue; }
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
        if (expOp && tk.v === "-") { ops.push({ k: 2, v: "neg" }); continue; }
        if (expOp && tk.v === "+") { continue; }
        while (ops.length) {
          var o = ops[ops.length - 1];
          if (o.k === 1 && (PREC[o.v] > PREC[tk.v] || (PREC[o.v] === PREC[tk.v] && !ASSOC_R[tk.v]))) out.push(ops.pop());
          else if (o.k === 2 && o.v === "neg" && NEG_PREC > PREC[tk.v]) out.push(ops.pop());
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
    ["tan", "fn"], ["ln", "fn"], ["log", "fn"], ["xʸ", "op"], ["1/x", "fn"], ["m−", "fn"],
    ["x³", "fn"], ["³√x", "fn"], ["y√x", "op"], ["n!", "fn"], ["|x|", "fn"], ["%", "fn"],
    ["sin⁻¹", "fn"], ["cos⁻¹", "fn"], ["tan⁻¹", "fn"], ["eˣ", "fn"], ["10ˣ", "fn"], ["log₂", "fn"],
    ["Deg/Rad", "fn"], ["sinh", "fn"], ["cosh", "fn"], ["tanh", "fn"], ["EXP", "fn"], ["CE", "fn"]
  ];

  function GATECalc(hostId) {
    var host = document.getElementById(hostId);
    if (!host) return null;
    var disp = "", mem = 0;
    var root = document.createElement("div");
    root.className = "calc";
    root.innerHTML = '<div class="mem"><span id="calc-mode">DEG</span><span>M: <span id="calc-mem"></span></span></div>' +
      '<div class="disp" id="calc-disp"></div><div class="keys"></div>';
    host.appendChild(root);
    var keys = root.querySelector(".keys"), dispEl = root.querySelector("#calc-disp"), memEl = root.querySelector("#calc-mem"), modeEl = root.querySelector("#calc-mode");

    function toOp(d) { return d.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/√\(/g, "sqrt("); }
    function hasTrailingOp(d) { return /[+\-*/^×÷−]$/.test(d); }
    function clip() { disp = disp.replace(/[^0-9+\-*/^().,piea-zE×÷−]/g, ""); }

    /* Post-fix semantics (official TCS iON GATE calculator): unary functions apply
       to the LAST number/atom entered — "5+3" then sin → "5+sin(3)", and a leading
       negative operand is wrapped whole ("−5" then |x| → "abs(−5)"). */
    function wrapLast(fn) {
      var m;
      if (/^[−-][0-9.]+(?:[eE][−+-]?[0-9]+)?$/.test(disp)) { disp = fn + "(" + disp + ")"; return; }
      m = disp.match(/^(.*?)([0-9.]+(?:[eE][−+-]?[0-9]+)?|[a-z]+\([^()]*\)|\([^()]*\)|pi|e)$/);
      if (m) { disp = m[1] + fn + "(" + m[2] + ")"; return; }
      disp = fn + "(" + disp;               /* no atom yet: open the call, let "=" balance it */
    }

    var UN = { sin: "sin", cos: "cos", tan: "tan", ln: "ln", log: "log",
               sinh: "sinh", cosh: "cosh", tanh: "tanh",
               "sin⁻¹": "asin", "cos⁻¹": "acos", "tan⁻¹": "atan",
               "eˣ": "exp", "10ˣ": "tenx", "log₂": "logtwo",
               "n!": "fact", "|x|": "abs" };

    function press(k) {
      if (k === "AC") disp = "";
      else if (k === "CE") disp = disp.replace(/[0-9.]+(?:[eE][−+-]?[0-9]+)?$/, "").replace(/[+\-*/^×÷−]+$/, "");
      else if (k === "del") disp = disp.slice(0, -1);
      else if (k === "=") {
        var eq = toOp(disp);
        var oc = (eq.match(/\(/g) || []).length, cc = (eq.match(/\)/g) || []).length;
        if (cc < oc) eq += ")".repeat(oc - cc);
        var r = calc(eq); disp = r.err ? r.err : fmt(r.v);
      }
      else if (k === "Deg/Rad") { degMode = !degMode; }
      else if (k === "+/-") {
        /* Negate the LAST entry, post-fix style (like the official TCS iON GATE calculator),
           not the whole expression. */
        if (/^[−-]?[0-9.]+(?:[eE][−+-]?[0-9]+)?$/.test(disp)) {
          disp = /^[−-]/.test(disp) ? disp.slice(1) : "-" + disp;
        } else {
          var lm = disp.match(/^(.*?)([0-9.]+(?:[eE][−+-]?[0-9]+)?)$/);
          if (lm && /[+−-]$/.test(lm[1])) {
            disp = lm[1].replace(/[+−-]$/, function (o) { return o === "+" ? "−" : "+"; }) + lm[2];
          } else if (/[+−-]$/.test(disp)) {
            /* pending binary operator: flip it ("5+" -> "5−") instead of wrapping the tail */
            disp = disp.slice(0, -1) + (disp.slice(-1) === "+" ? "−" : "+");
          } else {
            disp = disp ? "-(" + disp + ")" : "";
          }
        }
      }
      else if (k === "x²") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "(" + (disp || "0") + ")^2"; }
      else if (k === "x³") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "(" + (disp || "0") + ")^3"; }
      else if (k === "1/x") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "1/(" + (disp || "0") + ")"; }
      else if (k === "³√x") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "(" + (disp || "0") + ")^(1/3"; }
      else if (k === "y√x") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp = "(" + (disp || "0") + ")^(1/"; }
      else if (k === "√") wrapLast("sqrt");
      else if (k === "%") { var pm = disp.match(/^(.*?)([0-9.]+(?:[eE][−+-]?[0-9]+)?)$/); if (pm) disp = pm[1] + "(" + pm[2] + "/100)"; }
      else if (k === "EXP") { if (/[0-9.]$/.test(disp)) disp += "E"; }
      else if (k === "xʸ") { if (hasTrailingOp(disp)) disp = disp.slice(0, -1); disp += "^"; }
      else if (k === "mc") mem = 0;
      else if (k === "mr") disp += String(mem);
      else if (k === "m+") { var r1 = calc(toOp(disp)); if (r1.v !== undefined) mem += r1.v; }
      else if (k === "m−") { var r2 = calc(toOp(disp)); if (r2.v !== undefined) mem -= r2.v; }
      else if (UN[k]) wrapLast(UN[k]);
      else if (k === "π") disp += "pi";
      else if (k === "e") disp += "e";
      else disp += k;
      if (k !== "=") clip();
      render();
    }

    function render() {
      dispEl.textContent = disp || "0";
      modeEl.textContent = degMode ? "DEG" : "RAD";
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