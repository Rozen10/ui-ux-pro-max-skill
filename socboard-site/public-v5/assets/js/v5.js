/* SOCBoard v5 : sable, défilements pilotés, courbe, cartes empilées.
   Chargé après site.js. Sans dépendance. Tout s'arrête avec
   prefers-reduced-motion (rendu statique, contenu identique). */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* Progression d'une section au scroll : 0 quand son haut touche le haut de
     l'écran, 1 quand son bas touche le bas. */
  function stickyProgress(el) {
    var r = el.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : (r.top < 0 ? 1 : 0);
  }

  /* Une seule boucle de scroll, cadencée par rAF */
  var scrollJobs = [];
  var ticking = false;
  function runScroll() {
    ticking = false;
    for (var i = 0; i < scrollJobs.length; i++) scrollJobs[i]();
  }
  function requestScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(runScroll); }
  }
  window.addEventListener("scroll", requestScroll, { passive: true });
  window.addEventListener("resize", requestScroll);

  /* ---------- Entrée du hero ---------- */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { doc.classList.add("is-loaded"); });
  });

  /* ======================================================================
     Sable : un mot dessiné par des grains qui s'assemblent
     ====================================================================== */
  function Sand(host) {
    var canvas = host.querySelector("[data-sand]");
    var word = host.querySelector("[data-sand-word]");
    if (!canvas || !word || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var isHero = host.classList.contains("v5-hero");
    var small = window.matchMedia("(max-width: 700px)").matches;

    var W = 0, H = 0, dpr = 1;
    var N = 0, A = 0;                  // grains du mot, grains d'ambiance
    var px, py, vx, vy, tx, ty, k, sz, ph, dl, sh, jx, jy;
    var order = [];                    // indices triés par teinte
    var LEVELS = [0.38, 0.6, 0.8, 1];
    var RGB = "236, 224, 202";
    var mouse = { x: -9999, y: -9999, vx: 0, vy: 0, on: false };
    var running = false, visible = false, started = 0, built = false;
    var disperse = 0;

    function rnd(a, b) { return a + Math.random() * (b - a); }

    /* Position du mot sans la translation d'entrée du hero */
    function wordBox() {
      var r = word.getBoundingClientRect();
      var h = host.getBoundingClientRect();
      var inner = word.closest(".v5-line > span");
      var dy = 0;
      if (inner) {
        var ir = inner.getBoundingClientRect();
        var lr = inner.parentElement.getBoundingClientRect();
        dy = lr.top - ir.top;
      }
      return { x: r.left - h.left, y: r.top - h.top + dy, w: r.width, h: r.height };
    }

    /* Rend le mot hors écran et tire des cibles dans ses pixels pleins */
    function sampleTargets(box) {
      var cs = getComputedStyle(word);
      var text = word.textContent.replace(/ /g, " ");
      var pad = Math.ceil(parseFloat(cs.fontSize) * 0.3);
      var ow = Math.ceil(box.w + pad * 2), oh = Math.ceil(box.h + pad * 2);
      var off = document.createElement("canvas");
      off.width = ow; off.height = oh;
      var o = off.getContext("2d", { willReadFrequently: true });
      o.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      if ("letterSpacing" in o) o.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      o.textBaseline = "alphabetic";
      var m = o.measureText(text);
      var ascent = m.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.9;
      var descent = m.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.22;
      /* la boîte inline = ascent + descent ; on centre verticalement dessus */
      var base = pad + (box.h - (ascent + descent)) / 2 + ascent;
      o.fillStyle = "#fff";
      o.fillText(text, pad, base);
      var data = o.getImageData(0, 0, ow, oh).data;

      var filled = 0;
      for (var i = 3; i < data.length; i += 4) if (data[i] > 128) filled++;
      var want = small ? 2600 : 5200;
      var step = Math.max(1.05, Math.sqrt(filled / want));
      var pts = [];
      for (var y = 0; y < oh; y += step) {
        for (var x = 0; x < ow; x += step) {
          var sx = Math.min(ow - 1, Math.round(x + rnd(-0.5, 0.5) * step));
          var sy = Math.min(oh - 1, Math.round(y + rnd(-0.5, 0.5) * step));
          if (data[(sy * ow + sx) * 4 + 3] > 110) pts.push(box.x - pad + sx, box.y - pad + sy);
        }
      }
      return pts;
    }

    function build(intro) {
      var r = host.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);

      var box = wordBox();
      var pts = sampleTargets(box);
      N = pts.length / 2;
      A = Math.round(clamp(W * H / (small ? 2600 : 1700), 180, small ? 420 : 1100));
      var T = N + A;
      px = new Float32Array(T); py = new Float32Array(T);
      vx = new Float32Array(T); vy = new Float32Array(T);
      tx = new Float32Array(T); ty = new Float32Array(T);
      k = new Float32Array(T); sz = new Uint8Array(T); ph = new Float32Array(T);
      dl = new Float32Array(T); sh = new Uint8Array(T);
      jx = new Float32Array(T); jy = new Float32Array(T);

      for (var i = 0; i < T; i++) {
        var inWord = i < N;
        if (inWord) {
          tx[i] = pts[i * 2]; ty[i] = pts[i * 2 + 1];
          /* grains plus gros et plus clairs au coeur, poussière sur les bords */
          var roll = Math.random();
          sz[i] = roll < 0.62 ? 1 : roll < 0.93 ? 2 : 3;
          sh[i] = roll < 0.25 ? 1 : roll < 0.7 ? 2 : 3;
          k[i] = rnd(0.018, 0.042);
          /* l'assemblage balaie de gauche à droite */
          dl[i] = (tx[i] - box.x) / Math.max(1, box.w) * 0.85 + rnd(0, 0.45);
        } else {
          tx[i] = rnd(0, W); ty[i] = rnd(0, H);
          sz[i] = Math.random() < 0.85 ? 1 : 2;
          sh[i] = Math.random() < 0.7 ? 0 : 1;
          k[i] = rnd(0.004, 0.012);
          dl[i] = 0;
        }
        ph[i] = rnd(0, Math.PI * 2);
        /* direction de dispersion : vers le haut, en éventail */
        jx[i] = rnd(-1, 1) * rnd(120, 420);
        jy[i] = -rnd(80, 520);
        if (intro && inWord) {
          var a = rnd(0, Math.PI * 2), d = rnd(0.25, 0.9) * Math.max(W, H);
          px[i] = tx[i] + Math.cos(a) * d * 0.7;
          py[i] = ty[i] + Math.sin(a) * d * 0.35;
        } else {
          px[i] = tx[i] + rnd(-2, 2); py[i] = ty[i] + rnd(-2, 2);
        }
        vx[i] = 0; vy[i] = 0;
      }
      order = [];
      for (var lv = 0; lv < LEVELS.length; lv++) {
        for (var j = 0; j < T; j++) if (sh[j] === lv) order.push(j);
      }
      built = true;
      host.classList.add("is-sand");
      doc.classList.add("is-sand");
    }

    function step(now) {
      var t = (now - started) / 1000;
      var s = disperse;
      var T = N + A;
      var mx = mouse.x, my = mouse.y, mon = mouse.on;
      var R = small ? 70 : 120, R2 = R * R;
      var mvx = mouse.vx, mvy = mouse.vy;

      for (var i = 0; i < T; i++) {
        var gx, gy;
        if (i < N) {
          if (t < dl[i]) { vx[i] *= 0.96; vy[i] *= 0.96; px[i] += vx[i]; py[i] += vy[i]; continue; }
          var w = 0.55 * Math.sin(t * 1.3 + ph[i]);
          gx = tx[i] + jx[i] * s * s + w;
          gy = ty[i] + jy[i] * s * s + 0.55 * Math.cos(t * 1.1 + ph[i]);
        } else {
          /* ambiance : dérive lente le long d'un courant */
          tx[i] += 0.12 + 0.1 * Math.sin(ph[i] + t * 0.3);
          ty[i] += 0.05 * Math.cos(ph[i] * 2 + t * 0.4);
          if (tx[i] > W + 4) tx[i] = -4;
          if (ty[i] > H + 4) ty[i] = -4; else if (ty[i] < -4) ty[i] = H + 4;
          gx = tx[i]; gy = ty[i];
        }
        var ax = (gx - px[i]) * k[i];
        var ay = (gy - py[i]) * k[i];

        if (mon) {
          var dx = px[i] - mx, dy = py[i] - my, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            var d = Math.sqrt(d2) + 0.001, f = 1 - d / R;
            f = f * f;
            /* poussée radiale + tourbillon + entraînement par la vitesse du pointeur */
            ax += (dx / d) * f * 3.2 - (dy / d) * f * 1.1 + mvx * f * 0.22;
            ay += (dy / d) * f * 3.2 + (dx / d) * f * 1.1 + mvy * f * 0.22;
          }
        }
        vx[i] = (vx[i] + ax) * 0.86;
        vy[i] = (vy[i] + ay) * 0.86;
        px[i] += vx[i]; py[i] += vy[i];
      }
      mouse.vx *= 0.8; mouse.vy *= 0.8;
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var fade = 1 - disperse * 0.85;
      var cur = -1;
      for (var n = 0; n < order.length; n++) {
        var i = order[n];
        if (sh[i] !== cur) {
          cur = sh[i];
          ctx.fillStyle = "rgba(" + RGB + "," + (LEVELS[cur] * fade).toFixed(3) + ")";
        }
        var s = sz[i] * (dpr > 1.5 ? 1.5 : 1);
        ctx.fillRect(Math.round(px[i] * dpr), Math.round(py[i] * dpr), Math.ceil(s), Math.ceil(s));
      }
    }

    function frame(now) {
      if (!running) return;
      step(now);
      draw();
      requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function stop() { running = false; }

    function init() {
      build(!reduce && isHero);
      started = performance.now();
      if (reduce) {
        for (var i = 0; i < N + A; i++) { px[i] = tx[i]; py[i] = ty[i]; }
        draw();
        return;
      }
      if (visible) start();
    }

    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (!built) return;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0 }).observe(host);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (visible) start();
    });

    host.addEventListener("pointermove", function (e) {
      var r = host.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (mouse.on) { mouse.vx = x - mouse.x; mouse.vy = y - mouse.y; }
      mouse.x = x; mouse.y = y; mouse.on = true;
    }, { passive: true });
    host.addEventListener("pointerleave", function () { mouse.on = false; });

    if (isHero) {
      scrollJobs.push(function () {
        var r = host.getBoundingClientRect();
        disperse = clamp(-r.top / r.height, 0, 1);
        if (reduce && built) draw();
      });
    }

    var lastW = window.innerWidth, timer = 0;
    window.addEventListener("resize", function () {
      if (Math.abs(window.innerWidth - lastW) < 2 && !small) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        lastW = window.innerWidth;
        small = window.matchMedia("(max-width: 700px)").matches;
        build(false);
        if (reduce) { for (var i = 0; i < N + A; i++) { px[i] = tx[i]; py[i] = ty[i]; } draw(); }
      }, 180);
    });

    /* attendre la police : les cibles dépendent du dessin exact du mot */
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { setTimeout(init, isHero ? 60 : 0); });
  }

  document.querySelectorAll("[data-sand-host]").forEach(Sand);

  /* ======================================================================
     Manifeste : les mots s'allument au passage
     ====================================================================== */
  var lit = document.querySelector("[data-lit]");
  if (lit) {
    var words = [];
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span");
            s.className = "w";
            s.textContent = part;
            words.push(s);
            frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) split(c);
      });
    })(lit);
    if (!reduce) {
      scrollJobs.push(function () {
        var r = lit.getBoundingClientRect(), vh = window.innerHeight;
        /* s'allume entre 85 % et 35 % de la hauteur d'écran */
        var p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.5), 0, 1);
        var n = Math.round(p * words.length);
        for (var i = 0; i < words.length; i++) words[i].classList.toggle("is-lit", i < n);
      });
    }
  }

  /* ======================================================================
     Constat → action : défilement horizontal épinglé
     ====================================================================== */
  var pan = document.querySelector("[data-pan]");
  if (pan) {
    var track = pan.querySelector("[data-pan-track]");
    var bar = pan.querySelector("[data-pan-bar]");
    var panMq = window.matchMedia("(min-width: 900px) and (min-height: 600px)");
    var dist = 0;
    var layoutPan = function () {
      var on = panMq.matches && !reduce;
      pan.classList.toggle("is-pan", on);
      if (!on) { pan.style.height = ""; track.style.transform = ""; return; }
      dist = Math.max(0, track.scrollWidth - window.innerWidth);
      pan.style.height = (window.innerHeight + dist) + "px";
      requestScroll();
    };
    scrollJobs.push(function () {
      if (!pan.classList.contains("is-pan")) return;
      var p = stickyProgress(pan);
      track.style.transform = "translate3d(" + (-dist * p).toFixed(1) + "px,0,0)";
      if (bar) bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    });
    panMq.addEventListener("change", layoutPan);
    window.addEventListener("resize", layoutPan);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutPan);
    layoutPan();
  }

  /* ======================================================================
     Courbe mensuelle : tracée au scroll
     ====================================================================== */
  var curve = document.querySelector("[data-curve]");
  if (curve) {
    var svg = curve.querySelector("svg");
    var num = curve.querySelector("[data-curve-num]");
    var vals = svg.getAttribute("data-values").split(",").map(Number);
    var months = svg.getAttribute("data-months").split(",");
    var NS = "http://www.w3.org/2000/svg";
    var X0 = 40, X1 = 960, Y0 = 440, Y1 = 40, MIN = 30, MAX = 80;
    var pts = vals.map(function (v, i) {
      return [X0 + (X1 - X0) * i / (vals.length - 1), Y0 - (v - MIN) / (MAX - MIN) * (Y0 - Y1)];
    });
    function el(name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      for (var a in attrs) e.setAttribute(a, attrs[a]);
      (parent || svg).appendChild(e);
      return e;
    }
    /* Catmull-Rom → Bézier pour une courbe souple */
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += " C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
        " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
        " " + p2[0] + " " + p2[1];
    }
    var defs = el("defs", {});
    var grad = el("linearGradient", { id: "v5CurveFill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0", "stop-color": "#11100e", "stop-opacity": ".12" }, grad);
    el("stop", { offset: "1", "stop-color": "#11100e", "stop-opacity": "0" }, grad);
    var clip = el("clipPath", { id: "v5CurveClip" }, defs);
    var clipRect = el("rect", { x: 0, y: 0, width: 0, height: 520 }, clip);
    [40, 50, 60, 70].forEach(function (v) {
      var y = Y0 - (v - MIN) / (MAX - MIN) * (Y0 - Y1);
      el("line", { class: "grid", x1: X0, x2: X1, y1: y, y2: y });
    });
    el("path", { class: "area", d: d + " L" + X1 + " " + Y0 + " L" + X0 + " " + Y0 + " Z", "clip-path": "url(#v5CurveClip)" });
    var line = el("path", { class: "line", d: d });
    var dots = [], labels = [];
    pts.forEach(function (p, i) {
      el("text", { class: "month", x: p[0], y: 500, "text-anchor": "middle" }).textContent = months[i];
      var lb = el("text", { class: "val", x: p[0], y: p[1] - 22, "text-anchor": "middle" });
      lb.textContent = vals[i];
      labels.push(lb);
      dots.push(el("circle", { class: "dot" + (i === pts.length - 1 ? " is-last" : ""), cx: p[0], cy: p[1], r: 9 }));
    });
    var len = line.getTotalLength();
    line.style.strokeDasharray = len;

    var setCurve = function (p) {
      line.style.strokeDashoffset = (len * (1 - p)).toFixed(1);
      clipRect.setAttribute("width", (X0 + (X1 - X0) * p + 10).toFixed(1));
      var f = p * (vals.length - 1);
      var idx = Math.floor(f), frac = f - idx;
      var v = idx >= vals.length - 1 ? vals[vals.length - 1] : lerp(vals[idx], vals[idx + 1], frac);
      num.textContent = Math.round(v);
      dots.forEach(function (dt, i) {
        var on = f >= i - 0.02;
        dt.classList.toggle("is-on", on);
        labels[i].classList.toggle("is-on", on);
      });
    };

    var curveMq = window.matchMedia("(min-width: 900px) and (min-height: 640px)");
    var pinned = false;
    var layoutCurve = function () {
      pinned = curveMq.matches && !reduce;
      curve.classList.toggle("is-curve-pin", pinned);
      curve.style.height = pinned ? "240vh" : "";
      requestScroll();
    };
    if (reduce) setCurve(1);
    else {
      scrollJobs.push(function () {
        if (!pinned) return;
        /* la courbe se trace sur les 80 premiers % du parcours épinglé */
        setCurve(clamp(stickyProgress(curve) / 0.8, 0, 1));
      });
      /* hors épinglage (mobile) : tracé animé à l'entrée */
      setCurve(0);
      new IntersectionObserver(function (en, obs) {
        if (pinned || !en[0].isIntersecting) return;
        obs.disconnect();
        var t0 = null;
        var tick = function (ts) {
          if (t0 === null) t0 = ts;
          var p = clamp((ts - t0) / 2200, 0, 1);
          setCurve(easeOut(p));
          if (p < 1 && !pinned) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { threshold: 0.35 }).observe(svg);
      curveMq.addEventListener("change", layoutCurve);
      layoutCurve();
    }
  }

  /* ======================================================================
     Méthode : révélation par découpe
     ====================================================================== */
  var clips = document.querySelectorAll("[data-clip]");
  if ("IntersectionObserver" in window && !reduce) {
    var clipIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); clipIO.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    clips.forEach(function (c) { clipIO.observe(c); });
  } else clips.forEach(function (c) { c.classList.add("is-in"); });

  /* ======================================================================
     Offres : les cartes du dessous reculent quand la suivante arrive
     ====================================================================== */
  var stack = document.querySelector("[data-stack]");
  if (stack && !reduce) {
    var cards = Array.prototype.slice.call(stack.children);
    scrollJobs.push(function () {
      if (getComputedStyle(cards[0]).position !== "sticky") {
        cards.forEach(function (c) { c.style.removeProperty("--s"); c.style.filter = ""; });
        return;
      }
      cards.forEach(function (c, i) {
        var next = cards[i + 1];
        if (!next) return;
        var a = c.getBoundingClientRect(), b = next.getBoundingClientRect();
        var p = clamp(1 - (b.top - a.top) / a.height, 0, 1);
        c.style.setProperty("--s", (1 - p * 0.06).toFixed(4));
        c.style.filter = p > 0.01 ? "brightness(" + (1 - p * 0.35).toFixed(3) + ")" : "";
      });
    });
  }

  /* ======================================================================
     Boutons magnétiques + remplissage depuis le point d'entrée
     ====================================================================== */
  if (finePointer && !reduce) {
    document.querySelectorAll("[data-magnetic]").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        b.style.setProperty("--mx", ((x - r.width / 2) * 0.18).toFixed(1) + "px");
        b.style.setProperty("--my", ((y - r.height / 2) * 0.3).toFixed(1) + "px");
        b.style.setProperty("--cx", x.toFixed(0) + "px");
        b.style.setProperty("--cy", y.toFixed(0) + "px");
      });
      b.addEventListener("pointerenter", function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty("--cx", (e.clientX - r.left).toFixed(0) + "px");
        b.style.setProperty("--cy", (e.clientY - r.top).toFixed(0) + "px");
      });
      b.addEventListener("pointerleave", function () {
        b.style.setProperty("--mx", "0px");
        b.style.setProperty("--my", "0px");
      });
    });
  }

  requestScroll();
})();
