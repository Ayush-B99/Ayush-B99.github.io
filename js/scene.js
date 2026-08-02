/* ==========================================================================
   BEEKUM GARAGE — scene.js
   The world: a 7-storey JDM workshop building, drawn entirely in code.
   Static structure is prerendered once per theme; sky, glows and critters
   are drawn every frame. Runs in the browser and in node (QA harness).
   ========================================================================== */
(function (root) {
  'use strict';

  var P = (typeof module !== 'undefined' && module.exports)
    ? require('./sprites.js')
    : root.PixelArt;

  /* ------------------------------ layout -------------------------------- */
  var WORLD = { W: 320, H: 1104, horizonY: 132, buildingTop: 140 };

  /* feet = the y the character's shoes stand on */
  var FLOORS = [
    { id: 'hero',    feet: 140,  label: 'ROOF · BEEKUM GARAGE' },
    { id: 'about',   feet: 290,  label: 'F5 · DRIVER PROFILE' },
    { id: 'exp',     feet: 440,  label: 'F4 · GARAGE BAY' },
    { id: 'proj',    feet: 590,  label: 'F3 · R&D LAB' },
    { id: 'skills',  feet: 740,  label: 'F2 · PARTS DEPOT' },
    { id: 'awards',  feet: 890,  label: 'F1 · TROPHY SHELF' },
    { id: 'contact', feet: 1040, label: 'G · PIT WALL' }
  ];

  /* ladder i connects floor i -> i+1; cx = ladder centreline */
  var LADDERS = [
    { cx: 296 }, { cx: 32 }, { cx: 296 }, { cx: 32 }, { cx: 296 }, { cx: 32 }
  ];

  var ANCHOR_X = [150, 118, 120, 150, 150, 152, 150];

  /* window inner (transparent) content areas */
  var WINDOWS = [
    { x: 58, y: 190, w: 26, h: 36 },
    { x: 58, y: 790, w: 24, h: 32 },
    { x: 42, y: 944, w: 20, h: 26 }
  ];

  var CAR_POS = { x: 134, y: 383 };           /* car sprite top-left (on lift) */
  var SKYLINE = [
    [0, 26, 30], [22, 14, 44], [40, 20, 22], [64, 16, 36], [84, 26, 18],
    [112, 14, 40], [130, 22, 26], [156, 18, 34], [178, 12, 20], [194, 24, 42],
    [222, 16, 24], [242, 20, 36], [266, 14, 18], [284, 20, 30], [306, 14, 24]
  ];

  /* deterministic pseudo-random */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var STARS = (function () {
    var r = mulberry32(1337), out = [];
    for (var i = 0; i < 120; i++) {
      out.push({ x: Math.floor(r() * WORLD.W), y: 4 + Math.floor(r() * 122),
                 ph: r() * 6.28, big: r() < 0.12 });
    }
    return out;
  })();

  var CITY_LITS = (function () {
    var r = mulberry32(902), out = [];
    SKYLINE.forEach(function (b) {
      var n = Math.floor(b[1] * b[2] / 26);
      for (var i = 0; i < n; i++) {
        out.push({ x: b[0] + 2 + Math.floor(r() * (b[1] - 4)),
                   y: WORLD.horizonY - 3 - Math.floor(r() * (b[2] - 5)) });
      }
    });
    return out;
  })();

  /* ------------------------------- path ---------------------------------- */
  function buildPath() {
    var pts = [{ x: 54, y: 140 }];
    var anchorIdx = [];
    for (var i = 0; i < FLOORS.length; i++) {
      pts.push({ x: ANCHOR_X[i], y: FLOORS[i].feet });
      anchorIdx.push(pts.length - 1);
      if (i < FLOORS.length - 1) {
        var cx = LADDERS[i].cx;
        pts.push({ x: cx, y: FLOORS[i].feet });
        pts.push({ x: cx, y: FLOORS[i + 1].feet });
      }
    }
    pts.push({ x: 204, y: 1040 });                     /* stroll to the exit */
    var cum = [0];
    for (var j = 1; j < pts.length; j++) {
      var dx = pts[j].x - pts[j - 1].x, dy = pts[j].y - pts[j - 1].y;
      cum.push(cum[j - 1] + Math.abs(dx) + Math.abs(dy));
    }
    return {
      pts: pts, cum: cum, total: cum[cum.length - 1],
      anchorD: anchorIdx.map(function (k) { return cum[k]; })
    };
  }

  function posAt(path, d) {
    d = Math.max(0, Math.min(path.total, d));
    var pts = path.pts, cum = path.cum;
    for (var i = 1; i < pts.length; i++) {
      if (d <= cum[i]) {
        var f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        var a = pts[i - 1], b = pts[i];
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
                 dx: b.x - a.x, dy: b.y - a.y };
      }
    }
    var last = pts[pts.length - 1];
    return { x: last.x, y: last.y, dx: 1, dy: 0 };
  }

  /* ------------------------ small draw helpers --------------------------- */
  function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

  function disc(ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    for (var y = -r; y <= r; y++) {
      var w = Math.floor(Math.sqrt(r * r - y * y));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }

  function crate(ctx, C, x, y, w, h, label, tint) {
    rect(ctx, x, y, w, h, tint || C('wood'));
    rect(ctx, x, y, w, 1, C('metalLight'));
    rect(ctx, x, y + h - 1, w, 1, C('woodDark'));
    rect(ctx, x, y, 1, h, C('woodDark'));
    rect(ctx, x + w - 1, y, 1, h, C('woodDark'));
    if (label) {
      var tw = P.textWidth(label, {});
      P.drawText(ctx, label, x + Math.floor((w - tw) / 2), y + Math.floor((h - 5) / 2), P.FIXED.ink, {});
    }
  }

  function ladderStatic(ctx, C, cx, yTop, yBot) {
    rect(ctx, cx - 5, yTop, 1, yBot - yTop, C('metalDark'));
    rect(ctx, cx + 4, yTop, 1, yBot - yTop, C('metalDark'));
    for (var y = yTop + 3; y < yBot; y += 4) rect(ctx, cx - 5, y, 10, 1, C('metal'));
  }

  function tire(ctx, x, y, w) {
    rect(ctx, x, y, w, 8, P.FIXED.tire);
    rect(ctx, x + 1, y + 1, w - 2, 1, '#2a2a36');
    rect(ctx, x + Math.floor(w / 2) - 2, y + 3, 4, 2, '#2a2a36');
  }

  /* --------------------------- building prerender ------------------------ */
  function prerenderBuilding(theme, createCanvas) {
    var C = P.makeC(theme);
    var cv = createCanvas(WORLD.W, WORLD.H);
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var i, x, y;

    /* --- rooms: back walls (roof floor has none) --- */
    for (i = 1; i < FLOORS.length; i++) {
      var top = FLOORS[i - 1].feet + 10, feet = FLOORS[i].feet;
      rect(ctx, 0, top, WORLD.W, feet - top, C('wall'));
      rect(ctx, 0, feet - 34, WORLD.W, 34, C('wallLow'));       /* wainscot */
      rect(ctx, 0, feet - 35, WORLD.W, 1, C('wallEdge'));
      rect(ctx, 0, feet - 3, WORLD.W, 3, C('wallEdge'));        /* baseboard */
      rect(ctx, 0, top, WORLD.W, 2, C('slabDark'));             /* ceiling lip */
      rect(ctx, 0, top, 4, feet - top, C('wallEdge'));          /* side walls */
      rect(ctx, WORLD.W - 4, top, 4, feet - top, C('wallEdge'));
    }

    /* --- slabs with ladder gaps --- */
    function slab(yTop, gapCx) {
      rect(ctx, 0, yTop, WORLD.W, 10, C('slab'));
      rect(ctx, 0, yTop, WORLD.W, 2, C('slabTop'));
      rect(ctx, 0, yTop + 8, WORLD.W, 2, C('slabDark'));
      if (gapCx != null) {
        ctx.clearRect(gapCx - 8, yTop, 16, 10);
        rect(ctx, gapCx - 8, yTop, 1, 10, C('slabDark'));
        rect(ctx, gapCx + 7, yTop, 1, 10, C('slabDark'));
      }
    }
    slab(140, LADDERS[0].cx);                                    /* roof deck */
    for (i = 1; i < FLOORS.length; i++) slab(FLOORS[i].feet, i < LADDERS.length ? LADDERS[i].cx : null);

    /* foundation under ground floor */
    rect(ctx, 0, 1050, WORLD.W, WORLD.H - 1050, C('hazeDeep'));
    rect(ctx, 0, 1050, WORLD.W, 2, P.FIXED.outline);

    /* --- ladders --- */
    for (i = 0; i < LADDERS.length; i++) {
      ladderStatic(ctx, C, LADDERS[i].cx, FLOORS[i].feet + 1, FLOORS[i + 1].feet);
    }

    /* --- roof furniture --- */
    rect(ctx, 0, 138, WORLD.W, 2, C('brickDark'));               /* parapet lip */
    /* water tank */
    rect(ctx, 20, 122, 2, 18, C('metalDark')); rect(ctx, 44, 122, 2, 18, C('metalDark'));
    rect(ctx, 16, 100, 34, 24, C('metalDark'));
    rect(ctx, 16, 100, 34, 2, C('metal'));
    rect(ctx, 22, 94, 22, 6, C('metalDark'));
    rect(ctx, 30, 90, 6, 4, C('metal'));
    /* billboard */
    rect(ctx, 102, 92, 3, 48, C('metalDark')); rect(ctx, 196, 92, 3, 48, C('metalDark'));
    rect(ctx, 92, 54, 118, 40, P.FIXED.outline);
    rect(ctx, 94, 56, 114, 36, '#241f33');
    disc(ctx, 110, 74, 11, P.FIXED.red);
    disc(ctx, 110, 74, 11, P.FIXED.red);
    P.drawText(ctx, 'BEEKUM', 128, 60, P.FIXED.amberHot, { scale: 2, spacing: 1 });
    P.drawText(ctx, 'GARAGE', 128, 74, P.FIXED.white, { scale: 2, spacing: 1 });
    P.drawText(ctx, 'EST 2022', 130, 88, P.FIXED.grey, {});
    /* AC unit */
    rect(ctx, 222, 126, 24, 14, C('metal'));
    rect(ctx, 222, 126, 24, 2, C('metalLight'));
    disc(ctx, 230, 133, 4, C('metalDark'));
    rect(ctx, 240, 129, 3, 8, C('metalDark'));
    /* stair hut over ladder 0 */
    rect(ctx, 266, 104, 46, 36, C('brick'));
    rect(ctx, 266, 104, 46, 3, C('brickDark'));
    rect(ctx, 264, 102, 50, 3, C('brickDark'));
    rect(ctx, 288, 112, 16, 28, P.FIXED.outline);                 /* doorway */
    rect(ctx, 270, 112, 12, 10, C('metalDark'));                  /* hut window */
    rect(ctx, 272, 114, 8, 6, C('haze'));
    rect(ctx, 306, 92, 2, 10, C('metalDark'));                    /* antenna */
    P.drawText(ctx, 'DN', 292, 116, P.FIXED.amber, {});

    /* ======================= F5 — DRIVER PROFILE ======================= */
    (function () {
      var feet = 290;
      /* window frame */
      rect(ctx, 54, 186, 34, 44, C('metalDark'));
      ctx.clearRect(58, 190, 26, 36);
      rect(ctx, 70, 190, 2, 36, C('metalDark'));
      rect(ctx, 58, 206, 26, 2, C('metalDark'));
      rect(ctx, 52, 230, 38, 3, C('metal'));                      /* sill */
      /* S13 poster */
      rect(ctx, 148, 180, 32, 40, P.FIXED.outline);
      rect(ctx, 150, 182, 28, 36, C('paper'));
      rect(ctx, 152, 196, 24, 8, P.FIXED.red);
      rect(ctx, 154, 198, 8, 4, P.FIXED.glass);
      P.drawText(ctx, 'S13', 156, 186, P.FIXED.ink, {});
      P.drawText(ctx, 'JDM', 156, 208, P.FIXED.redDark, {});
      /* floor lamp */
      rect(ctx, 92, 208, 2, 80, C('metalDark'));
      rect(ctx, 86, 200, 14, 8, P.FIXED.amber);
      rect(ctx, 86, 200, 14, 2, P.FIXED.amberHot);
      /* sofa */
      rect(ctx, 104, 262, 44, 22, '#2f3560');
      rect(ctx, 104, 256, 8, 28, '#262b4e');
      rect(ctx, 140, 256, 8, 28, '#262b4e');
      rect(ctx, 108, 266, 32, 6, '#3c4374');
      rect(ctx, 106, 284, 4, 6, P.FIXED.outline);
      rect(ctx, 142, 284, 4, 6, P.FIXED.outline);
      /* rug */
      rect(ctx, 98, 286, 60, 4, P.FIXED.redDark);
      rect(ctx, 102, 286, 52, 1, P.FIXED.amber);
      /* book stack table */
      rect(ctx, 196, 274, 22, 3, C('wood'));
      rect(ctx, 198, 277, 2, 13, C('woodDark'));
      rect(ctx, 214, 277, 2, 13, C('woodDark'));
      rect(ctx, 199, 268, 16, 3, P.FIXED.cyan);
      rect(ctx, 200, 265, 14, 3, P.FIXED.red);
      rect(ctx, 199, 262, 15, 3, P.FIXED.amber);
      /* guitar + shelf with helmet */
      P.drawMap(ctx, P.GUITAR, P.GUITAR_PAL, 228, feet - 16, {});
      rect(ctx, 252, 214, 44, 3, C('wood'));
      rect(ctx, 254, 217, 3, 5, C('woodDark'));
      rect(ctx, 290, 217, 3, 5, C('woodDark'));
      P.drawMap(ctx, P.HELMET, P.HELMET_PAL, 262, 206, {});
      P.drawText(ctx, 'DRIVER', 258, 224, C('slabDark'), {});
    })();

    /* ========================= F4 — GARAGE BAY ========================= */
    (function () {
      var feet = 440;
      P.drawText(ctx, 'BAY 04', 56, 322, C('slabDark'), { scale: 2 });
      /* pegboard */
      rect(ctx, 230, 316, 72, 68, C('wallLow'));
      rect(ctx, 230, 316, 72, 2, C('wallEdge'));
      rect(ctx, 230, 382, 72, 2, C('wallEdge'));
      for (y = 322; y < 380; y += 8) for (x = 236; x < 298; x += 8) rect(ctx, x, y, 1, 1, C('wallEdge'));
      /* wrenches / hammer / coil on pegboard */
      rect(ctx, 238, 324, 3, 18, C('metal')); rect(ctx, 236, 322, 7, 4, C('metal'));
      rect(ctx, 248, 324, 3, 22, C('metalLight')); rect(ctx, 246, 322, 7, 4, C('metalLight'));
      rect(ctx, 260, 322, 12, 5, C('metalDark')); rect(ctx, 264, 327, 3, 16, C('wood'));
      disc(ctx, 286, 332, 7, C('metalDark')); disc(ctx, 286, 332, 4, C('wallLow'));
      rect(ctx, 236, 352, 20, 12, P.FIXED.red);   /* first-aid / parts bin */
      rect(ctx, 244, 355, 4, 6, P.FIXED.white);
      rect(ctx, 262, 352, 34, 12, C('metalDark'));
      P.drawText(ctx, 'PARTS', 266, 355, P.FIXED.amber, {});
      /* two-post lift */
      rect(ctx, 128, 352, 6, feet - 352, C('metalDark'));
      rect(ctx, 188, 352, 6, feet - 352, C('metalDark'));
      rect(ctx, 128, 352, 66, 4, C('metal'));
      rect(ctx, 126, 396, 70, 4, C('metal'));                     /* platform */
      rect(ctx, 126, 396, 70, 1, C('metalLight'));
      rect(ctx, 136, 400, 4, feet - 400, C('metalDark'));
      rect(ctx, 182, 400, 4, feet - 400, C('metalDark'));
      /* hanging work lamp */
      rect(ctx, 159, 310, 2, 18, C('metalDark'));
      rect(ctx, 152, 328, 16, 6, C('metalDark'));
      rect(ctx, 154, 332, 12, 2, P.FIXED.amberHot);
      /* toolbox cart */
      rect(ctx, 76, 402, 32, 34, P.FIXED.red);
      rect(ctx, 76, 402, 32, 2, '#e86a78');
      for (i = 0; i < 3; i++) {
        rect(ctx, 79, 407 + i * 9, 26, 7, P.FIXED.redDark);
        rect(ctx, 88, 410 + i * 9, 8, 1, P.FIXED.rim);
      }
      disc(ctx, 82, 438, 2, P.FIXED.tire); disc(ctx, 102, 438, 2, P.FIXED.tire);
      /* tire stack + creeper + drum */
      tire(ctx, 40, 416, 26); tire(ctx, 42, 424, 22); tire(ctx, 40, 432, 26);
      rect(ctx, 110, 434, 20, 3, C('wood'));
      disc(ctx, 113, 438, 2, P.FIXED.tire); disc(ctx, 127, 438, 2, P.FIXED.tire);
      rect(ctx, 210, 414, 18, 26, C('metal'));
      rect(ctx, 210, 414, 18, 2, C('metalLight'));
      rect(ctx, 210, 424, 18, 5, P.FIXED.redDark);
      P.drawText(ctx, 'OIL', 213, 432, C('metalDark'), {});
      /* oil stain */
      rect(ctx, 146, 438, 26, 2, C('slabDark'));
      rect(ctx, 152, 437, 12, 1, C('slabDark'));
    })();

    /* ========================== F3 — R&D LAB =========================== */
    (function () {
      var feet = 590;
      /* server rack */
      rect(ctx, 54, 506, 36, 82, C('metalDark'));
      rect(ctx, 57, 509, 30, 76, P.FIXED.ink);
      for (i = 0; i < 9; i++) {
        rect(ctx, 58, 511 + i * 8, 28, 6, '#1d2130');
        rect(ctx, 60, 513 + i * 8, 12, 2, '#2a3048');
      }
      P.drawText(ctx, 'HPC', 65, 496, C('slabDark'), {});
      /* desk + monitors */
      rect(ctx, 108, 552, 86, 4, C('wood'));
      rect(ctx, 110, 556, 3, 34, C('woodDark'));
      rect(ctx, 189, 556, 3, 34, C('woodDark'));
      rect(ctx, 114, 524, 34, 26, P.FIXED.ink);
      rect(ctx, 152, 524, 34, 26, P.FIXED.ink);
      rect(ctx, 128, 550, 6, 2, C('metalDark'));
      rect(ctx, 166, 550, 6, 2, C('metalDark'));
      rect(ctx, 122, 557, 28, 2, C('metalLight'));                /* keyboard */
      /* chair */
      rect(ctx, 200, 548, 4, 30, P.FIXED.outline);
      rect(ctx, 198, 544, 14, 6, '#2f3560');
      rect(ctx, 198, 560, 16, 4, '#2f3560');
      /* whiteboard */
      rect(ctx, 214, 470, 60, 42, C('metal'));
      rect(ctx, 217, 473, 54, 36, P.FIXED.white);
      P.drawText(ctx, 'UC8', 221, 477, P.FIXED.red, {});
      rect(ctx, 221, 486, 20, 1, P.FIXED.cyan);
      rect(ctx, 221, 490, 26, 1, P.FIXED.cyan);
      rect(ctx, 221, 494, 16, 1, P.FIXED.ink);
      rect(ctx, 250, 478, 14, 10, P.FIXED.skin);                  /* hand doodle */
      rect(ctx, 252, 474, 2, 6, P.FIXED.skin);
      rect(ctx, 256, 473, 2, 7, P.FIXED.skin);
      rect(ctx, 260, 474, 2, 6, P.FIXED.skin);
      P.drawText(ctx, 'ML', 250, 498, P.FIXED.redDark, {});
      /* drone landing table with H pad */
      rect(ctx, 278, 560, 36, 4, C('wood'));
      rect(ctx, 280, 564, 3, 26, C('woodDark'));
      rect(ctx, 309, 564, 3, 26, C('woodDark'));
      rect(ctx, 288, 556, 16, 4, C('metalDark'));
      P.drawText(ctx, 'H', 294, 555, P.FIXED.cyan, {});
      /* floor cable */
      rect(ctx, 88, 586, 60, 1, P.FIXED.outline);
    })();

    /* ========================= F2 — PARTS DEPOT ======================== */
    (function () {
      var feet = 740;
      function shelfUnit(x0, w) {
        rect(ctx, x0, 626, 3, feet - 626, C('metalDark'));
        rect(ctx, x0 + w - 3, 626, 3, feet - 626, C('metalDark'));
        [640, 676, 712].forEach(function (sy) {
          rect(ctx, x0, sy, w, 4, C('wood'));
          rect(ctx, x0, sy, w, 1, C('metalLight'));
        });
      }
      shelfUnit(52, 100); shelfUnit(168, 100);
      /* unit A crates */
      crate(ctx, C, 58, 626, 16, 14, 'PY');
      crate(ctx, C, 78, 626, 16, 14, 'TS', '#8a6a3f');
      crate(ctx, C, 98, 626, 16, 14, 'JS');
      crate(ctx, C, 120, 626, 20, 14, 'C++', '#8a6a3f');
      crate(ctx, C, 58, 662, 16, 14, 'JV');
      crate(ctx, C, 80, 662, 22, 14, 'SQL', '#8a6a3f');
      crate(ctx, C, 106, 662, 20, 14, 'PHP');
      crate(ctx, C, 60, 698, 20, 14, 'CV');
      P.drawMap(ctx, P.TURBO, P.TURBO_PAL, 92, 703, {});
      crate(ctx, C, 112, 698, 24, 14, 'HPL', '#8a6a3f');
      /* unit B crates */
      crate(ctx, C, 174, 626, 22, 14, 'API');
      crate(ctx, C, 200, 626, 18, 14, 'WS', '#8a6a3f');
      crate(ctx, C, 222, 626, 18, 14, 'ML');
      crate(ctx, C, 174, 662, 24, 14, 'DKR', '#8a6a3f');
      crate(ctx, C, 202, 662, 16, 14, 'CI');
      crate(ctx, C, 222, 662, 20, 14, 'AWS');
      crate(ctx, C, 178, 698, 26, 14, 'WP', '#8a6a3f');
      crate(ctx, C, 208, 698, 26, 14, 'DB');
      /* engine block on stand */
      rect(ctx, 278, 700, 30, 22, C('metal'));
      rect(ctx, 278, 700, 30, 3, C('metalLight'));
      for (i = 0; i < 4; i++) rect(ctx, 281 + i * 7, 694, 4, 6, C('metalDark'));
      rect(ctx, 282, 708, 22, 3, C('metalDark'));
      rect(ctx, 280, 722, 4, feet - 722, C('metalDark'));
      rect(ctx, 302, 722, 4, feet - 722, C('metalDark'));
      P.drawText(ctx, 'SR20', 283, 712, P.FIXED.ink, {});
      /* pallet under unit B */
      rect(ctx, 172, 736, 92, 2, C('woodDark'));
    })();

    /* ======================== F1 — TROPHY SHELF ======================== */
    (function () {
      var feet = 890;
      /* banner */
      rect(ctx, 88, 764, 144, 20, P.FIXED.red);
      rect(ctx, 88, 764, 144, 2, P.FIXED.white);
      rect(ctx, 88, 782, 144, 2, P.FIXED.white);
      for (x = 88; x < 232; x += 12) {
        rect(ctx, x, 784, 6, 4, P.FIXED.red);
      }
      P.drawText(ctx, 'UA CHAMP 2026', 108, 770, P.FIXED.white, { scale: 1, spacing: 2 });
      /* framed article */
      rect(ctx, 54, 792, 34, 42, P.FIXED.outline);
      rect(ctx, 56, 794, 30, 38, C('paper'));
      rect(ctx, 58, 796, 26, 5, P.FIXED.red);
      P.drawText(ctx, 'NEWS', 61, 797, P.FIXED.white, {});
      for (i = 0; i < 6; i++) rect(ctx, 58, 804 + i * 4, 26 - (i % 3) * 4, 1, P.FIXED.grey);
      P.drawText(ctx, '100', 60, 824, P.FIXED.redDark, {});
      /* medal on wall */
      rect(ctx, 224, 796, 2, 10, P.FIXED.red);
      rect(ctx, 230, 796, 2, 10, P.FIXED.red);
      rect(ctx, 224, 794, 8, 3, P.FIXED.redDark);
      disc(ctx, 228, 810, 4, P.FIXED.gold);
      disc(ctx, 228, 810, 2, P.FIXED.goldDark);
      /* podium */
      rect(ctx, 120, 870, 26, 20, C('metal'));
      rect(ctx, 146, 860, 30, 30, C('metalLight'));
      rect(ctx, 176, 876, 22, 14, C('metalDark'));
      P.drawText(ctx, '2', 131, 876, P.FIXED.ink, {});
      P.drawText(ctx, '1', 159, 868, P.FIXED.ink, {});
      P.drawText(ctx, '3', 185, 880, P.FIXED.white, {});
      P.drawMap(ctx, P.TROPHY, P.TROPHY_PAL, 156, 850, {});
      /* crossed checkered flags */
      rect(ctx, 250, 794, 2, 40, C('wood'));
      rect(ctx, 284, 794, 2, 40, C('wood'));
      for (var fy = 0; fy < 5; fy++) for (var fx = 0; fx < 8; fx++) {
        rect(ctx, 252 + fx * 2, 794 + fy * 2, 2, 2, (fx + fy) % 2 ? P.FIXED.white : P.FIXED.ink);
        rect(ctx, 268 + fx * 2, 794 + fy * 2, 2, 2, (fx + fy) % 2 ? P.FIXED.ink : P.FIXED.white);
      }
      /* confetti */
      [[104, 886, P.FIXED.cyan], [206, 884, P.FIXED.amber], [116, 884, P.FIXED.red],
       [222, 887, P.FIXED.green], [96, 887, P.FIXED.gold]].forEach(function (c) {
        rect(ctx, c[0], c[1], 2, 1, c[2]);
      });
    })();

    /* ========================== G — PIT WALL =========================== */
    (function () {
      var feet = 1040;
      /* window */
      rect(ctx, 38, 940, 28, 34, C('metalDark'));
      ctx.clearRect(42, 944, 20, 26);
      rect(ctx, 50, 944, 2, 26, C('metalDark'));
      /* stencil */
      P.drawText(ctx, 'SEE YOU AT THE APEX', 96, 926, C('slabDark'), {});
      /* desk + PC */
      rect(ctx, 56, 1002, 66, 4, C('wood'));
      rect(ctx, 58, 1006, 3, 34, C('woodDark'));
      rect(ctx, 115, 1006, 3, 34, C('woodDark'));
      rect(ctx, 64, 976, 32, 24, P.FIXED.ink);
      rect(ctx, 76, 1000, 8, 2, C('metalDark'));
      rect(ctx, 70, 1010, 14, 24, C('metalDark'));                /* tower */
      rect(ctx, 72, 1014, 10, 2, P.FIXED.ink);
      /* mug */
      rect(ctx, 102, 996, 7, 6, P.FIXED.red);
      rect(ctx, 109, 997, 2, 3, P.FIXED.redDark);
      /* envelope plaque */
      rect(ctx, 136, 936, 17, 15, C('metalDark'));
      P.drawMap(ctx, P.MAIL, P.MAIL_PAL, 140, 940, {});
      /* plant */
      P.drawMap(ctx, P.PLANT, P.PLANT_PAL, 158, feet - 11, {});
      /* roller exit door */
      rect(ctx, 210, 938, 96, 102, C('metalDark'));
      for (y = 942; y < 1036; y += 8) {
        rect(ctx, 214, y, 88, 5, C('metal'));
        rect(ctx, 214, y + 5, 88, 1, C('metalDark'));
      }
      rect(ctx, 210, 938, 4, 102, P.FIXED.ink);
      rect(ctx, 302, 938, 4, 102, P.FIXED.ink);
      rect(ctx, 214, 1034, 88, 4, P.FIXED.ink);
      /* EXIT sign box (letters drawn dynamically with glow) */
      rect(ctx, 238, 918, 40, 14, P.FIXED.ink);
      /* floor chevrons */
      [[176, 1034], [190, 1034]].forEach(function (cpos) {
        rect(ctx, cpos[0], cpos[1], 3, 3, C('slabTop'));
        rect(ctx, cpos[0] + 3, 1031, 3, 3, C('slabTop'));
        rect(ctx, cpos[0] + 3, 1037, 3, 3, C('slabTop'));
      });
    })();

    return cv;
  }

  /* --------------------------- per-frame drawing ------------------------- */

  function drawSkyRows(ctx, view, cam, theme) {
    var C = P.makeC(theme);
    for (var sy = 0; sy < view.h; sy++) {
      var wy = cam.y + sy;
      var col;
      if (wy < WORLD.horizonY) col = P.skyColor(theme, wy / WORLD.horizonY);
      else col = wy < 400 ? C('haze') : C('hazeDeep');
      ctx.fillStyle = col;
      ctx.fillRect(0, sy, view.w, 1);
    }
  }

  function drawCelestial(ctx, theme, time, state) {
    var night = theme === 'night';
    if (night) {
      for (var i = 0; i < STARS.length; i++) {
        var s = STARS[i];
        var tw = 0.55 + 0.45 * Math.sin(time * 0.0016 + s.ph);
        ctx.globalAlpha = state.reduced ? 0.8 : tw;
        ctx.fillStyle = '#dfe9ff';
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && tw > 0.8) {
          ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      /* crescent moon */
      disc(ctx, 246, 44, 10, '#e8ecff');
      disc(ctx, 250, 41, 9, P.skyColor('night', 44 / 132));
      ctx.globalAlpha = 0.08;
      disc(ctx, 246, 44, 14, '#e8ecff');
      ctx.globalAlpha = 1;
      /* shooting star */
      if (!state.reduced && state.shoot && state.shoot.life > 0) {
        var sh = state.shoot;
        for (var k = 0; k < 9; k++) {
          ctx.globalAlpha = (1 - k / 9) * Math.min(1, sh.life / 300);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(sh.x - k * 2), Math.round(sh.y - k), 2, 1);
        }
        ctx.globalAlpha = 1;
      }
    } else {
      /* sunset sun with banded glow */
      ctx.globalAlpha = 0.15; disc(ctx, 252, 88, 22, '#ffdf9e');
      ctx.globalAlpha = 0.25; disc(ctx, 252, 88, 17, '#ffdf9e');
      ctx.globalAlpha = 1;
      disc(ctx, 252, 88, 12, '#fff2c0');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(210, 112, 90, 1); ctx.fillRect(224, 118, 70, 1);
      ctx.globalAlpha = 1;
      /* drifting clouds */
      var drift = state.reduced ? 0 : time * 0.004;
      [[30, 40, 34], [140, 62, 26], [230, 30, 40]].forEach(function (cl, idx) {
        var cx2 = ((cl[0] + drift * (idx + 1) * 0.4) % (WORLD.W + 80)) - 40;
        ctx.fillStyle = idx === 1 ? '#e8a78c' : '#ffd0ad';
        ctx.fillRect(cx2, cl[1], cl[2], 4);
        ctx.fillRect(cx2 + 6, cl[1] - 3, cl[2] - 14, 3);
        ctx.fillRect(cx2 + 4, cl[1] + 4, cl[2] - 8, 2);
      });
    }
    /* skyline silhouette + lit windows */
    ctx.fillStyle = theme === 'night' ? '#0a0d20' : '#2a1c3e';
    SKYLINE.forEach(function (b) {
      ctx.fillRect(b[0], WORLD.horizonY - b[2], b[1], b[2] + 2);
    });
    if (night) {
      ctx.fillStyle = '#ffb45e';
      CITY_LITS.forEach(function (d, i2) {
        if ((i2 + ((time / 4000) | 0)) % 7 !== 0) ctx.fillRect(d.x, d.y, 1, 1);
      });
    }
  }

  function drawWindowContents(ctx, theme) {
    var C = P.makeC(theme);
    var night = theme === 'night';
    WINDOWS.forEach(function (w, wi) {
      rect(ctx, w.x, w.y, w.w, w.h, C('haze'));
      rect(ctx, w.x, w.y + Math.floor(w.h * 0.55), w.w, Math.ceil(w.h * 0.45), C('hazeDeep'));
      /* distant rooftops */
      rect(ctx, w.x + 2, w.y + Math.floor(w.h * 0.5), 6, Math.ceil(w.h * 0.5), C('hazeDeep'));
      rect(ctx, w.x + w.w - 9, w.y + Math.floor(w.h * 0.4), 7, Math.ceil(w.h * 0.6), C('hazeDeep'));
      if (night) {
        ctx.fillStyle = '#ffb45e';
        ctx.fillRect(w.x + 4, w.y + w.h - 8, 1, 1);
        ctx.fillRect(w.x + w.w - 6, w.y + w.h - 12, 1, 1);
        ctx.fillStyle = '#dfe9ff';
        ctx.fillRect(w.x + 3 + wi * 4, w.y + 3, 1, 1);
        ctx.fillRect(w.x + w.w - 5, w.y + 5, 1, 1);
      } else {
        ctx.fillStyle = '#ffb36b';
        ctx.fillRect(w.x, w.y + 2, w.w, 1);
      }
    });
  }

  function glow(ctx, x, y, w, h, rgb, a) {
    ctx.fillStyle = 'rgba(' + rgb + ',' + a + ')';
    ctx.fillRect(x, y, w, h);
  }

  var CODE_LINES = ['DEF CALIBRATE:', 'AWAIT WS.SEND', 'GESTURE OK 98', 'PYTEST 214 OK',
                    'RUFF CLEAN', 'UV SYNC DONE', 'HPL 1098 GF', 'CI GREEN'];

  function drawDynamics(ctx, theme, time, state) {
    var C = P.makeC(theme);
    var night = theme === 'night';
    var flick = state.reduced ? 1 : (0.85 + 0.15 * Math.sin(time * 0.011) * Math.sin(time * 0.0037));
    var drop = !state.reduced && Math.sin(time * 0.0009) > 0.997;

    /* billboard neon glow */
    ctx.globalAlpha = (night ? 0.30 : 0.14) * flick * (drop ? 0.2 : 1);
    ctx.fillStyle = P.FIXED.amber;
    ctx.fillRect(88, 50, 126, 48);
    ctx.globalAlpha = 1;
    if (night) {
      P.drawText(ctx, 'BEEKUM', 128, 60, drop ? P.FIXED.amber : '#ffe9b0', { scale: 2, spacing: 1 });
    }

    /* festoon lights: billboard leg to hut roof */
    for (var i = 0; i <= 7; i++) {
      var fx = 199 + i * 10;
      var fy = 96 + Math.round(Math.sin((i / 7) * Math.PI) * 7);
      ctx.fillStyle = C('metalDark');
      ctx.fillRect(fx, fy - 1, 10, 1);
      var bulb = ['#ffd98a', '#52d9e8', '#ff8a80'][i % 3];
      ctx.fillStyle = bulb;
      ctx.fillRect(fx + 4, fy, 2, 2);
      if (night) { ctx.globalAlpha = 0.25 * flick; ctx.fillRect(fx + 3, fy - 1, 4, 4); ctx.globalAlpha = 1; }
    }

    /* antenna beacon */
    if (Math.floor(time / 900) % 2 === 0) {
      ctx.fillStyle = P.FIXED.red; ctx.fillRect(306, 90, 2, 2);
      if (night) { ctx.globalAlpha = 0.3; ctx.fillRect(304, 88, 6, 6); ctx.globalAlpha = 1; }
    }

    /* F5 lamp glow */
    glow(ctx, 82, 208, 22, 30, C('lampCone'), night ? 0.14 : 0.08);
    glow(ctx, 78, 238, 30, 52, C('lampCone'), night ? 0.08 : 0.045);

    /* F4 work lamp cone onto the car */
    glow(ctx, 150, 334, 20, 20, C('lampCone'), night ? 0.16 : 0.09);
    glow(ctx, 142, 354, 36, 30, C('lampCone'), night ? 0.10 : 0.055);
    glow(ctx, 134, 384, 52, 12, C('lampCone'), night ? 0.07 : 0.04);

    /* the S13 on the lift */
    P.drawMap(ctx, P.CAR, P.CAR_PAL, CAR_POS.x, CAR_POS.y, {});
    if (state.popup) {
      P.drawMap(ctx, P.CAR_POPUP, P.CAR_POPUP_PAL, CAR_POS.x + 2, CAR_POS.y + 2, {});
      if (night) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#fff3c8';
        ctx.fillRect(CAR_POS.x - 26, CAR_POS.y + 6, 28, 3);
        ctx.fillRect(CAR_POS.x - 34, CAR_POS.y + 5, 8, 5);
        ctx.globalAlpha = 1;
      }
    }

    /* cat on the tire stack, tail flick */
    var catFrame = (Math.floor(time / 2600) % 3 === 0 && Math.floor(time / 260) % 2 === 0) ? 1 : 0;
    P.drawMap(ctx, P.CAT[catFrame], P.CAT_PAL, 46, 410, {});

    /* F3 monitors: scrolling terminal */
    [[116, 526], [154, 526]].forEach(function (m, mi) {
      rect(ctx, m[0], m[1], 30, 22, '#07100a');
      var base = Math.floor(time / 700) + mi * 3;
      for (var L = 0; L < 4; L++) {
        var txt = CODE_LINES[(base + L) % CODE_LINES.length].slice(0, 9);
        ctx.globalAlpha = L === 3 ? 0.5 : 1;
        P.drawText(ctx, txt, m[0] + 2, m[1] + 2 + L * 5, mi ? P.FIXED.cyan : P.FIXED.green, { spacing: 0 });
      }
      ctx.globalAlpha = 1;
      if (!state.reduced) {
        var scan = (Math.floor(time / 60) % 22);
        ctx.globalAlpha = 0.10; ctx.fillStyle = '#ffffff';
        ctx.fillRect(m[0], m[1] + scan, 30, 1); ctx.globalAlpha = 1;
      }
    });

    /* rack LEDs */
    for (var u = 0; u < 9; u++) {
      var on = (Math.floor(time / 260) + u * 7) % 5;
      rect(ctx, 80, 513 + u * 8, 2, 2, on < 3 ? P.FIXED.green : '#1d2130');
      rect(ctx, 84, 513 + u * 8, 1, 2, on === 1 ? P.FIXED.amber : '#1d2130');
    }

    /* drone hover + prop blur */
    var bobY = state.reduced ? 0 : Math.round(Math.sin(time * 0.003) * 2);
    var bobX = state.reduced ? 0 : Math.round(Math.sin(time * 0.0011) * 2);
    var dframe = Math.floor(time / 90) % 2;
    P.drawMap(ctx, P.DRONE[dframe], P.DRONE_PAL, 288 + bobX, 522 + bobY, {});
    if (night) { ctx.fillStyle = P.FIXED.cyan; ctx.fillRect(295 + bobX, 526 + bobY, 1, 1); }

    /* F2 lantern sway */
    var sway = state.reduced ? 0 : Math.round(Math.sin(time * 0.0016) * 1.4);
    rect(ctx, 38, 610, 1, 14, C('metalDark'));
    P.drawMap(ctx, P.LANTERN, P.LANTERN_PAL, 35 + sway, 624, {});
    if (night) { glow(ctx, 33 + sway, 626, 11, 8, '255,120,90', 0.18); }

    /* G: EXIT sign + PC + steam + door lantern */
    var exitGlow = night ? 0.85 + (state.reduced ? 0 : 0.15 * Math.sin(time * 0.006)) : 1;
    ctx.globalAlpha = 0.2 * (night ? 1 : 0.4);
    ctx.fillStyle = '#7dff8a'; ctx.fillRect(234, 914, 48, 22);
    ctx.globalAlpha = exitGlow;
    P.drawText(ctx, 'EXIT', 243, 921, '#7dff8a', { scale: 2, spacing: 1 });
    ctx.globalAlpha = 1;

    rect(ctx, 66, 978, 28, 20, '#061018');
    P.drawText(ctx, 'HELLO', 68, 980, P.FIXED.cyan, { spacing: 0 });
    P.drawText(ctx, 'WORLD', 68, 986, P.FIXED.cyan, { spacing: 0 });
    ctx.globalAlpha = 0.5;
    P.drawText(ctx, '-', 68 + (Math.floor(time / 500) % 2) * 4, 992, P.FIXED.cyan, {});
    ctx.globalAlpha = 1;

    if (!state.reduced) {
      var st = Math.floor(time / 300) % 4;
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfd6de';
      ctx.fillRect(104, 990 - st, 1, 1);
      ctx.fillRect(106, 987 - ((st + 2) % 4), 1, 1);
      ctx.globalAlpha = 1;
    }
    rect(ctx, 202, 926, 1, 8, C('metalDark'));
    P.drawMap(ctx, P.LANTERN, P.LANTERN_PAL, 199 + sway, 934, {});
    if (night) glow(ctx, 197 + sway, 936, 11, 8, '255,120,90', 0.18);
  }

  /* ------------------------------ character ------------------------------ */
  function drawCharacter(ctx, ch, time) {
    var mode = ch.mode, frame;
    var x = Math.round(ch.x) - 5;
    if (mode === 'climb') {
      frame = Math.floor(ch.animD / 5) % 2;
      P.drawMap(ctx, P.CHAR_CLIMB[frame], P.CHAR_PAL, x, Math.round(ch.y) - 16, {});
      return;
    }
    if (mode === 'walk') {
      var wf = P.CHAR_WALK[Math.floor(ch.animD / 4) % 4];
      P.drawMap(ctx, wf.map, P.CHAR_PAL, x, Math.round(ch.y) - 16 + wf.yOff, { flip: ch.facing < 0 });
    } else {
      var blink = Math.floor(time / 3400) % 8 === 0 && (time % 3400) < 140 ? 1 : 0;
      P.drawMap(ctx, P.CHAR_IDLE[blink], P.CHAR_PAL, x, Math.round(ch.y) - 16, {});
    }
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 1, Math.round(ch.y), 8, 1);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------ compose -------------------------------- */
  function renderFrame(ctx, view, cam, theme, time, state, building, ch) {
    ctx.imageSmoothingEnabled = false;
    drawSkyRows(ctx, view, cam, theme);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    if (cam.y < 200) drawCelestial(ctx, theme, time, state);
    drawWindowContents(ctx, theme);
    ctx.drawImage(building, 0, 0);
    drawDynamics(ctx, theme, time, state);
    if (ch) drawCharacter(ctx, ch, time);
    ctx.restore();
  }

  var API = {
    WORLD: WORLD, FLOORS: FLOORS, LADDERS: LADDERS, WINDOWS: WINDOWS,
    CAR_POS: CAR_POS, buildPath: buildPath, posAt: posAt,
    prerenderBuilding: prerenderBuilding, renderFrame: renderFrame,
    drawSkyRows: drawSkyRows, drawCelestial: drawCelestial,
    drawWindowContents: drawWindowContents, drawDynamics: drawDynamics,
    drawCharacter: drawCharacter
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PixelScene = API;
})(typeof window !== 'undefined' ? window : globalThis);
