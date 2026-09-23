/* SOCBoard — interactions. Sans dépendance. */
(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hasIO = "IntersectionObserver" in window;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- En-tête ---------- */
  var header = document.querySelector(".site-header");
  function onScrollHeader() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  var menuBtn = document.querySelector(".menu-btn");
  var mobileNav = document.getElementById("mobile-nav");
  if (menuBtn && mobileNav) {
    var setMenu = function (open) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      mobileNav.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    };
    menuBtn.addEventListener("click", function () {
      setMenu(menuBtn.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        menuBtn.focus();
      }
    });
    mobileNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    window.matchMedia("(min-width: 961px)").addEventListener("change", function (m) {
      if (m.matches) setMenu(false);
    });
  }

  /* ---------- Apparitions au scroll ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (hasIO && !reduceMotion.matches) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          revealIO.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { revealIO.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Barre CTA mobile ---------- */
  var ctaBar = document.querySelector(".cta-bar");
  var ctaSentinel = document.querySelector("[data-cta-sentinel]");
  var ctaHide = document.querySelectorAll("[data-cta-hide]");
  if (ctaBar && hasIO) {
    var pastHero = !ctaSentinel;
    var hidersVisible = 0;
    var updateBar = function () {
      var show = pastHero && hidersVisible === 0;
      ctaBar.classList.toggle("is-visible", show);
      ctaBar.setAttribute("aria-hidden", String(!show));
      ctaBar.querySelectorAll("a").forEach(function (a) { a.tabIndex = show ? 0 : -1; });
    };
    if (ctaSentinel) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          pastHero = !en.isIntersecting && en.boundingClientRect.top < 0;
        });
        updateBar();
      }).observe(ctaSentinel);
    }
    var hideIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var was = en.target._vis || false;
        if (en.isIntersecting !== was) {
          hidersVisible += en.isIntersecting ? 1 : -1;
          en.target._vis = en.isIntersecting;
        }
      });
      updateBar();
    });
    ctaHide.forEach(function (el) { hideIO.observe(el); });
    updateBar();
  }

  /* ---------- Signal : ECG → flux de données ---------- */
  function gauss(u, mu, s) { var d = (u - mu) / s; return Math.exp(-0.5 * d * d); }
  function ecg(u) {
    return 0.1 * gauss(u, 0.14, 0.026) -
      0.12 * gauss(u, 0.305, 0.008) +
      1.0 * gauss(u, 0.33, 0.0095) -
      0.3 * gauss(u, 0.357, 0.011) +
      0.22 * gauss(u, 0.57, 0.042);
  }
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  var canvas = document.querySelector("[data-signal]");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1, running = false, visible = true, t0 = performance.now();
    var styles = getComputedStyle(doc);
    var signal = (styles.getPropertyValue("--signal") || "#7cc8ff").trim();

    var resize = function () {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    var draw = function (now) {
      var t = (now - t0) / 1000;
      var mid = H * 0.56;
      var amp = H * 0.42;
      var period = clamp(W * 0.24, 150, 300);
      var speed = period * 0.62; // ~ 1 battement / 1,6 s
      var offset = t * speed;
      var narrow = W < 640;
      var start = narrow ? 0.38 : 0.42;
      var end = narrow ? 0.7 : 0.76;

      ctx.clearRect(0, 0, W, H);

      // Ligne de base, très discrète
      ctx.strokeStyle = "rgba(156,182,220,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(W, mid + 0.5);
      ctx.stroke();

      // Tracé ECG (partie gauche), s'estompe en devenant données
      var drawLine = function (width, alpha) {
        ctx.beginPath();
        var first = true;
        var xEnd = W * (end + 0.02);
        for (var x = 0; x <= xEnd; x += 1.5) {
          var k = smoothstep(W * start, W * end, x);
          var u = (((x - offset) % period) + period) % period / period;
          var y = mid - ecg(u) * amp * (1 - k * 0.9);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        var grad = ctx.createLinearGradient(0, 0, xEnd, 0);
        grad.addColorStop(0, "rgba(124,200,255,0)");
        grad.addColorStop(0.08, "rgba(124,200,255," + alpha + ")");
        grad.addColorStop(start / (end + 0.02), "rgba(124,200,255," + alpha + ")");
        grad.addColorStop(1, "rgba(124,200,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      };
      drawLine(6, 0.12);
      drawLine(1.75, 0.95);

      // Flux de données (partie droite) : barres quantifiées + points
      var step = narrow ? 6 : 7;
      var firstIdx = Math.floor((W * start - offset) / step);
      var lastIdx = Math.ceil((W - offset) / step);
      for (var i = firstIdx; i <= lastIdx; i++) {
        var bx = i * step + offset;
        if (bx < W * start || bx > W) continue;
        var kk = smoothstep(W * start, W * end, bx);
        if (kk <= 0.01) continue;
        var uu = (((bx - offset) % period) + period) % period / period;
        var v = Math.abs(ecg(uu));
        var noise = hash(i) * 0.32;
        var q = Math.round(Math.max(v, noise) * 8) / 8;
        var h = Math.max(2, amp * (0.06 + 0.8 * q) * kk);
        var fadeR = 1 - smoothstep(W * 0.9, W, bx);
        var a = (0.18 + 0.72 * q) * kk * fadeR;
        ctx.fillStyle = "rgba(124,200,255," + a.toFixed(3) + ")";
        ctx.fillRect(bx - 1, mid - h, 2, h * 1.35);
        // point « paquet » au-dessus des barres significatives
        if (q >= 0.5 && kk > 0.6) {
          ctx.fillStyle = signal;
          ctx.globalAlpha = fadeR * kk;
          ctx.fillRect(bx - 1.5, mid - h - 8, 3, 3);
          ctx.globalAlpha = 1;
        }
      }
    };

    var loop = function (now) {
      if (!running) return;
      draw(now);
      requestAnimationFrame(loop);
    };
    var start = function () {
      if (running || reduceMotion.matches || !visible || document.hidden) return;
      running = true;
      requestAnimationFrame(loop);
    };
    var stop = function () { running = false; };

    resize();
    draw(t0 + 1200); // image fixe immédiate (et définitive si mouvement réduit)
    window.addEventListener("resize", function () { resize(); if (!running) draw(performance.now()); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(canvas);
    }
    reduceMotion.addEventListener("change", function () { if (reduceMotion.matches) stop(); else start(); });
    start();
  }

  /* ---------- Fond liquide (WebGL) ---------- */
  var fluid = document.querySelector("[data-fluid]");
  if (fluid) {
    var gl = null;
    try { gl = fluid.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }); } catch (e) {}
    if (gl) {
      var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
      var FS = [
        "precision mediump float;",
        "uniform vec2 r;uniform float t;",
        "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
        "float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
        "return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}",
        "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
        "void main(){",
        " vec2 uv=gl_FragCoord.xy/r.y*1.35; float s=t*.035;",
        " vec2 q=vec2(fbm(uv+s),fbm(uv+vec2(5.2,1.3)-s));",
        " vec2 w=vec2(fbm(uv+3.6*q+vec2(1.7,9.2)+s*1.4),fbm(uv+3.6*q+vec2(8.3,2.8)-s));",
        " float f=fbm(uv+3.2*w);",
        " float rid=1.-abs(sin(f*16.+s*2.));",
        " float spec=pow(rid,7.)*smoothstep(.3,.85,f);",
        " float soft=pow(rid,2.)*.35;",
        " vec3 base=vec3(.016,.024,.037);",
        " vec3 col=base+vec3(.22,.32,.43)*spec+vec3(.05,.075,.11)*soft*f;",
        " float y=gl_FragCoord.y/r.y;",
        " col*=mix(.25,1.,smoothstep(0.,.55,y));",
        " gl_FragColor=vec4(col,1.);}"
      ].join("\n");
      var mk = function (type, src) {
        var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
        return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
      };
      var vs = mk(gl.VERTEX_SHADER, VS), fs = mk(gl.FRAGMENT_SHADER, FS);
      var prog = vs && fs ? gl.createProgram() : null;
      if (prog) {
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        var uR = gl.getUniformLocation(prog, "r"), uT = gl.getUniformLocation(prog, "t");
        var fRun = false, fVis = true, fT0 = performance.now() - 20000;
        var fSize = function () {
          // demi-résolution : le flou naturel du shader le permet, et le GPU mobile respire
          var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
          var w = Math.max(1, Math.round(fluid.clientWidth * scale));
          var hgt = Math.max(1, Math.round(fluid.clientHeight * scale));
          if (fluid.width !== w || fluid.height !== hgt) { fluid.width = w; fluid.height = hgt; gl.viewport(0, 0, w, hgt); }
          gl.uniform2f(uR, w, hgt);
        };
        var fDraw = function (now) {
          gl.uniform1f(uT, (now - fT0) / 1000);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        var fLoop = function (now) { if (!fRun) return; fDraw(now); requestAnimationFrame(fLoop); };
        var fStart = function () {
          if (fRun || reduceMotion.matches || !fVis || document.hidden) return;
          fRun = true; requestAnimationFrame(fLoop);
        };
        fSize(); fDraw(performance.now());
        window.addEventListener("resize", function () { fSize(); if (!fRun) fDraw(performance.now()); });
        document.addEventListener("visibilitychange", function () { if (document.hidden) fRun = false; else fStart(); });
        if (hasIO) new IntersectionObserver(function (en) { fVis = en[0].isIntersecting; if (fVis) fStart(); else fRun = false; }).observe(fluid);
        fStart();
      }
    }
  }

  /* ---------- Manifeste : les mots s'allument au scroll ---------- */
  var manifesto = document.querySelector("[data-manifesto]");
  if (manifesto) {
    var mText = manifesto.querySelector("[data-words]");
    var words = Array.prototype.slice.call(mText.querySelectorAll(".w"));
    var keys = manifesto.querySelectorAll("[data-key]");
    var mTick = false;
    var mUpdate = function () {
      mTick = false;
      var vh = window.innerHeight;
      var r = mText.getBoundingClientRect();
      var p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.25), 0, 1);
      var lit = Math.round(p * words.length);
      var active = -1;
      words.forEach(function (w, i) {
        var on = i < lit;
        w.classList.toggle("is-lit", on);
        if (on && w.dataset.k) active = +w.dataset.k;
      });
      keys.forEach(function (k) { k.classList.toggle("is-on", +k.dataset.key === active); });
    };
    if (reduceMotion.matches) {
      words.forEach(function (w) { w.classList.add("is-lit"); });
    } else {
      var mReq = function () { if (!mTick) { mTick = true; requestAnimationFrame(mUpdate); } };
      window.addEventListener("scroll", mReq, { passive: true });
      window.addEventListener("resize", mReq);
      mUpdate();
    }
  }

  /* ---------- Accordéon des offres ---------- */
  document.querySelectorAll("[data-acc]").forEach(function (acc) {
    var btns = acc.querySelectorAll(".acc-btn");
    var mqWide = window.matchMedia("(min-width: 861px)");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        // en large, un panneau reste toujours ouvert (colonne de droite)
        if (open && mqWide.matches) return;
        btns.forEach(function (b) {
          var on = b === btn && !open;
          b.setAttribute("aria-expanded", String(on));
          var panel = document.getElementById(b.getAttribute("aria-controls"));
          panel.hidden = !on;
          if (on) { panel.classList.remove("is-anim"); void panel.offsetWidth; panel.classList.add("is-anim"); }
        });
      });
    });
  });

  /* ---------- Poussière de particules + halo qui suit le curseur (v4) ---------- */
  var dust = document.querySelector("[data-dust]");
  if (dust && dust.getContext) {
    var dctx = dust.getContext("2d");
    var DW = 0, DH = 0, ddpr = 1, parts = [], dRun = false, dVis = true;
    var mote = { x: 0, y: 0, tx: 0, ty: 0, hasPointer: false };
    var rnd = Math.random;
    var gaussR = function () { return (rnd() + rnd() + rnd() - 1.5) / 1.5; };

    var seed = function () {
      parts = [];
      var area = DW * DH;
      var n = Math.round(clamp(area / (DW < 700 ? 1800 : 900), 300, 2000));
      for (var i = 0; i < n; i++) {
        var kind = rnd();
        var x, y, a;
        if (kind < 0.35) {            // poussière ambiante
          x = rnd() * DW; y = rnd() * DH; a = 0.05 + rnd() * 0.25;
        } else if (kind < 0.8) {      // dune dense en bas à droite
          x = DW * (0.3 + 0.7 * Math.pow(rnd(), 0.55));
          y = DH * (0.55 + 0.45 * Math.pow(rnd(), 0.5));
          a = 0.25 + rnd() * 0.6;
        } else {                      // faisceau diagonal sous le halo
          var t = rnd();
          x = DW * (0.56 - 0.08 * t) + gaussR() * (20 + 60 * t);
          y = DH * (0.62 + 0.38 * t) + gaussR() * 10;
          a = 0.1 + rnd() * 0.4;
        }
        parts.push({ x: x, y: y, s: rnd() < 0.85 ? 1 : 1.8, a: a, f: 0.5 + rnd() * 2, p: rnd() * 6.28,
          vx: (rnd() - 0.5) * 0.06, vy: -0.01 - rnd() * 0.04 });
      }
    };
    var dResize = function () {
      var r = dust.getBoundingClientRect();
      ddpr = Math.min(window.devicePixelRatio || 1, 1.5);
      DW = Math.max(1, Math.round(r.width)); DH = Math.max(1, Math.round(r.height));
      dust.width = DW * ddpr; dust.height = DH * ddpr;
      dctx.setTransform(ddpr, 0, 0, ddpr, 0, 0);
      if (!mote.x) { mote.x = mote.tx = DW * 0.54; mote.y = mote.ty = DH * 0.55; }
      seed();
    };
    var dDraw = function (now) {
      var t = now / 1000;
      if (!mote.hasPointer) {
        mote.tx = DW * (0.54 + 0.05 * Math.sin(t * 0.21));
        mote.ty = DH * (0.55 + 0.04 * Math.sin(t * 0.33 + 1));
      }
      mote.x += (mote.tx - mote.x) * 0.06;
      mote.y += (mote.ty - mote.y) * 0.06;
      dctx.clearRect(0, 0, DW, DH);
      dctx.fillStyle = "#fff";
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        q.x += q.vx; q.y += q.vy;
        if (q.y < -4) q.y = DH + 4;
        if (q.x < -4) q.x = DW + 4; else if (q.x > DW + 4) q.x = -4;
        var dx = q.x - mote.x, dy = q.y - mote.y, d2 = dx * dx + dy * dy, px = q.x, py = q.y;
        if (d2 < 12000) { var k = (1 - d2 / 12000) * 18 / Math.sqrt(d2 + 1); px += dx * k; py += dy * k; }
        dctx.globalAlpha = q.a * (0.65 + 0.35 * Math.sin(t * q.f + q.p));
        dctx.fillRect(px, py, q.s, q.s);
      }
      // halo pixelisé (tramé) autour du « mote »
      var R = clamp(DW * 0.055, 40, 90);
      for (var j = 0; j < 260; j++) {
        var gx = gaussR() * R * 1.6, gy = gaussR() * R * 0.75;
        var dd = (gx * gx) / (R * R * 2.56) + (gy * gy) / (R * R * 0.5625);
        if (dd > 1) continue;
        dctx.globalAlpha = (1 - dd) * (0.55 + 0.45 * rnd());
        var sz = rnd() < 0.3 ? 4 : 3;
        dctx.fillRect(Math.round((mote.x + gx) / 3) * 3, Math.round((mote.y + gy) / 3) * 3, sz, sz);
      }
      dctx.globalAlpha = 1;
    };
    var dLoop = function (now) { if (!dRun) return; dDraw(now); requestAnimationFrame(dLoop); };
    var dStart = function () {
      if (dRun || reduceMotion.matches || !dVis || document.hidden) return;
      dRun = true; requestAnimationFrame(dLoop);
    };
    dResize(); dDraw(performance.now());
    window.addEventListener("resize", function () { dResize(); if (!dRun) dDraw(performance.now()); });
    var host = dust.parentElement;
    host.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = dust.getBoundingClientRect();
      mote.hasPointer = true; mote.tx = e.clientX - r.left; mote.ty = e.clientY - r.top;
    });
    host.addEventListener("pointerleave", function () { mote.hasPointer = false; });
    document.addEventListener("visibilitychange", function () { if (document.hidden) dRun = false; else dStart(); });
    if (hasIO) new IntersectionObserver(function (en) { dVis = en[0].isIntersecting; if (dVis) dStart(); else dRun = false; }).observe(dust);
    dStart();
  }

  /* ---------- Instrument : onglets + inclinaison des cartes (v4) ---------- */
  var instrument = document.querySelector("[data-instrument]");
  if (instrument) {
    var tabs = Array.prototype.slice.call(instrument.querySelectorAll('[role="tab"]'));
    var tablist = instrument.querySelector('[role="tablist"]');
    var views = instrument.querySelectorAll("[data-view]");
    var select = function (idx, focus) {
      tabs.forEach(function (tb, i) {
        var on = i === idx;
        tb.setAttribute("aria-selected", String(on));
        tb.tabIndex = on ? 0 : -1;
        document.getElementById(tb.getAttribute("aria-controls")).hidden = !on;
      });
      views.forEach(function (v) { v.hidden = +v.dataset.view !== idx; });
      tablist.style.setProperty("--tab", idx);
      if (focus) tabs[idx].focus();
    };
    tabs.forEach(function (tb, i) {
      tb.addEventListener("click", function () { select(i); });
      tb.addEventListener("keydown", function (e) {
        var n = tabs.length, to = null;
        if (e.key === "ArrowRight") to = (i + 1) % n;
        else if (e.key === "ArrowLeft") to = (i - 1 + n) % n;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = n - 1;
        if (to !== null) { e.preventDefault(); select(to, true); }
      });
    });
    var deck = instrument.querySelector("[data-deck]");
    if (deck && !reduceMotion.matches) {
      instrument.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = deck.getBoundingClientRect();
        var nx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
        var ny = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
        deck.style.setProperty("--ry", (nx * 12).toFixed(2) + "deg");
        deck.style.setProperty("--rx", (-ny * 10).toFixed(2) + "deg");
      });
      instrument.addEventListener("pointerleave", function () {
        deck.style.setProperty("--ry", "0deg"); deck.style.setProperty("--rx", "0deg");
      });
    }
  }

  /* ---------- Scan de l'empreinte numérique ---------- */
  var scan = document.querySelector("[data-scan]");
  if (scan) {
    var track = scan.querySelector(".scan__track");
    var field = scan.querySelector(".scan__field");
    var nodes = Array.prototype.slice.call(scan.querySelectorAll(".node"));
    var countEl = scan.querySelector("[data-scan-count]");
    var foundEl = scan.querySelector("[data-scan-found]");
    var total = nodes.length;
    var ticking = false;

    var setAll = function () {
      nodes.forEach(function (n) { n.classList.add("is-scanned"); });
      if (countEl) countEl.textContent = total + "/" + total;
      if (foundEl) foundEl.textContent = String(scan.querySelectorAll(".node.is-weak").length);
    };

    var update = function () {
      ticking = false;
      var vh = window.innerHeight;
      var fr = field.getBoundingClientRect();
      var sticky = window.matchMedia("(min-width: 901px)").matches;
      var p;
      if (sticky) {
        var tr = track.getBoundingClientRect();
        p = clamp(-tr.top / Math.max(1, tr.height - vh), 0, 1);
        p = clamp((p - 0.06) / 0.78, 0, 1);
      } else {
        p = clamp((vh * 0.8 - fr.top) / (fr.height + vh * 0.3), 0, 1);
      }
      field.style.setProperty("--scan", p.toFixed(4));
      field.style.setProperty("--field-h", fr.height + "px");
      var lineY = p * fr.height;
      var scanned = 0, found = 0;
      nodes.forEach(function (n) {
        var y = n.offsetTop + n.offsetHeight * 0.5;
        var on = lineY >= y;
        n.classList.toggle("is-scanned", on);
        if (on) {
          scanned++;
          if (n.classList.contains("is-weak")) found++;
        }
      });
      if (countEl) countEl.textContent = scanned + "/" + total;
      if (foundEl) foundEl.textContent = String(found);
    };

    if (reduceMotion.matches) {
      setAll();
    } else {
      var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      window.addEventListener("scroll", req, { passive: true });
      window.addEventListener("resize", req);
      update();
    }
  }

  /* ---------- Rapport SOCBoard ---------- */
  function countUp(el, to, duration, decimals) {
    var from = 0, t0 = null;
    decimals = decimals || 0;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = clamp((ts - t0) / duration, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = (from + (to - from) * e).toFixed(decimals).replace(".", ",");
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  document.querySelectorAll(".report").forEach(function (report) {
    var gauge = report.querySelector(".gauge__value");
    var counters = report.querySelectorAll("[data-count]");
    var goLive = function () {
      report.classList.add("is-live");
      if (gauge) gauge.style.strokeDashoffset = gauge.getAttribute("data-offset");
      counters.forEach(function (el, i) {
        setTimeout(function () {
          countUp(el, parseFloat(el.getAttribute("data-count")), 1400);
        }, 200 + i * 90);
      });
    };
    if (!hasIO || reduceMotion.matches) {
      report.classList.add("is-live");
      return;
    }
    // état initial avant animation
    if (gauge) gauge.style.strokeDashoffset = gauge.getAttribute("data-length");
    counters.forEach(function (el) { el.textContent = "0"; });
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { goLive(); io.disconnect(); }
    }, { threshold: 0, rootMargin: "0px 0px -30% 0px" });
    io.observe(report);
  });

  /* ---------- Tarifs : mensuel / annuel ---------- */
  var billing = document.querySelector("[data-billing]");
  if (billing) {
    var btns = billing.querySelectorAll("button");
    var thumb = billing.querySelector(".billing__thumb");
    var placeThumb = function () {
      var active = billing.querySelector('button[aria-pressed="true"]');
      if (!active || !thumb) return;
      thumb.style.width = active.offsetWidth + "px";
      thumb.style.transform = "translateX(" + active.offsetLeft + "px)";
    };
    var apply = function (mode, animate) {
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
      placeThumb();
      document.querySelectorAll("[data-price]").forEach(function (el) {
        var to = parseFloat(el.getAttribute("data-" + mode));
        var from = parseFloat(el.textContent.replace(/\s/g, "")) || to;
        if (!animate || reduceMotion.matches || from === to) { el.textContent = String(to); return; }
        var t0 = null;
        var frame = function (ts) {
          if (t0 === null) t0 = ts;
          var k = clamp((ts - t0) / 500, 0, 1);
          var e = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(from + (to - from) * e));
          if (k < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      document.querySelectorAll("[data-note-monthly]").forEach(function (el) {
        el.innerHTML = el.getAttribute("data-note-" + mode);
      });
      var live = document.querySelector("[data-billing-live]");
      if (live) live.textContent = mode === "annual" ? "Tarifs affichés : engagement annuel." : "Tarifs affichés : sans engagement, au mois.";
    };
    btns.forEach(function (b) {
      b.addEventListener("click", function () { apply(b.dataset.mode, true); });
    });
    window.addEventListener("resize", placeThumb);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);
    apply("monthly", false);
  }

  /* ---------- Formulaire de contact ---------- */
  var form = document.querySelector("[data-contact-form]");
  if (form) {
    var status = form.querySelector(".form__status");
    var showError = function (input, msg) {
      var err = document.getElementById(input.id + "-error");
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (err) { err.textContent = msg || ""; err.hidden = !msg; }
    };
    var check = function (input) {
      if (input.validity.valueMissing) return "Ce champ est nécessaire pour vous recontacter.";
      if (input.validity.typeMismatch) return "Vérifiez l’adresse e-mail (exemple : nom@cabinet.fr).";
      return "";
    };
    form.querySelectorAll("input[required], select[required]").forEach(function (input) {
      input.addEventListener("blur", function () { if (input.value) showError(input, check(input)); });
      input.addEventListener("input", function () { if (input.getAttribute("aria-invalid") === "true") showError(input, check(input)); });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;
      form.querySelectorAll("input[required], select[required]").forEach(function (input) {
        var msg = check(input);
        showError(input, msg);
        if (msg && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      var data = new FormData(form);
      var endpoint = form.getAttribute("data-endpoint");
      var submitBtn = form.querySelector('button[type="submit"]');
      var say = function (html) { status.innerHTML = html; status.hidden = false; status.focus(); };

      if (endpoint) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours…";
        fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            form.reset();
            say("<b>Demande reçue.</b> Notre équipe vous répond sous un jour ouvré pour fixer un créneau.");
          })
          .catch(function () {
            say("L’envoi n’a pas abouti. Écrivez-nous directement à <b>contact@socboard.fr</b>, ou réessayez dans un instant.");
          })
          .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = "Envoyer ma demande";
          });
        return;
      }

      // Pas de service d'envoi configuré : on prépare un e-mail.
      var lines = [];
      data.forEach(function (v, k) { if (v) lines.push(k + " : " + v); });
      var href = "mailto:contact@socboard.fr?subject=" +
        encodeURIComponent("Demande de Diagnostic — " + (data.get("Cabinet") || "")) +
        "&body=" + encodeURIComponent(lines.join("\n"));
      say("Votre messagerie va s’ouvrir avec la demande pré-remplie. Si rien ne s’ouvre, écrivez à <b>contact@socboard.fr</b>.");
      window.location.href = href;
    });
  }

  /* ---------- Copier l'adresse ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () {
        var prev = btn.textContent;
        btn.textContent = "Copié";
        setTimeout(function () { btn.textContent = prev; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          var code = btn.parentNode.querySelector("code");
          if (code) window.getSelection().selectAllChildren(code);
        });
      }
    });
  });

  /* ---------- Année ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
