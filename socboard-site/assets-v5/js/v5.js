/* SOCBoard v5 : intro, sable, titres découpés, défilements pilotés,
   rapport qui se redresse, parcours de méthode, cartes empilées.
   Chargé après site.js. Sans dépendance. Avec prefers-reduced-motion,
   tout est rendu à l'état final, sans mouvement. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* Progression d'une section épinglée : 0 quand son haut touche le haut de
     l'écran, 1 quand son bas touche le bas. */
  function stickyProgress(el) {
    var r = el.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : (r.top < 0 ? 1 : 0);
  }
  /* Progression d'un élément qui traverse l'écran : 0 quand son haut entre
     par le bas (à `from` × hauteur), 1 quand il atteint `to` × hauteur. */
  function enterProgress(el, from, to) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight;
    return clamp((vh * from - r.top) / (vh * (from - to)), 0, 1);
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

  function onceVisible(el, fn, margin) {
    if (!hasIO || reduce) { fn(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { fn(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: margin || "0px 0px -12% 0px" });
    io.observe(el);
  }

  /* ======================================================================
     Intro : hexagone tracé, SOCBOARD, compteur, rideau qui se lève
     ====================================================================== */
  var introDone = new Promise(function (resolve) {
    var overlay = document.querySelector(".v5-intro");
    var reveal = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { doc.classList.add("is-loaded"); resolve(); });
      });
    };
    if (!doc.classList.contains("has-intro") || !overlay) {
      doc.classList.remove("has-intro");
      reveal();
      return;
    }
    try { sessionStorage.setItem("sb-intro", "1"); } catch (e) {}
    var count = overlay.querySelector("[data-intro-count]");
    var t0 = null, DUR = 1100;
    var tick = function (ts) {
      if (t0 === null) t0 = ts;
      var k = clamp((ts - t0) / DUR, 0, 1);
      if (count) count.textContent = String(Math.round(easeOut(k) * 100)).padStart(2, "0");
      if (k < 1) { requestAnimationFrame(tick); return; }
      doc.classList.add("intro-out");
      setTimeout(reveal, 380);
      setTimeout(function () { doc.classList.remove("has-intro", "intro-out"); }, 1100);
    };
    requestAnimationFrame(tick);
  });

  /* ======================================================================
     En-tête qui s'efface en descendant, revient en remontant + progression
     ====================================================================== */
  var header = document.querySelector(".site-header");
  var bar = document.querySelector("[data-progress]");
  var lastY = window.scrollY;
  scrollJobs.push(function () {
    var y = window.scrollY;
    var menuOpen = document.querySelector('.menu-btn[aria-expanded="true"]');
    if (header && !menuOpen) header.classList.toggle("is-hidden", y > lastY && y > window.innerHeight * 0.8);
    lastY = y;
    if (bar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0).toFixed(4) + ")";
    }
  });
  if (header) header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });


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
    /* le hero s'assemble quand l'intro se lève */
    Promise.all([ready, isHero ? introDone : null]).then(function () { setTimeout(init, isHero ? 60 : 0); });
  }

  document.querySelectorAll("[data-sand-host]").forEach(Sand);

  /* ======================================================================
     Découpe d'un texte en mots (<span class="w">), en gardant <em>, <b>…
     ====================================================================== */
  function splitWords(root, wrap) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span");
            if (wrap) {
              s.className = "v5-w";
              var inner = document.createElement("span");
              inner.textContent = part;
              s.appendChild(inner);
            } else {
              s.className = "w";
              s.textContent = part;
            }
            words.push(s);
            frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(root);
    return words;
  }

  /* Titres qui montent mot à mot derrière un masque */
  document.querySelectorAll("[data-split]").forEach(function (h) {
    var words = splitWords(h, true);
    words.forEach(function (w, i) { w.style.setProperty("--wi", i); });
    onceVisible(h, function (el) { el.classList.add("is-split-in"); }, "0px 0px -10% 0px");
  });

  /* Titre du problème : les mots s'allument pendant le scroll */
  document.querySelectorAll("[data-lit]").forEach(function (lit) {
    var words = splitWords(lit, false);
    if (reduce) return;
    scrollJobs.push(function () {
      var p = enterProgress(lit, 0.9, 0.3);
      var n = Math.round(p * words.length);
      for (var i = 0; i < words.length; i++) words[i].classList.toggle("is-lit", i < n);
    });
  });

  /* Frictions : les cartes sont distribuées en 3D */
  document.querySelectorAll("[data-deal]").forEach(function (el) {
    onceVisible(el, function (t) { t.classList.add("is-in"); }, "0px 0px -15% 0px");
  });

  /* Halo qui suit le pointeur sur les cartes */
  if (finePointer) {
    document.querySelectorAll("[data-spot]").forEach(function (c) {
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty("--sx", (e.clientX - r.left).toFixed(0) + "px");
        c.style.setProperty("--sy", (e.clientY - r.top).toFixed(0) + "px");
      });
    });
  }

  /* ======================================================================
     Rapport : incliné en arrivant, il se redresse et s'avance au scroll
     ====================================================================== */
  var stage = document.querySelector("[data-tilt-scrub]");
  if (stage && !reduce) {
    var rep = stage.querySelector(".report");
    scrollJobs.push(function () {
      var p = easeOut(enterProgress(stage, 1.05, 0.25));
      rep.style.setProperty("--tx", (26 * (1 - p)).toFixed(2) + "deg");
      rep.style.setProperty("--ts", (0.86 + 0.14 * p).toFixed(4));
      rep.style.setProperty("--ty", (80 * (1 - p)).toFixed(1) + "px");
    });
  }

  /* ======================================================================
     Traduction : défilement horizontal épinglé
     ====================================================================== */
  var pan = document.querySelector("[data-pan]");
  if (pan) {
    var track = pan.querySelector("[data-pan-track]");
    var pbar = pan.querySelector("[data-pan-bar]");
    var panels = Array.prototype.slice.call(pan.querySelectorAll(".v5-panel"));
    var big = pan.querySelector("[data-pan-count]");
    var bigDone = false;
    var panMq = window.matchMedia("(min-width: 900px) and (min-height: 600px)");
    var dist = 0;
    var countBig = function () {
      if (bigDone || !big) return;
      bigDone = true;
      if (reduce) return;
      var to = +big.getAttribute("data-pan-count"), t0 = null;
      var f = function (ts) {
        if (t0 === null) t0 = ts;
        var k = clamp((ts - t0) / 900, 0, 1);
        big.textContent = String(Math.round(easeOut(k) * to));
        if (k < 1) requestAnimationFrame(f);
      };
      big.textContent = "0";
      requestAnimationFrame(f);
    };
    var layoutPan = function () {
      var on = panMq.matches && !reduce;
      pan.classList.toggle("is-pan", on);
      if (!on) {
        pan.style.height = ""; track.style.transform = "";
        panels.forEach(function (p) { p.style.removeProperty("--pr"); p.style.removeProperty("--ps"); });
        return;
      }
      dist = Math.max(0, track.scrollWidth - window.innerWidth);
      pan.style.height = (window.innerHeight + dist) + "px";
      requestScroll();
    };
    scrollJobs.push(function () {
      if (!pan.classList.contains("is-pan")) {
        if (big && enterProgress(big, 0.9, 0.5) > 0) countBig();
        return;
      }
      var p = stickyProgress(pan);
      track.style.transform = "translate3d(" + (-dist * p).toFixed(1) + "px,0,0)";
      if (pbar) pbar.style.transform = "scaleX(" + p.toFixed(4) + ")";
      var vw = window.innerWidth;
      panels.forEach(function (el) {
        var r = el.getBoundingClientRect();
        /* -1 à droite de l'écran, 0 au centre, 1 à gauche */
        var c = clamp(((r.left + r.width / 2) - vw / 2) / (vw * 0.75), -1, 1);
        el.style.setProperty("--pr", (-c * 14).toFixed(2) + "deg");
        el.style.setProperty("--ps", (1 - Math.abs(c) * 0.06).toFixed(4));
        if (el.classList.contains("v5-panel--fact") && r.left < vw * 0.8) countBig();
      });
    });
    panMq.addEventListener("change", layoutPan);
    window.addEventListener("resize", layoutPan);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutPan);
    layoutPan();
  }

  /* ======================================================================
     Méthode : l'étape au centre de l'écran s'allume, le parcours se trace
     ====================================================================== */
  var method = document.querySelector("[data-method]");
  if (method) {
    var steps = Array.prototype.slice.call(method.querySelectorAll("[data-step]"));
    var path = method.querySelector("[data-method-path]");
    var dot = method.querySelector("[data-method-dot]");
    var plen = path ? path.getTotalLength() : 0;
    if (path) { path.style.strokeDasharray = plen; path.style.strokeDashoffset = reduce ? 0 : plen; }
    if (reduce && dot && path) {
      var endPt = path.getPointAtLength(plen);
      dot.setAttribute("cx", endPt.x); dot.setAttribute("cy", endPt.y);
    }
    if (!reduce) {
      scrollJobs.push(function () {
        var mid = window.innerHeight * 0.55;
        var best = -1;
        steps.forEach(function (s, i) {
          var r = s.getBoundingClientRect();
          if (r.top < mid) best = i;
        });
        steps.forEach(function (s, i) { s.classList.toggle("is-active", i === Math.max(0, best)); });
        if (path) {
          var first = steps[0].getBoundingClientRect(), last = steps[steps.length - 1].getBoundingClientRect();
          var p = clamp((mid - first.top) / Math.max(1, last.bottom - first.top), 0, 1);
          path.style.strokeDashoffset = (plen * (1 - p)).toFixed(1);
          var pt = path.getPointAtLength(plen * p);
          dot.setAttribute("cx", pt.x.toFixed(1)); dot.setAttribute("cy", pt.y.toFixed(1));
        }
      });
    }
  }

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

  /* Pied de page : le mot-symbole monte à l'arrivée */
  var wordmark = document.querySelector(".footer-wordmark");
  if (wordmark) onceVisible(wordmark, function (el) { el.classList.add("is-in"); }, "0px");

  /* ======================================================================
     Boutons magnétiques + remplissage depuis le point d'entrée
     ====================================================================== */
  if (finePointer && !reduce) {
    document.querySelectorAll("[data-magnetic]").forEach(function (b) {
      var place = function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty("--cx", (e.clientX - r.left).toFixed(0) + "px");
        b.style.setProperty("--cy", (e.clientY - r.top).toFixed(0) + "px");
        return r;
      };
      b.addEventListener("pointermove", function (e) {
        var r = place(e);
        b.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px");
        b.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px");
      });
      b.addEventListener("pointerenter", place);
      b.addEventListener("pointerleave", function () {
        b.style.setProperty("--mx", "0px");
        b.style.setProperty("--my", "0px");
      });
    });
  }

  requestScroll();
})();
