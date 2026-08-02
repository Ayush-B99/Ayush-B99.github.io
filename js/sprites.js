/* ==========================================================================
   BEEKUM GARAGE — sprites.js
   Palette, 3x5 bitmap font, sprite maps and low-level draw helpers.
   Every pixel on the site is drawn from this data — no image assets.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ----------------------------- palette --------------------------------
     Theme-dependent colors: { d: sunset, n: midnight }.
     Fixed colors don't change with theme. */
  var THEMED = {
    wall:      { d: '#57506a', n: '#292c46' },
    wallLow:   { d: '#4a4459', n: '#22253e' },
    wallEdge:  { d: '#3a3549', n: '#191b30' },
    brick:     { d: '#7c4b46', n: '#3a3350' },
    brickDark: { d: '#5f3936', n: '#2b263f' },
    slab:      { d: '#6c6377', n: '#333650' },
    slabTop:   { d: '#7f768a', n: '#404363' },
    slabDark:  { d: '#453e52', n: '#1e2033' },
    metal:     { d: '#9aa2b5', n: '#57628a' },
    metalDark: { d: '#5f6579', n: '#333c5c' },
    metalLight:{ d: '#c2c8d8', n: '#7d89b0' },
    wood:      { d: '#a5713f', n: '#6b4f33' },
    woodDark:  { d: '#7a5230', n: '#4a3625' },
    paper:     { d: '#e8e0c8', n: '#c2bda9' },
    haze:      { d: '#5b2b49', n: '#0a0f24' },
    hazeDeep:  { d: '#40203a', n: '#060912' },
    cityDot:   { d: '#7a5578', n: '#ffb45e' },
    lampCone:  { d: '255,196,120', n: '255,178,92' }  /* rgb triplets for glows */
  };

  var FIXED = {
    ink:      '#14121f',
    outline:  '#0c0b16',
    red:      '#cf3548',
    redDark:  '#992031',
    white:    '#f2f0e4',
    grey:     '#8b949e',
    amber:    '#ffb347',
    amberHot: '#ffd98a',
    cyan:     '#52d9e8',
    green:    '#c2fe0b',   /* nod to Ayush's GitHub telemetry green */
    tire:     '#14141c',
    rim:      '#c9ced6',
    glass:    '#22384a',
    glassHi:  '#5c93a8',
    skin:     '#eab98b',
    hair:     '#1a1524',
    pants:    '#232744',
    gold:     '#ffcf4d',
    goldDark: '#c79020',
    silver:   '#cfd6de',
    bronze:   '#c77b46',
    leaf:     '#4f9d55',
    leafDark: '#2f6e3c'
  };

  var SKY_STOPS = {
    day:   [[0, 0x2f2150], [0.42, 0x733263], [0.72, 0xc44f63], [0.92, 0xf08355], [1, 0xffa564]],
    night: [[0, 0x04050e], [0.50, 0x0a0e26], [0.85, 0x131b3f], [1, 0x1c2650]]
  };

  function hexToRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Sky color for a 0..1 vertical position (0 = zenith, 1 = horizon). */
  function skyColor(theme, t) {
    var stops = SKY_STOPS[theme === 'night' ? 'night' : 'day'];
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (t >= a[0] && t <= b[0]) {
        var f = (t - a[0]) / (b[0] - a[0] || 1);
        var ca = hexToRgb(a[1]), cb = hexToRgb(b[1]);
        return 'rgb(' + Math.round(lerp(ca[0], cb[0], f)) + ',' +
                        Math.round(lerp(ca[1], cb[1], f)) + ',' +
                        Math.round(lerp(ca[2], cb[2], f)) + ')';
      }
    }
    return 'rgb(' + hexToRgb(stops[stops.length - 1][1]).join(',') + ')';
  }

  /* Color lookup: themed key, fixed key, or literal. */
  function makeC(theme) {
    return function (key) {
      if (THEMED[key]) return THEMED[key][theme === 'night' ? 'n' : 'd'];
      if (FIXED[key]) return FIXED[key];
      return key;
    };
  }

  /* --------------------------- 3x5 bitmap font --------------------------- */
  var FONT3 = {
    A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011',
    D: '110,101,101,101,110', E: '111,100,110,100,111', F: '111,100,110,100,100',
    G: '011,100,101,101,011', H: '101,101,111,101,101', I: '111,010,010,010,111',
    J: '001,001,001,101,010', K: '101,110,100,110,101', L: '100,100,100,100,111',
    M: '101,111,101,101,101', N: '110,101,101,101,101', O: '010,101,101,101,010',
    P: '110,101,110,100,100', Q: '010,101,101,011,001', R: '110,101,110,110,101',
    S: '011,100,010,001,110', T: '111,010,010,010,010', U: '101,101,101,101,111',
    V: '101,101,101,101,010', W: '101,101,101,111,101', X: '101,101,010,101,101',
    Y: '101,101,010,010,010', Z: '111,001,010,100,111',
    '0': '111,101,101,101,111', '1': '010,110,010,010,111', '2': '110,001,010,100,111',
    '3': '110,001,010,001,110', '4': '101,101,111,001,001', '5': '111,100,110,001,110',
    '6': '011,100,110,101,010', '7': '111,001,010,010,010', '8': '010,101,010,101,010',
    '9': '010,101,011,001,110',
    '.': '000,000,000,000,010', '-': '000,000,111,000,000', '!': '010,010,010,000,010',
    '/': '001,001,010,100,100', '+': '000,010,111,010,000', ':': '000,010,000,010,000',
    "'": '010,010,000,000,000', ' ': '000,000,000,000,000'
  };

  function drawText(ctx, text, x, y, color, opts) {
    opts = opts || {};
    var s = opts.scale || 1, sp = (opts.spacing != null ? opts.spacing : 1) * s;
    ctx.fillStyle = color;
    var cx = x;
    text = String(text).toUpperCase();
    for (var i = 0; i < text.length; i++) {
      var g = FONT3[text[i]] || FONT3[' '];
      var rows = g.split(',');
      for (var r = 0; r < 5; r++) {
        for (var c = 0; c < 3; c++) {
          if (rows[r][c] === '1') ctx.fillRect(cx + c * s, y + r * s, s, s);
        }
      }
      cx += 3 * s + sp;
    }
    return cx - sp; /* end x */
  }
  function textWidth(text, opts) {
    opts = opts || {};
    var s = opts.scale || 1, sp = (opts.spacing != null ? opts.spacing : 1) * s;
    return String(text).length * (3 * s + sp) - sp;
  }

  /* ------------------------------ sprites --------------------------------
     Maps are arrays of strings; each char indexes into the sprite palette. */

  var CHAR_PAL = {
    H: FIXED.hair, S: FIXED.skin, O: FIXED.outline, J: FIXED.red, D: FIXED.redDark,
    W: FIXED.white, P: FIXED.pants, B: FIXED.white, L: '#3a2a20'
  };

  /* Front-facing idle, 10x16 */
  var CHAR_IDLE = [
    [ '...HHHH...',
      '..HHHHHH..',
      '..HHHHHH..',
      '..SSSSSS..',
      '..SOSSOS..',
      '..SSSSSS..',
      '...SSSS...',
      '..JJJJJJ..',
      '.JJJWWJJJ.',
      '.SJJWWJJS.',
      '.SJJWWJJS.',
      '..JJWWJJ..',
      '..PPPPPP..',
      '..PP..PP..',
      '..PP..PP..',
      '.BBB..BBB.' ],
    [ '...HHHH...',
      '..HHHHHH..',
      '..HHHHHH..',
      '..SSSSSS..',
      '..SLSSLS..',
      '..SSSSSS..',
      '...SSSS...',
      '..JJJJJJ..',
      '.JJJWWJJJ.',
      '.SJJWWJJS.',
      '.SJJWWJJS.',
      '..JJWWJJ..',
      '..PPPPPP..',
      '..PP..PP..',
      '..PP..PP..',
      '.BBB..BBB.' ]
  ];

  /* Side view walking right, 10x16, 4 frames (contact, pass, contact, pass) */
  var CHAR_WALK = [
    { yOff: 0, map: [
      '...HHHH...',
      '..HHHHHH..',
      '..HHHSSS..',
      '..HHHSOS..',
      '..HHHSSS..',
      '...HSSS...',
      '...JJJJ...',
      '..JJJJJJ..',
      '..DJJJJS..',
      '..DJJJJS..',
      '...JJJJ...',
      '...PPPP...',
      '..PPP.PP..',
      '..PP...PP.',
      '..BB...PP.',
      '.BB....BBB' ] },
    { yOff: 1, map: [
      '...HHHH...',
      '..HHHHHH..',
      '..HHHSSS..',
      '..HHHSOS..',
      '..HHHSSS..',
      '...HSSS...',
      '...JJJJ...',
      '..JJJJJJ..',
      '..DJJJSJ..',
      '..DJJJSJ..',
      '...JJJJ...',
      '...PPPP...',
      '...PPPP...',
      '...PPP....',
      '...BPP....',
      '...BBB....' ] },
    { yOff: 0, map: [
      '...HHHH...',
      '..HHHHHH..',
      '..HHHSSS..',
      '..HHHSOS..',
      '..HHHSSS..',
      '...HSSS...',
      '...JJJJ...',
      '..JJJJJJ..',
      '..SJJJJD..',
      '..SJJJJD..',
      '...JJJJ...',
      '...PPPP...',
      '..PP.PPP..',
      '.PP...PP..',
      '.PP...BB..',
      'BBB....BB.' ] },
    { yOff: 1, map: [
      '...HHHH...',
      '..HHHHHH..',
      '..HHHSSS..',
      '..HHHSOS..',
      '..HHHSSS..',
      '...HSSS...',
      '...JJJJ...',
      '..JJJJJJ..',
      '..JSJJJD..',
      '..JSJJJD..',
      '...JJJJ...',
      '...PPPP...',
      '...PPPP...',
      '....PPP...',
      '....PPB...',
      '....BBB...' ] }
  ];

  /* Back view climbing ladder, 10x16, 2 frames (alternating reach) */
  var CHAR_CLIMB = [
    [ '.S..HH....',
      '.S.HHHH...',
      '..HHHHHH..',
      '..HHHHHH..',
      '..HHHHHH..',
      '...HHHH.S.',
      '..JJJJJJS.',
      '.JJJJJJJ..',
      '.JJJJJJJJ.',
      '..JJJJJJ..',
      '..JJJJJJ..',
      '...PPPP...',
      '..PPP.....',
      '..PP..PP..',
      '..B...PP..',
      '......BB..' ],
    [ '....HH..S.',
      '...HHHH.S.',
      '..HHHHHH..',
      '..HHHHHH..',
      '..HHHHHH..',
      '.S.HHHH...',
      '.SJJJJJJ..',
      '..JJJJJJJ.',
      '.JJJJJJJJ.',
      '..JJJJJJ..',
      '..JJJJJJ..',
      '...PPPP...',
      '.....PPP..',
      '..PP..PP..',
      '..PP...B..',
      '..BB......' ]
  ];

  /* Nissan 200SX S13 side profile facing left, 52x13 (wheels included). */
  var CAR_PAL = {
    R: FIXED.red, D: FIXED.redDark, O: FIXED.outline,
    K: FIXED.glass, G: FIXED.glassHi, T: FIXED.tire, M: FIXED.rim,
    Y: '#ff6a55', W: FIXED.white, L: '#e8e2d0', S: '#7d1a28'
  };
  var CAR = [
    '..................OOOOOOOOOOOOOOOOOO................',
    '.................ORRRRRRRRRRRRRRRRRROO..............',
    '................ORKKKKKKKKKGKKKKKKRRO...............',
    '...............ORRKKKKKKKKKGKKKKKKKRRO..............',
    '....OOOOOOOOOOOORRRRRRRRRRRRRRRRRRRRRRO.............',
    '..OORRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRROOOOO.......',
    '.ORRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRROO.....',
    'ORRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRYYO.',
    'OLRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRSSO.',
    'ODDDDDDOTTTTTTODDDDDDDDDDDDDDDDDDOTTTTTTODDDDDDDDO.',
    'OOOOOOTTTTTTTTOOOOOOOOOOOOOOOOOOOOTTTTTTTTOOOOOOOO.',
    '......TTMMMMTT....................TTMMMMTT..........',
    '.......TTMMTT......................TTMMTT...........'
  ];
  /* Pop-up headlights raised: drawn at car x+3, y+2 when toggled on. */
  var CAR_POPUP = [
    'OLLL',
    'OLLO'
  ];
  var CAR_POPUP_PAL = { O: FIXED.outline, L: '#fff3c8' };

  /* Quadcopter drone, 15x6, 2 prop frames */
  var DRONE_PAL = { O: FIXED.outline, B: '#3b4668', L: FIXED.metalLight, R: FIXED.red, P: '#9aa6c8', C: FIXED.cyan };
  var DRONE = [
    [ 'PPPPP...PPPPP..',
      '..OO.....OO....',
      '..OBBBBRBBBBO..',
      '..OBBBBBBBBBO..',
      '...O.......O...',
      '...L.......L...' ],
    [ '..PPP.....PPP..',
      '..OO.....OO....',
      '..OBBBBRBBBBO..',
      '..OBBBBBBBBBO..',
      '...O.......O...',
      '...L.......L...' ]
  ];

  /* Sleeping workshop cat, 12x6, 2 frames (tail flick) */
  var CAT_PAL = { O: FIXED.outline, C: '#2c2c38', E: '#494958', P: '#e88aa0' };
  var CAT = [
    [ '..........O.',
      'OCCCCCCO.OCO',
      'OCCCCCCCOCO.',
      'OCCCCCCCCO..',
      'OCECCCCCCO..',
      '.OOOOOOOO...' ],
    [ '............',
      'OCCCCCCO.OO.',
      'OCCCCCCCOCCO',
      'OCCCCCCCCOO.',
      'OCECCCCCCO..',
      '.OOOOOOOO...' ]
  ];

  /* Trophy 9x10 */
  var TROPHY_PAL = { G: FIXED.gold, D: FIXED.goldDark, O: FIXED.outline, W: FIXED.white };
  var TROPHY = [
    '.OOOOOOO.',
    'OGGGGGGGO',
    'OGGGGGGGO',
    '.OGGGGGO.',
    'O.OGGGO.O',
    'OO.OGO.OO',
    '...OGO...',
    '..OGGGO..',
    '.ODDDDDO.',
    'ODDDDDDDO'
  ];

  /* Racing helmet on shelf, 10x8 */
  var HELMET_PAL = { W: FIXED.white, R: FIXED.red, K: FIXED.glass, O: FIXED.outline, G: FIXED.glassHi };
  var HELMET = [
    '..OOOOOO..',
    '.OWWWWWWO.',
    'OWWWWWWWWO',
    'OWRRRRRRWO',
    'OWKGKKKKOO',
    'OWKKKKKKO.',
    'OWWWWWWOO.',
    '.OOOOOO...'
  ];

  /* Turbocharger (the snail), 11x9 */
  var TURBO_PAL = { M: FIXED.metal, D: FIXED.metalDark, L: FIXED.metalLight, O: FIXED.outline };
  var TURBO = [
    '...OOOOO...',
    '..OMMMMMO..',
    '.OMMDDDMMO.',
    'OMMDOLODMMO',
    'OMDOLLLODMO',
    'OMMDOLODMMO',
    '.OMMDDDMMOO',
    '..OMMMMMODO',
    '...OOOOO.OO'
  ];

  /* Red paper lantern, 7x10 */
  var LANTERN_PAL = { R: FIXED.red, D: FIXED.redDark, O: FIXED.outline, Y: FIXED.amberHot };
  var LANTERN = [
    '...O...',
    '..OOO..',
    '.ORRRO.',
    'ORRYRRO',
    'ORYYYRO',
    'ORRYRRO',
    'ODRRRDO',
    '.ODDDO.',
    '..OOO..',
    '...O...'
  ];

  /* Electric guitar on a stand, 9x16 */
  var GUITAR_PAL = { O: FIXED.outline, B: '#d95763', D: '#a13a4a', N: '#7a5230', W: FIXED.white, M: '#5f6579' };
  var GUITAR = [
    '....ON...',
    '....ONO..',
    '....ON...',
    '....ONO..',
    '....ON...',
    '....ON...',
    '...OBBO..',
    '..OBBBBO.',
    '.OBBWWBBO',
    '.OBBWWBBO',
    '..OBBBBO.',
    '.OBBBBBO.',
    '.OBBBBO..',
    '..OOOO...',
    '..M..M...',
    '.MM..MM..'
  ];

  /* Potted plant, 9x11 */
  var PLANT_PAL = { L: FIXED.leaf, D: FIXED.leafDark, O: FIXED.outline, P: '#b5563a', Q: '#8a3f2c' };
  var PLANT = [
    '..L..L.L.',
    '.LDL.LDL.',
    '.LDLLLDL.',
    '..LDLDL..',
    '...LDL...',
    '....L....',
    '..OOOOO..',
    '..OPPPO..',
    '..OPPQO..',
    '...OPQO..',
    '...OOO...'
  ];

  /* Envelope icon, 9x7 */
  var MAIL_PAL = { W: FIXED.white, O: FIXED.outline, R: FIXED.red };
  var MAIL = [
    'OOOOOOOOO',
    'OWWWWWWWO',
    'OWOWWWOWO',
    'OWWOWOWWO',
    'OWWWOWWWO',
    'OWWWWWWWO',
    'OOOOOOOOO'
  ];

  function drawMap(ctx, map, pal, x, y, opts) {
    opts = opts || {};
    var flip = !!opts.flip;
    var rows = map.map ? map : map; /* plain array */
    var h = rows.length, w = rows[0].length;
    for (var r = 0; r < h; r++) {
      var row = rows[r];
      for (var c = 0; c < w; c++) {
        var ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        var col = pal[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        var dx = flip ? (w - 1 - c) : c;
        ctx.fillRect(x + dx, y + r, 1, 1);
      }
    }
  }

  var API = {
    THEMED: THEMED, FIXED: FIXED, makeC: makeC, skyColor: skyColor,
    drawText: drawText, textWidth: textWidth, drawMap: drawMap,
    CHAR_PAL: CHAR_PAL, CHAR_IDLE: CHAR_IDLE, CHAR_WALK: CHAR_WALK, CHAR_CLIMB: CHAR_CLIMB,
    CAR: CAR, CAR_PAL: CAR_PAL, CAR_POPUP: CAR_POPUP, CAR_POPUP_PAL: CAR_POPUP_PAL,
    DRONE: DRONE, DRONE_PAL: DRONE_PAL, CAT: CAT, CAT_PAL: CAT_PAL,
    TROPHY: TROPHY, TROPHY_PAL: TROPHY_PAL, HELMET: HELMET, HELMET_PAL: HELMET_PAL,
    TURBO: TURBO, TURBO_PAL: TURBO_PAL, LANTERN: LANTERN, LANTERN_PAL: LANTERN_PAL,
    GUITAR: GUITAR, GUITAR_PAL: GUITAR_PAL, PLANT: PLANT, PLANT_PAL: PLANT_PAL,
    MAIL: MAIL, MAIL_PAL: MAIL_PAL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PixelArt = API;
})(typeof window !== 'undefined' ? window : globalThis);
