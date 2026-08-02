/* ==========================================================================
   BEEKUM GARAGE — main.js
   Boots the canvas world, walks the little guy in sync with your scroll,
   and wires the HUD, theme toggle and small easter eggs.
   ========================================================================== */
(function () {
  'use strict';

  var P = window.PixelArt, S = window.PixelScene;
  var W = S.WORLD;

  var canvas = document.getElementById('world');
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------- theme -------------------------------- */
  function getSavedTheme() {
    try { return localStorage.getItem('bg-theme'); } catch (e) { return null; }
  }
  function saveTheme(t) { try { localStorage.setItem('bg-theme', t); } catch (e) { /* fine */ } }

  var theme = getSavedTheme() ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');

  var building = null;
  function applyTheme(t) {
    theme = t;
    document.documentElement.setAttribute('data-theme', t);
    building = S.prerenderBuilding(t, function (w, h) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    });
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-label', t === 'night' ? 'Switch to sunset mode' : 'Switch to midnight mode');
      btn.setAttribute('data-mode', t);
    }
  }
  applyTheme(theme);

  document.getElementById('themeToggle').addEventListener('click', function () {
    applyTheme(theme === 'night' ? 'day' : 'night');
    saveTheme(theme);
  });

  /* ------------------------------ viewport ------------------------------- */
  var view = { w: 0, h: 0, scale: 3 };
  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    view.scale = Math.min(6, Math.max(2, Math.ceil(vw / W.W)));
    view.w = Math.ceil(vw / view.scale);
    view.h = Math.ceil(vh / view.scale);
    canvas.width = view.w;
    canvas.height = view.h;
    computeSectionKnots();
  }

  /* -------------------- scroll <-> path parameterisation ------------------ */
  var path = S.buildPath();
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section'));
  var knots = [];   /* [{t, d}] monotonic */

  function computeSectionKnots() {
    var vh = window.innerHeight;
    var docH = document.documentElement.scrollHeight;
    var span = Math.max(1, docH - vh);
    knots = [{ t: 0, d: 0 }];
    sections.forEach(function (el, i) {
      var t = Math.min(0.995, Math.max(0.001, (el.offsetTop + vh * 0.2) / span));
      knots.push({ t: t, d: path.anchorD[i] });
    });
    knots.push({ t: 1, d: path.total });
    for (var i = 1; i < knots.length; i++) {
      if (knots[i].t <= knots[i - 1].t) knots[i].t = knots[i - 1].t + 0.0001;
    }
  }

  function targetDFor(t) {
    for (var i = 1; i < knots.length; i++) {
      if (t <= knots[i].t) {
        var a = knots[i - 1], b = knots[i];
        return a.d + (b.d - a.d) * ((t - a.t) / (b.t - a.t));
      }
    }
    return path.total;
  }

  /* ------------------------------ character ------------------------------ */
  var ch = { d: 0, x: path.pts[0].x, y: path.pts[0].y, facing: 1, mode: 'idle', animD: 0 };
  var cam = { x: 0, y: 0, snap: true };
  var state = { popup: false, reduced: reduced, shoot: null };
  var nextShoot = 4000;

  function step(dt, time) {
    var vh = window.innerHeight;
    var docH = document.documentElement.scrollHeight;
    var t = Math.max(0, Math.min(1, window.scrollY / Math.max(1, docH - vh)));
    var target = targetDFor(t);
    var delta = target - ch.d;

    if (reduced) {
      ch.d = target;
    } else {
      var maxStep = 0.24 * dt;                      /* ~215 world px/s catch-up */
      var move = Math.max(-maxStep, Math.min(maxStep, delta * 0.14));
      if (Math.abs(move) < 0.02) move = Math.max(-maxStep, Math.min(maxStep, delta));
      ch.d += Math.abs(delta) < 0.05 ? delta : move;
    }

    var pos = S.posAt(path, ch.d);
    var moving = Math.abs(delta) > 0.6;
    ch.animD += Math.abs(pos.x - ch.x) + Math.abs(pos.y - ch.y);
    ch.x = pos.x; ch.y = pos.y;
    if (moving) {
      ch.mode = Math.abs(pos.dy) > Math.abs(pos.dx) ? 'climb' : 'walk';
      if (Math.abs(pos.dx) > 0) ch.facing = pos.dx > 0 ? 1 : -1;
    } else {
      ch.mode = 'idle';
    }

    /* camera follows the character */
    var tx = Math.max(0, Math.min(W.W - view.w, ch.x - view.w / 2));
    var ty = Math.max(0, Math.min(W.H - view.h, ch.y - view.h * 0.56));
    if (cam.snap || reduced) { cam.x = tx; cam.y = ty; cam.snap = false; }
    else {
      cam.x += (tx - cam.x) * Math.min(1, 0.0072 * dt);
      cam.y += (ty - cam.y) * Math.min(1, 0.0072 * dt);
    }

    /* shooting stars, midnight only */
    if (theme === 'night' && !reduced) {
      if (state.shoot && state.shoot.life > 0) {
        state.shoot.x += 0.13 * dt; state.shoot.y += 0.06 * dt; state.shoot.life -= dt;
      } else {
        nextShoot -= dt;
        if (nextShoot <= 0) {
          state.shoot = { x: 20 + Math.random() * 200, y: 8 + Math.random() * 50, life: 640 };
          nextShoot = 5200 + Math.random() * 6500;
        }
      }
    }
  }

  /* --------------------------------- HUD --------------------------------- */
  var hudFloor = document.getElementById('hudFloor');
  var gearNum = document.getElementById('gearNum');
  var rpmFill = document.getElementById('rpmFill');
  var dots = Array.prototype.slice.call(document.querySelectorAll('.nav-dot'));
  var GEARS = ['N', '1', '2', '3', '4', '5', '6'];
  var activeIdx = -1;

  function updateHUD() {
    var vh = window.innerHeight;
    var y = window.scrollY + vh * 0.5;
    var idx = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= y) idx = i;
    }
    if (idx !== activeIdx) {
      activeIdx = idx;
      hudFloor.textContent = S.FLOORS[idx].label;
      gearNum.textContent = GEARS[idx];
      dots.forEach(function (d, di) { d.classList.toggle('on', di === idx); });
    }
    var el = sections[idx];
    var local = (y - el.offsetTop) / el.offsetHeight;
    rpmFill.style.width = Math.round(Math.max(0.06, Math.min(1, local)) * 100) + '%';
  }

  dots.forEach(function (d, i) {
    d.addEventListener('click', function () {
      var top = sections[i].offsetTop + 4;
      window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* ------------------------- reveal panels on entry ----------------------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) e.target.classList.add('in');
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.panel').forEach(function (p) { io.observe(p); });

  /* ------------------- click the S13, pop the headlights ------------------ */
  canvas.addEventListener('click', function (ev) {
    var r = canvas.getBoundingClientRect();
    var wx = cam.x + (ev.clientX - r.left) / r.width * view.w;
    var wy = cam.y + (ev.clientY - r.top) / r.height * view.h;
    if (wx >= S.CAR_POS.x - 4 && wx <= S.CAR_POS.x + 56 &&
        wy >= S.CAR_POS.y - 6 && wy <= S.CAR_POS.y + 16) {
      state.popup = !state.popup;
    }
  });

  /* -------------------------------- loop ---------------------------------- */
  var last = performance.now();
  var running = true;
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  function frame(now) {
    if (!running) return;
    var dt = Math.min(48, now - last); last = now;
    step(dt, now);
    updateHUD();
    S.renderFrame(ctx, view, cam, theme, now, state, building, ch);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  updateHUD();
  requestAnimationFrame(frame);
})();
