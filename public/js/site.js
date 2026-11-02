/* ===================== The Bay: 3D world (no DOM) ===================== */
var World = (function () {
  'use strict';
  var V3 = function (x, y, z) { return new BABYLON.Vector3(x, y, z); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var lerpAngle = function (a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; };
  var rad = function (d) { return d * Math.PI / 180; };

  /* camera keyframes: one per chapter, expressed around the car.
     az: degrees from the car's nose (0 = in front, 90 = driver side, 180 = behind)
     r: distance from the car centre, h: camera height, tgt: [forward, up] target offset,
     shift: push the car sideways in frame (+ = car moves left, text on right), fov in radians */
  var KEYS = [
    { az: -38, r: 7.4, h: 1.55, tgt: [0.25, 0.55], shift: 1.05, fov: 0.62 },  // Arrive
    { az: 92, r: 4.3, h: 1.35, tgt: [-0.25, 0.80], shift: -0.75, fov: 0.74 }, // Driver (driver side)
    { az: 10, r: 5.4, h: 0.55, tgt: [0.00, 0.62], shift: 0.95, fov: 0.70 },   // Work (low, headlights)
    { az: 147, r: 6.2, h: 2.45, tgt: [0.00, 0.50], shift: -0.9, fov: 0.66 },  // Builds (rear quarter)
    { az: -122, r: 7.4, h: 6.6, tgt: [0.00, 0.20], shift: 0.9, fov: 0.60 },   // Spec (overhead)
    { az: -62, r: 9.0, h: 1.25, tgt: [0.00, 0.40], shift: -0.85, fov: 0.60 }, // Recognition (wide)
    { az: 22, r: 10.8, h: 0.9, tgt: [0.00, 0.55], shift: 0.9, fov: 0.56 }     // Contact (wider)
  ];
  var FWD = V3(0, 0, 1), RIGHT = V3(1, 0, 0), UP = V3(0, 1, 0);

  function poseAt(t, portrait) {
    // t in [0, KEYS.length-1]; piecewise cylindrical interpolation (orbits around the car, never through it)
    var i = clamp(Math.floor(t), 0, KEYS.length - 1), j = Math.min(i + 1, KEYS.length - 1), s = smooth(t - i);
    var a = KEYS[i], b = KEYS[j];
    var az = lerpAngle(a.az, b.az, s), r = lerp(a.r, b.r, s), h = lerp(a.h, b.h, s);
    var tf = lerp(a.tgt[0], b.tgt[0], s), tu = lerp(a.tgt[1], b.tgt[1], s);
    var shift = lerp(a.shift, b.shift, s), fov = lerp(a.fov, b.fov, s);
    if (portrait) { r *= 1.55; shift = 0; tu -= 0.3; fov = Math.min(fov + 0.08, 0.9); }
    var pos = V3(Math.sin(rad(az)) * r, h, Math.cos(rad(az)) * r);
    var tgt = V3(0, tu, tf);
    // shift view sideways so the car sits beside the text
    var dir = tgt.subtract(pos).normalize();
    var right = BABYLON.Vector3.Cross(UP, dir).normalize();
    pos.addInPlace(right.scale(shift));
    tgt.addInPlace(right.scale(shift));
    return { pos: pos, tgt: tgt, fov: fov };
  }

  function makeNoiseNormal(scene, N) {
    // two-octave value noise baked into a tangent-space normal map: fine grit on the polished floor
    var g = 24, grid = new Float32Array(g * g);
    for (var i = 0; i < g * g; i++) grid[i] = Math.random();
    var sample = function (x, y) {
      var gx = Math.floor(x), gy = Math.floor(y), fx = x - gx, fy = y - gy;
      var at = function (a, b) { return grid[((b % g) + g) % g * g + ((a % g) + g) % g]; };
      var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return lerp(lerp(at(gx, gy), at(gx + 1, gy), u), lerp(at(gx, gy + 1), at(gx + 1, gy + 1), u), v);
    };
    var hgt = new Float32Array(N * N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      hgt[y * N + x] = sample(x / N * g, y / N * g) * 0.7 + sample(x / N * g * 3, y / N * g * 3) * 0.3;
    }
    var data = new Uint8Array(N * N * 4);
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var l = hgt[y * N + ((x - 1 + N) % N)], r = hgt[y * N + ((x + 1) % N)];
      var u2 = hgt[((y - 1 + N) % N) * N + x], d = hgt[((y + 1) % N) * N + x];
      var nx = (l - r) * 2.2, ny = (u2 - d) * 2.2;
      var o = (y * N + x) * 4;
      data[o] = clamp(128 + nx * 127, 0, 255); data[o + 1] = clamp(128 + ny * 127, 0, 255); data[o + 2] = 255; data[o + 3] = 255;
    }
    var tex = new BABYLON.RawTexture(data, N, N, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  /* ---- build everything ---- */
  function build(opts) {
    var scene = opts.scene, engine = scene.getEngine();
    var lite = !!opts.lite, test = !!opts.test; // lite = mobile/low power, test = headless (no GPU-only features)
    var W = { scene: scene, ready: false, paint: null, head: [], tail: [], strips: [], lamps: {}, t0: -1, state: {} };

    scene.clearColor = new BABYLON.Color4(0.012, 0.012, 0.014, 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.055;
    scene.fogColor = new BABYLON.Color3(0.012, 0.012, 0.014);
    scene.environmentIntensity = 0;

    /* camera */
    var cam = new BABYLON.UniversalCamera('cam', V3(0, 2, -9), scene);
    cam.minZ = 0.15; cam.maxZ = 160; cam.fov = 0.62;
    cam.setTarget(V3(0, 0.5, 0));
    W.cam = cam;

    W.lite = lite; W.envMul = 1; W.keyMul = 1; W.lampMul = 1; W.wheelSpin = 0; W.props = []; W.setState = {};

    /* lights */
    var hemi = new BABYLON.HemisphericLight('hemi', V3(0, 1, 0), scene);
    hemi.intensity = 0.06; hemi.groundColor = new BABYLON.Color3(0, 0, 0);
    var key = new BABYLON.DirectionalLight('key', V3(-0.35, -1, 0.45), scene);
    key.position = V3(3, 10, -4); key.intensity = 0; key.diffuse = new BABYLON.Color3(1, 0.96, 0.9);
    key.shadowMinZ = 2; key.shadowMaxZ = 24;
    W.key = key;
    var lamp = new BABYLON.SpotLight('lamp', V3(0, 6.5, 0), V3(0, -1, 0), 1.15, 6, scene);
    lamp.intensity = 0; lamp.diffuse = new BABYLON.Color3(1, 0.84, 0.6);
    W.lamp = lamp;
    var hl = [V3(-0.62, 0.62, 2.1), V3(0.62, 0.62, 2.1)].map(function (p, i) {
      var s = new BABYLON.SpotLight('head' + i, p, V3(i ? 0.08 : -0.08, -0.22, 1), 1.05, 10, scene);
      s.intensity = 0; s.diffuse = new BABYLON.Color3(1, 0.93, 0.78); s.range = 40;
      return s;
    });
    W.headSpots = hl;

    /* overhead strip lights: emissive bars that the floor reflects */
    var stripMat = function (name, col) {
      var m = new BABYLON.StandardMaterial(name, scene);
      m.disableLighting = true; m.emissiveColor = new BABYLON.Color3(0, 0, 0); m.diffuseColor = new BABYLON.Color3(0, 0, 0);
      m._col = col; return m;
    };
    var stripDefs = [
      { p: V3(0, 5.6, 1.1), w: 9.5, d: 0.42, col: new BABYLON.Color3(1, 0.95, 0.88), e: 4.2 },
      { p: V3(0, 5.6, -2.3), w: 7.5, d: 0.3, col: new BABYLON.Color3(1, 0.96, 0.9), e: 3.4 },
      { p: V3(0, 3.4, -7.0), w: 4.6, d: 0.16, col: new BABYLON.Color3(0.82, 0.9, 1), e: 5.0 }
    ];
    stripDefs.forEach(function (s, i) {
      var box = BABYLON.MeshBuilder.CreateBox('strip' + i, { width: s.w, height: 0.08, depth: s.d }, scene);
      box.position.copyFrom(s.p); box.material = stripMat('stripMat' + i, s.col); box.material._e = s.e;
      box.isPickable = false;
      W.strips.push(box);
    });

    /* floor: polished concrete, real-time planar reflection */
    var floor = BABYLON.MeshBuilder.CreateGround('floor', { width: 90, height: 90, subdivisions: 2 }, scene);
    var fm = new BABYLON.PBRMaterial('floorMat', scene);
    fm.albedoColor = new BABYLON.Color3(0.03, 0.031, 0.034);
    fm.metallic = 0; fm.roughness = 0.3; fm.environmentIntensity = 2.6; // scene.environmentIntensity peaks at ~0.3
    W.floorMat = fm;
    if (!test) {
      W.floorBump = makeNoiseNormal(scene, 256);
      fm.bumpTexture = W.floorBump;
      fm.bumpTexture.uScale = fm.bumpTexture.vScale = 26; fm.bumpTexture.level = 0.35;
      var mirror = new BABYLON.MirrorTexture('mirror', { ratio: lite ? 0.35 : 0.6 }, scene, true);
      mirror.mirrorPlane = new BABYLON.Plane(0, -1, 0, 0);
      mirror.level = 1; mirror.blurKernel = lite ? 12 : 26;
      fm.reflectionTexture = mirror;
      W.mirror = mirror;
    }
    floor.material = fm; floor.receiveShadows = true; floor.isPickable = true;
    W.floor = floor;

    /* shadows */
    if (!test) {
      var sg = new BABYLON.ShadowGenerator(lite ? 1024 : 2048, key);
      sg.useBlurExponentialShadowMap = true; sg.blurKernel = lite ? 16 : 32; sg.depthScale = 40; sg.setDarkness(0.35);
      W.sg = sg;
    }

    /* dust in the lamp light */
    if (!test) {
      try {
        var dt = new BABYLON.DynamicTexture('dot', 64, scene, false);
        var ctx = dt.getContext(); var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); dt.update(); dt.hasAlpha = true;
        var ps = new BABYLON.ParticleSystem('dust', lite ? 180 : 420, scene);
        ps.particleTexture = dt;
        ps.emitter = V3(0, 2.2, 0);
        ps.minEmitBox = V3(-7, -2, -7); ps.maxEmitBox = V3(7, 3.2, 7);
        ps.color1 = new BABYLON.Color4(1, 0.9, 0.75, 0.22); ps.color2 = new BABYLON.Color4(0.8, 0.85, 1, 0.14); ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        ps.minSize = 0.012; ps.maxSize = 0.05; ps.minLifeTime = 9; ps.maxLifeTime = 18; ps.emitRate = lite ? 14 : 30;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD; ps.gravity = V3(0, -0.02, 0);
        ps.direction1 = V3(-0.08, -0.02, -0.08); ps.direction2 = V3(0.08, 0.05, 0.08);
        ps.minEmitPower = 0.3; ps.maxEmitPower = 0.8; ps.updateSpeed = 0.006;
        ps.preWarmCycles = 120; ps.preWarmStepOffset = 4;
        ps.start(); W.dust = ps;
      } catch (e) { /* dust is decorative */ }
    }
    return W;
  }

  /* ---- attach the loaded car ---- */
  function attachCar(W, meshes) {
    var scene = W.scene;
    var root = meshes[0];
    var car = new BABYLON.TransformNode('car', scene);
    root.parent = car;
    var b = car.getHierarchyBoundingVectors();
    var size = b.max.subtract(b.min);
    car.scaling.setAll(4.5 / Math.max(size.x, size.z));
    b = car.getHierarchyBoundingVectors();
    var c = b.min.add(b.max).scale(0.5);
    car.position.set(-c.x, -b.min.y, -c.z);
    b = car.getHierarchyBoundingVectors();
    W.car = car; W.bounds = b;
    W.carMeshes = meshes.filter(function (m) { return m.getTotalVertices && m.getTotalVertices() > 0; });

    var mats = {};
    scene.materials.forEach(function (m) { mats[m.name] = m; });
    scene.materials.forEach(function (m) {
      if (m.getClassName() !== 'PBRMaterial') return;
      var n = m.name;
      m.environmentIntensity = 1;
      if (/CarPaint/.test(n) && !/Trim/.test(n)) {
        if (/CarPaintNormal/.test(n)) { m.metallic = 0.2; m.roughness = 0.55; }
        else { m.metallic = 0.55; m.roughness = 0.22; m.clearCoat.isEnabled = true; m.clearCoat.intensity = 1; m.clearCoat.roughness = 0.04; m.clearCoat.indexOfRefraction = 1.5; W.paint = m; }
        m._paint = true;
      } else if (/LightGlass_Clear/.test(n)) { m.emissiveColor = new BABYLON.Color3(1, 0.92, 0.72); m._eBase = 0; W.head.push(m); }
      else if (/LightGlassNormal_Red/.test(n)) { m.emissiveColor = new BABYLON.Color3(1, 0.1, 0.12); W.tail.push(m); }
      else if (/LightGlassNormal_Orange/.test(n)) { m.emissiveColor = new BABYLON.Color3(1, 0.45, 0.1); m.emissiveIntensity = 0.15; }
      else if (/Glass_Window/.test(n) && !/Surround/.test(n)) { m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.alpha = Math.min(m.alpha, 0.42); m.roughness = Math.min(m.roughness, 0.08); m.metallic = 0; }
      else if (/Mirror/.test(n)) { m.metallic = 1; m.roughness = 0.03; }
      else if (/Nickel|Aluminum/.test(n)) { m.metallic = 1; m.roughness = Math.min(m.roughness, 0.3); }
      else if (/rim|Rim/.test(n)) { m.metallic = 0.9; m.roughness = Math.min(m.roughness, 0.28); }
    });
    W.paintMats = scene.materials.filter(function (m) { return m._paint; });
    setPaint(W, '#c8102e');
    W.state.head = 0; setHeadlights(W, true, false);

    W.carMeshes.forEach(function (m) {
      m.isPickable = false;
      if (W.sg) W.sg.addShadowCaster(m, false);
    });
    if (W.mirror) W.mirror.renderList = W.carMeshes.concat(W.strips);
    // wheel pivots: each tyre's true centroid and axle axis (the car is stanced, so the wheels have camber)
    var tyres = W.carMeshes.filter(function (m) { return /Wheel1A/.test(m.name); });
    var rims = W.carMeshes.filter(function (m) { return /bbs_rim|BBC_rim|BBS_Rim|bbc_rim|off[0-9]_/i.test(m.name) && !/Trim|Calliper|Wheel1A/i.test(m.name); });
    W.wheelPivots = tyres.map(function (t, ti) {
      var pos = t.getVerticesData(BABYLON.VertexBuffer.PositionKind), wm = t.getWorldMatrix(), n = pos.length / 3;
      var c = BABYLON.Vector3.Zero(), pts = new Array(n);
      for (var i = 0; i < n; i++) { pts[i] = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), wm); c.addInPlace(pts[i]); }
      c.scaleInPlace(1 / n);
      var xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
      for (i = 0; i < n; i++) { var d = pts[i].subtract(c); xx += d.x * d.x; yy += d.y * d.y; zz += d.z * d.z; xy += d.x * d.y; xz += d.x * d.z; yz += d.y * d.z; }
      var tr = xx + yy + zz, B = [[tr - xx, -xy, -xz], [-xy, tr - yy, -yz], [-xz, -yz, tr - zz]], v = [1, 0.05, 0.05];
      for (var k = 0; k < 120; k++) { var nv = [0, 1, 2].map(function (r) { return B[r][0] * v[0] + B[r][1] * v[1] + B[r][2] * v[2]; }); var ln = Math.hypot(nv[0], nv[1], nv[2]) || 1; v = [nv[0] / ln, nv[1] / ln, nv[2] / ln]; }
      var axis = new BABYLON.Vector3(v[0], v[1], v[2]); if (axis.x < 0) axis.scaleInPlace(-1);
      var pv = new BABYLON.TransformNode('wheel' + ti, scene); pv.position = c.clone();
      pv.rotationQuaternion = BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.X, axis, new BABYLON.Quaternion());
      var mine = rims.filter(function (r) { return BABYLON.Vector3.Distance(r.getBoundingInfo().boundingBox.centerWorld, c) < 0.5; });
      pv.setParent(car); t.setParent(pv); mine.forEach(function (r) { r.setParent(pv); });
      return pv;
    });
    W.ready = true;
    return W;
  }

  function setPaint(W, hex) {
    var col = BABYLON.Color3.FromHexString(hex).toLinearSpace();
    W.paintMats.forEach(function (m) { m.albedoColor = col.clone(); });
    W.paintHex = hex;
  }
  function setHeadlights(W, on, instant) {
    W.state.headTarget = on ? 1 : 0;
    if (instant) W.state.head = W.state.headTarget;
  }

  /* ---- intro: the studio powering up ---- */
  function flicker(t, start, dur) {
    // 0 before start, flickery for `dur` seconds, 1 after
    if (t < start) return 0;
    var u = (t - start) / dur;
    if (u >= 1) return 1;
    var n = Math.sin(t * 61.3) + Math.sin(t * 23.7) * 0.7 + Math.sin(t * 97.1) * 0.4;
    return n > (0.9 - u * 1.3) ? 1 : (u > 0.6 ? 0.25 : 0.04);
  }

  /* ---- per-frame update ---- */
  var tmpPos = new BABYLON.Vector3(), tmpTgt = new BABYLON.Vector3();
  function update(W, dt, S) {
    // S: { t (camera track position), portrait, px, py (pointer -0.5..0.5), yaw, pitch (drag offset), chapter, time, intro (seconds since lights-on started or -1), reduce }
    var st = W.state;
    var intro = S.intro;
    var f1 = intro < 0 ? 0 : flicker(intro, 0.25, 0.9);
    var f2 = intro < 0 ? 0 : flicker(intro, 0.95, 0.7);
    var f3 = intro < 0 ? 0 : flicker(intro, 1.45, 0.5);
    var fin = intro < 0 ? 0 : smooth((intro - 1.9) / 0.9);
    var ambWant = (S.chapter >= 6 ? 0.55 : 1);
    st.amb = st.amb === undefined ? ambWant : lerp(st.amb, ambWant, Math.min(1, dt * 2.5));
    var ambientTarget = st.amb;
    var env = (0.12 * f1 + 0.1 * f2 + 0.08 * f3) * ambientTarget;
    st.env = st.env === undefined ? env : lerp(st.env, env, Math.min(1, dt * 6));
    W.scene.environmentIntensity = st.env * W.envMul;
    W.key.intensity = (0.35 * f1 + 0.45 * f2 + 0.3 * f3) * ambientTarget * W.keyMul;
    if (W.set && W.set.tick) W.set.tick(W, dt, S);
    if (W.wheelSpin && W.wheelPivots) W.wheelPivots.forEach(function (p) { p.rotate(BABYLON.Axis.X, W.wheelSpin * dt, BABYLON.Space.LOCAL); });
    var fl = [f1, f2, f3];
    W.strips.forEach(function (b, i) { var m = b.material; m.emissiveColor.copyFrom(m._col).scaleInPlace(m._e * fl[i] * (i === 2 ? 1 : ambientTarget)); });

    // headlights pop on after the strips
    var want = Math.min(S.intro < 0 ? 0 : fin, st.headTarget === undefined ? 1 : st.headTarget);
    st.head = st.head === undefined ? want : lerp(st.head, want, Math.min(1, dt * 5));
    var h = st.head;
    W.head.forEach(function (m) { m.emissiveIntensity = h * 6; });
    W.tail.forEach(function (m) { m.emissiveIntensity = 0.4 * fin + h * 1.6; });
    W.headSpots.forEach(function (s) { s.intensity = h * 22; });

    // the cursor lamp
    var lampOn = fin * (S.lampOn ? 1 : 0) * W.lampMul;
    W.lamp.intensity = lerp(W.lamp.intensity, lampOn * 55, Math.min(1, dt * 4));
    if (S.lampAt) {
      var L = W.lamp; var tx = S.lampAt.x, tz = S.lampAt.z;
      var dir = new BABYLON.Vector3(tx - L.position.x, -L.position.y, tz - L.position.z).normalize();
      L.direction = BABYLON.Vector3.Lerp(L.direction, dir, Math.min(1, dt * 5)).normalize();
    }

    // camera
    var pose = poseAt(S.t, S.portrait);
    var pos = pose.pos, tgt = pose.tgt;
    if (!S.reduce) {
      var drift = S.time * 0.11;
      pos.x += Math.sin(drift) * 0.18; pos.z += Math.cos(drift * 0.8) * 0.18; pos.y += Math.sin(drift * 0.6) * 0.05;
    }
    // drag orbit: rotate the camera around the target
    if (S.yaw || S.pitch) {
      var rel = pos.subtract(tgt);
      var cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      var rx = rel.x * cy - rel.z * sy, rz = rel.x * sy + rel.z * cy;
      rel.x = rx; rel.z = rz;
      var hd = Math.sqrt(rel.x * rel.x + rel.z * rel.z), rr = rel.length();
      var el = clamp(Math.atan2(rel.y, hd) + S.pitch, 0.04, 1.35);
      var sc = Math.cos(el) * rr / Math.max(hd, 1e-4);
      rel.x *= sc; rel.z *= sc; rel.y = Math.sin(el) * rr;
      pos = tgt.add(rel);
    }
    // pointer parallax
    if (!S.reduce) {
      var dir2 = tgt.subtract(pos).normalize();
      var right = BABYLON.Vector3.Cross(UP, dir2).normalize();
      pos.addInPlace(right.scale(S.px * 0.5)); pos.y += -S.py * 0.3;
    }
    // ease
    var k = 1 - Math.pow(0.0025, dt);
    if (!st.cp) { st.cp = pos.clone(); st.ct = tgt.clone(); st.fov = pose.fov; }
    BABYLON.Vector3.LerpToRef(st.cp, pos, k, st.cp); BABYLON.Vector3.LerpToRef(st.ct, tgt, k, st.ct); st.fov = lerp(st.fov, pose.fov, k);
    W.cam.position.copyFrom(st.cp); W.cam.setTarget(st.ct); W.cam.fov = st.fov;
    if (W.pipe && W.pipe.depthOfFieldEnabled) W.pipe.depthOfField.focusDistance = BABYLON.Vector3.Distance(st.cp, V3(0, 0.6, 0)) * 1000;
    return pose;
  }

  return { build: build, attachCar: attachCar, update: update, setPaint: setPaint, setHeadlights: setHeadlights, poseAt: poseAt, KEYS: KEYS, flicker: flicker };
})();

/* ===================== Sets: switchable environments (no DOM) ===================== */
var Sets = (function () {
  'use strict';
  var V3 = function (x, y, z) { return new BABYLON.Vector3(x, y, z); };
  var C3 = function (r, g, b) { return new BABYLON.Color3(r, g, b); };
  var hex = function (h) { return BABYLON.Color3.FromHexString(h); };
  var lin = function (h) { return BABYLON.Color3.FromHexString(h).toLinearSpace(); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // Babylon maps panorama column u to direction atan2(z, x) = (u - 0.5) * 2pi; our azimuth is measured from +Z (the nose), 90 = +X (driver side)
  function colAz(x, W) { var u = (x + 0.5) / W, az = (0.75 - u) * 360; while (az >= 180) az -= 360; while (az < -180) az += 360; return az; }
  /* ---------- HDR environment generator (Radiance RGBE, RLE) ----------
     spec.amb(el, phi) -> [r,g,b] base radiance; spec.lights: {az, w, el, h, f, rgb:[r,g,b], p} soft rectangles */
  function hdrDataUrl(spec) {
    var L = spec.lights || [], nL = L.length, i, x, y, W = 512, H = 256;
    // per-light separable masks: azimuth along columns, elevation along rows
    var colM = [], rowM = [];
    for (i = 0; i < nL; i++) {
      var l = L[i], f = l.f || 4, cm = new Float32Array(W), rm = new Float32Array(H);
      for (x = 0; x < W; x++) { var phi = colAz(x, W), dphi = Math.abs(((phi - l.az + 540) % 360) - 180); cm[x] = 1 - smooth((dphi - l.w / 2 + f) / f); }
      for (y = 0; y < H; y++) { var el = 90 - (y + 0.5) / H * 180, dele = Math.abs(el - l.el); rm[y] = (1 - smooth((dele - l.h / 2 + f) / f)) * l.p; }
      colM.push(cm); rowM.push(rm);
    }
    var out3 = [0, 0, 0];
    return hdrFromSampler(function (elv, phi, x, y) {
      var c = spec.amb(elv, phi), r = c[0], g = c[1], b = c[2];
      for (var i = 0; i < nL; i++) { var m = rowM[i][y]; if (m <= 0) continue; m *= colM[i][x]; if (m <= 0) continue; var rgb = L[i].rgb; r += rgb[0] * m; g += rgb[1] * m; b += rgb[2] * m; }
      out3[0] = r; out3[1] = g; out3[2] = b; return out3;
    });
  }
  /* sampler(el, phi, x, y) -> [r,g,b] linear radiance; returns a data URL of a 512x256 Radiance HDR */
  function hdrFromSampler(sampler) {
    var W = 512, H = 256, i, x, y;
    var buf = new Uint8Array(64 + H * (4 + W * 4 + 64)), n = 0;
    var head = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ' + H + ' +X ' + W + '\n';
    for (i = 0; i < head.length; i++) buf[n++] = head.charCodeAt(i);
    var rgbe = new Uint8Array(W * 4), row = new Uint8Array(W);
    for (y = 0; y < H; y++) {
      var elv = 90 - (y + 0.5) / H * 180;
      for (x = 0; x < W; x++) {
        var c = sampler(elv, colAz(x, W), x, y), r = c[0], g = c[1], b = c[2];
        var M = r > g ? (r > b ? r : b) : (g > b ? g : b), o = x * 4;
        if (M < 1e-32) { rgbe[o] = rgbe[o + 1] = rgbe[o + 2] = rgbe[o + 3] = 0; continue; }
        var e = Math.floor(Math.log2(M)) + 1, sc = 256 / Math.pow(2, e);
        rgbe[o] = Math.min(255, Math.round(r * sc)); rgbe[o + 1] = Math.min(255, Math.round(g * sc)); rgbe[o + 2] = Math.min(255, Math.round(b * sc)); rgbe[o + 3] = e + 128;
      }
      buf[n++] = 2; buf[n++] = 2; buf[n++] = (W >> 8) & 255; buf[n++] = W & 255;
      for (var ch = 0; ch < 4; ch++) {
        for (x = 0; x < W; x++) row[x] = rgbe[x * 4 + ch];
        var k = 0;
        while (k < W) {
          var run = 1; while (k + run < W && run < 127 && row[k + run] === row[k]) run++;
          if (run >= 4) { buf[n++] = 128 + run; buf[n++] = row[k]; k += run; }
          else {
            var j = k;
            while (j < W && j - k < 128) { var rr = 1; while (j + rr < W && rr < 4 && row[j + rr] === row[j]) rr++; if (rr >= 4) break; j++; }
            buf[n++] = j - k; for (var q = k; q < j; q++) buf[n++] = row[q]; k = j;
          }
        }
      }
    }
    var bin = '', CH = 8192;
    for (i = 0; i < n; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, Math.min(n, i + CH)));
    return 'data:application/octet-stream;base64,' + btoa(bin);
  }

  /* ---------- procedural textures ---------- */
  function normalFromHeight(scene, N, hf, strength) {
    var h = new Float32Array(N * N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) h[y * N + x] = hf(x / N, y / N);
    var data = new Uint8Array(N * N * 4);
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)], u = h[((y - 1 + N) % N) * N + x], d = h[((y + 1) % N) * N + x];
      var o = (y * N + x) * 4;
      data[o] = clamp(128 + (l - r) * strength * 127, 0, 255); data[o + 1] = clamp(128 + (u - d) * strength * 127, 0, 255); data[o + 2] = 255; data[o + 3] = 255;
    }
    var t = new BABYLON.RawTexture(data, N, N, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; return t;
  }
  function canvasTex(scene, N, draw) {
    var dt = new BABYLON.DynamicTexture('ct', { width: N, height: N }, scene, true);
    var ctx = dt.getContext(); draw(ctx, N); dt.update(false);
    dt.wrapU = dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; return dt;
  }
  var noise = (function () { var g = 32, grid = []; for (var i = 0; i < g * g; i++) grid.push(Math.random());
    return function (x, y) { x = x * g; y = y * g; var gx = Math.floor(x), gy = Math.floor(y), fx = x - gx, fy = y - gy;
      var at = function (a, b) { return grid[((b % g) + g) % g * g + ((a % g) + g) % g]; };
      var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return lerp(lerp(at(gx, gy), at(gx + 1, gy), u), lerp(at(gx, gy + 1), at(gx + 1, gy + 1), u), v); }; })();

  /* ---------- prop helpers ---------- */
  function box(W, name, w, h, d, pos, mat, rot) {
    var m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, W.scene);
    m.position.copyFrom(pos); if (rot) m.rotation.copyFrom(rot); m.material = mat; m.isPickable = false; return m;
  }
  function pbr(W, name, albedo, rough, metal) {
    var m = new BABYLON.PBRMaterial(name, W.scene); m.albedoColor = albedo; m.roughness = rough; m.metallic = metal || 0; return m;
  }
  function glow(W, name, col, k, tex) {
    var m = new BABYLON.StandardMaterial(name, W.scene); m.disableLighting = true; m.diffuseColor = C3(0, 0, 0);
    if (tex) { m.emissiveColor = C3(0, 0, 0); m.emissiveTexture = tex; tex.level = k; } else m.emissiveColor = col.scale(k);
    return m;
  }
  function tube(W, name, len, pos, rotZ, rotY, mat) {
    var t = BABYLON.MeshBuilder.CreateCylinder(name, { height: len, diameter: 0.06, tessellation: 10 }, W.scene);
    t.position.copyFrom(pos); t.rotation.set(0, rotY || 0, rotZ || 0); t.material = mat; t.isPickable = false; return t;
  }
  function room(W, size, height, mat, props) {
    var s = size, h = height;
    props.push(box(W, 'wallN', s, h, 0.2, V3(0, h / 2, s / 2), mat));
    props.push(box(W, 'wallS', s, h, 0.2, V3(0, h / 2, -s / 2), mat));
    props.push(box(W, 'wallE', 0.2, h, s, V3(s / 2, h / 2, 0), mat));
    props.push(box(W, 'wallW', 0.2, h, s, V3(-s / 2, h / 2, 0), mat));
    props.push(box(W, 'ceil', s, 0.2, s, V3(0, h, 0), mat));
  }
  function slats(W, props, count, pitch, y, rotY, rotX, size) {
    // a grid of thin bars above the set; the sun throws their stripes on everything below
    var mat = pbr(W, 'slatMat', C3(0.02, 0.02, 0.02), 0.9);
    var g = new BABYLON.TransformNode('slats', W.scene); g.position.y = y; g.rotation.set(rotX || 0, rotY || 0, 0);
    for (var i = 0; i < count; i++) {
      var b = BABYLON.MeshBuilder.CreateBox('slat' + i, { width: size, height: 0.12, depth: pitch * 0.55 }, W.scene);
      b.position.set(0, 0, (i - (count - 1) / 2) * pitch); b.material = mat; b.parent = g; b.isPickable = false; b.receiveShadows = false;
      if (W.sg) W.sg.addShadowCaster(b, false); props.push(b);
    }
    props.push(g);
  }
  function mountains(W, props, radius, hmin, hmax, col, seed) {
    var n = 96, bottom = [], top = [];
    for (var i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      var t = i / n * 7 + seed, h = hmin + (hmax - hmin) * Math.pow(Math.abs(Math.sin(t * 2.3) * 0.5 + Math.sin(t * 5.1) * 0.3 + Math.sin(t * 11.7) * 0.2), 1.6);
      bottom.push(V3(x, -2, z)); top.push(V3(x, h, z));
    }
    var m = BABYLON.MeshBuilder.CreateRibbon('mtn' + seed, { pathArray: [bottom, top], sideOrientation: BABYLON.Mesh.DOUBLESIDE }, W.scene);
    var mat = new BABYLON.StandardMaterial('mtnMat' + seed, W.scene); mat.disableLighting = true; mat.emissiveColor = col; mat.diffuseColor = C3(0, 0, 0); mat.backFaceCulling = false;
    m.material = mat; m.isPickable = false; m.applyFog = true; props.push(m); return m;
  }

  /* ---------- shared HDR pieces ---------- */
  var ambGrey = function (lo, hi, ceil) { return function (el) { var a = lo + hi * smooth((el + 15) / 30) + ceil * smooth((el - 40) / 50); return [a * 0.95, a * 0.97, a * 1.05]; }; };
  var stripeLights = function (count, az, w, el0, el1, thick, rgb, p) { var L = []; for (var i = 0; i < count; i++) L.push({ az: az, w: w, el: el0 + (el1 - el0) * i / (count - 1), h: thick, f: 0.8, rgb: rgb, p: p }); return L; };

  /* ---------- more prop helpers ---------- */
  function wallAt(W, name, az, dist, w, h, mat, yOff) {
    var a = az * Math.PI / 180, m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: 0.25 }, W.scene);
    m.position.set(Math.sin(a) * dist, h / 2 + (yOff || 0), Math.cos(a) * dist); m.rotation.y = a; m.material = mat; m.isPickable = false; m.receiveShadows = true; return m;
  }
  function spot(W, name, pos, target, angle, exp, intensity, col) {
    var dir = target.subtract(pos).normalize(), l = new BABYLON.SpotLight(name, pos, dir, angle, exp, W.scene);
    l.intensity = intensity; l.diffuse = col || C3(1, 1, 1); l.specular = l.diffuse; return l;
  }
  function bulbProto(W, P, mat, size) {
    var proto = BABYLON.MeshBuilder.CreateSphere('bulbProto', { diameter: size || 0.14, segments: 4 }, W.scene); proto.material = mat; proto.isPickable = false; proto.position.set(0, -50, 0);
    P.push(proto); return proto;
  }
  function strand(P, proto, a, b, sag, count) {
    // a string of bulbs from a to b, hanging with a catenary-like sag
    var list = [];
    for (var i = 0; i < count; i++) { var t = i / Math.max(1, count - 1), inst = proto.createInstance('b'); inst.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t); inst.isPickable = false; list.push(inst); P.push(inst); }
    return list;
  }

  /* ---------- the sets ---------- */
  var SETS = [
    { id: 'bay', name: 'The Bay', blurb: 'Night studio, twin strips',
      hdr: { amb: ambGrey(0.012, 0.03, 0.025), lights: [
        { az: 0, w: 150, el: 72, h: 22, f: 5, rgb: [1, 0.96, 0.9], p: 28 }, { az: 180, w: 110, el: 70, h: 14, f: 5, rgb: [1, 0.97, 0.93], p: 14 },
        { az: 90, w: 55, el: 28, h: 40, f: 7, rgb: [0.8, 0.88, 1], p: 7 }, { az: -90, w: 45, el: 24, h: 34, f: 7, rgb: [1, 0.9, 0.8], p: 3.5 },
        { az: 180, w: 40, el: 38, h: 8, f: 3, rgb: [0.85, 0.92, 1], p: 22 }, { az: 0, w: 360, el: 6, h: 3.5, f: 1.5, rgb: [1, 1, 1], p: 4.5 },
        { az: 35, w: 6, el: 55, h: 5, f: 1.2, rgb: [1, 0.98, 0.95], p: 60 }, { az: 160, w: 70, el: -12, h: 2.2, f: 1.2, rgb: [1, 0.12, 0.18], p: 2.5 }] },
      env: 1, key: { dir: V3(-0.35, -1, 0.45), i: 1, col: C3(1, 0.96, 0.9) }, fog: { col: '#030304', d: 0.055 }, clear: '#030304',
      floor: { albedo: '#0b0b0c', rough: 0.3, mirror: 1, blur: 26, bump: 0.35, envI: 2.6 }, grade: { exposure: 1.1, contrast: 1.15, sat: 0, vig: 2.4 }, strips: true, lamp: 1 },

    /* 1 — black studio, corner behind the car, banded softboxes, polished black floor */
    { id: 'stripes', name: 'Studio', blurb: 'Image 1: black studio corner, banded light',
      hdr: { amb: ambGrey(0.006, 0.012, 0.012), lights: stripeLights(9, -20, 170, 18, 74, 2.4, [1, 1, 1], 34).concat(stripeLights(6, 160, 120, 26, 70, 2.2, [1, 1, 1], 18), [{ az: 0, w: 360, el: 4, h: 1.6, f: 0.8, rgb: [1, 1, 1], p: 6 }]) },
      env: 1.1, key: { dir: V3(-0.2, -1, 0.5), i: 0.7, col: C3(1, 1, 1) }, fog: { col: '#000000', d: 0.018 }, clear: '#000000',
      floor: { albedo: '#050506', rough: 0.12, mirror: 1, blur: 6, bump: 0.05, envI: 2.6 }, grade: { exposure: 1.15, contrast: 1.3, sat: -15, vig: 2.6 }, lamp: 0,
      build: function (W, P) {
        var m = pbr(W, 'studioWall', C3(0.028, 0.028, 0.03), 0.8);
        P.push(wallAt(W, 'wA', 97, 13, 40, 14, m)); P.push(wallAt(W, 'wB', 187, 13, 40, 14, m));
        P.push(wallAt(W, 'wC', -83, 24, 60, 14, m)); P.push(wallAt(W, 'wD', 7, 24, 60, 14, m));
        var ceil = box(W, 'studioCeil', 70, 0.3, 70, V3(0, 14, 0), m); P.push(ceil);
        // a dim lamp on the corner so it reads as a room, not a void
        var l = spot(W, 'cornerLamp', V3(-6, 12, -2), V3(4, 2, -8), 1.3, 2, 90, C3(0.9, 0.92, 1)); P.push(l);
        var bar = glow(W, 'studioBar', C3(1, 1, 1), 3.2);
        for (var i = 0; i < 7; i++) { var b = box(W, 'sbar' + i, 12, 0.06, 0.18, V3(0, 7.5, -6 + i * 2), bar); P.push(b); }
      } },

    /* 2 — one soft pool of light on a dark satin floor, everything else falls to black */
    { id: 'noir', name: 'Spotlight', blurb: 'Image 2: one lamp, satin floor, no colour',
      hdr: { amb: ambGrey(0.003, 0.005, 0.004), lights: [{ az: -40, w: 60, el: 70, h: 30, f: 8, rgb: [1, 1, 1], p: 14 }] },
      env: 0.9, key: { dir: V3(0.3, -1, -0.25), i: 1.6, col: C3(1, 1, 1) }, fog: { col: '#000000', d: 0.03 }, clear: '#000000',
      floor: { albedo: '#1c1c1d', rough: 0.55, mirror: 0.35, blur: 40, bump: 0.35, envI: 1.4 }, grade: { exposure: 1.05, contrast: 1.35, sat: -92, vig: 4.2 }, lamp: 0,
      build: function (W, P) {
        var m = pbr(W, 'noirWall', C3(0.01, 0.01, 0.01), 0.95); room(W, 60, 16, m, P);
        P.push(spot(W, 'pool', V3(-7, 14, 6), V3(-0.5, 0, 0.5), 1.05, 3, 260, C3(1, 1, 1)));
      } },

    /* 4 — concrete underpass: panelled wall, slab ceiling, daylight through slats, open to the right */
    { id: 'underpass', name: 'Underpass', blurb: 'Image 4: concrete, daylight through slats',
      hdr: { amb: function (el) { var t = smooth((el + 5) / 40); return [0.55 + 0.9 * t, 0.52 + 0.9 * t, 0.5 + 0.95 * t]; },
        lights: [{ az: 0, w: 360, el: 30, h: 36, f: 10, rgb: [1, 0.97, 0.92], p: 3.5 }, { az: -90, w: 70, el: 15, h: 40, f: 10, rgb: [1, 0.98, 0.95], p: 9 }, { az: -60, w: 40, el: 55, h: 20, f: 8, rgb: [1, 0.96, 0.9], p: 12 }] },
      env: 2.4, key: { dir: V3(-0.6, -1, -0.3), i: 3.4, col: C3(1, 0.95, 0.86) }, fog: { col: '#b9b2a6', d: 0.01 }, clear: '#cfc9bf',
      floor: { albedo: '#6f6a60', rough: 0.72, mirror: 0.18, blur: 40, bump: 0.9, envI: 1 }, grade: { exposure: 0.9, contrast: 1.12, sat: -12, vig: 1.6 }, lamp: 0, shadowBlur: 8,
      build: function (W, P) {
        var cm = pbr(W, 'concrete', lin('#a89f90'), 0.8); cm.bumpTexture = normalFromHeight(W.scene, 256, function (u, v) { return noise(u, v) * 0.5 + noise(u * 5, v * 5) * 0.3 + (Math.abs(((u * 3) % 1) - 0.5) < 0.01 ? -1.2 : 0) + (Math.abs(((v * 2) % 1) - 0.5) < 0.008 ? -0.8 : 0); }, 0.7);
        cm.bumpTexture.uScale = 4; cm.bumpTexture.vScale = 2;
        var wall = box(W, 'uwall', 48, 9, 0.3, V3(0, 4.5, -7.5), cm); wall.receiveShadows = true; P.push(wall);
        var left = box(W, 'uwallL', 0.3, 9, 30, V3(-16, 4.5, 4), cm); left.receiveShadows = true; P.push(left);
        var ceil = box(W, 'uceil', 48, 0.4, 32, V3(0, 9, 2), cm); P.push(ceil);
        for (var i = 0; i < 5; i++) P.push(box(W, 'beam' + i, 48, 0.6, 0.5, V3(0, 8.6, -6 + i * 4), cm));
        for (i = 0; i < 4; i++) P.push(box(W, 'pillar' + i, 0.7, 9, 0.7, V3(14 + (i % 2) * 2, 4.5, -5 + i * 6), cm));
        // the open side: daylight
        P.push(box(W, 'daylight', 0.2, 16, 60, V3(24, 6, 2), glow(W, 'dayG', C3(1, 0.98, 0.95), 2.2)));
        slats(W, P, 9, 2.4, 8.4, 0.35, 0.12, 50);
      } },

    /* 5 — night street: strings of bulbs over the road, light streaks, buildings, wet asphalt */
    { id: 'night', name: 'Night drive', blurb: 'Image 5: wet street, festival lights, moving',
      hdr: { amb: function (el) { var t = smooth((el + 5) / 50); return [0.09 + 0.14 * t, 0.08 + 0.12 * t, 0.09 + 0.14 * t]; },
        lights: [{ az: 0, w: 360, el: 55, h: 6, f: 3, rgb: [1, 0.97, 0.9], p: 9 }, { az: 90, w: 180, el: 28, h: 6, f: 3, rgb: [0.4, 0.9, 1], p: 7 }, { az: -90, w: 180, el: 26, h: 6, f: 3, rgb: [1, 0.35, 0.8], p: 6 }, { az: 150, w: 60, el: 12, h: 10, f: 6, rgb: [1, 0.5, 0.3], p: 3 }, { az: 0, w: 360, el: 10, h: 8, f: 4, rgb: [0.8, 0.6, 1], p: 2 }] },
      env: 2.0, key: { dir: V3(0.3, -1, -0.2), i: 1.3, col: C3(1, 0.92, 0.8) }, fog: { col: '#1a1612', d: 0.022 }, clear: '#1a1612',
      floor: { albedo: '#0a0a0c', rough: 0.04, mirror: 1, blur: 2, bump: 0, envI: 2.6 }, grade: { exposure: 1.15, contrast: 1.15, sat: 18, vig: 1.8 }, lamp: 0, drive: 1, lights: 8,
      build: function (W, P) {
        var moving = [], flows = [];
        // a strand material: a soft pulse pattern that travels along the strand
        var strandMat = function (name, stops, speed, level) {
          // a looping colour gradient along the strand; scrolling it makes the colour flow
          var tex = canvasTex(W.scene, 256, function (ctx, N) {
            var g = ctx.createLinearGradient(0, 0, 0, N);
            stops.forEach(function (st, i) { g.addColorStop(i / (stops.length - 1), st); });
            ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
          });
          tex.vScale = 3; tex.uScale = 1;
          var m = glow(W, name, C3(1, 1, 1), level, tex); flows.push({ tex: tex, v: speed }); return m;
        };
        var mats = [
          strandMat('sCyan', ['#00e5ff', '#2a5bff', '#8a2bff', '#00e5ff'], 1.2, 8),
          strandMat('sMagenta', ['#ff2bd6', '#ff5a3c', '#ffb300', '#ff2bd6'], 0.9, 7.5),
          strandMat('sLime', ['#5bff7a', '#00e5ff', '#1d4dff', '#5bff7a'], 1.5, 7),
          strandMat('sSun', ['#ffb300', '#ff2bd6', '#ff5a3c', '#ffb300'], 1.0, 7)
        ];
        var strandTube = function (name, path, r, mat) {
          var t = BABYLON.MeshBuilder.CreateTube(name, { path: path, radius: r, tessellation: 6, cap: BABYLON.Mesh.CAP_ALL }, W.scene);
          t.material = mat; t.isPickable = false; P.push(t); return t;
        };
        // long dark walls either side of the street
        var wallM = pbr(W, 'nightWall', lin('#2a2420'), 0.85);
        wallM.bumpTexture = normalFromHeight(W.scene, 256, function (u, v) { return noise(u * 2, v * 2) * 0.6 + noise(u * 9, v * 9) * 0.3; }, 0.5); wallM.bumpTexture.uScale = 12; wallM.bumpTexture.vScale = 2;
        P.push(box(W, 'wallL', 0.4, 10, 120, V3(-12.6, 5, 0), wallM)); P.push(box(W, 'wallR', 0.4, 10, 120, V3(12.6, 5, 0), wallM));
        // strands of light weaving along each wall, overlapping like hair
        for (var side = -1; side <= 1; side += 2) {
          for (var k = 0; k < 8; k++) {
            var path = [], base = 1.4 + k * 0.85, amp = 0.5 + (k % 5) * 0.35, f1 = 0.045 + (k % 4) * 0.018, f2 = 0.13 + (k % 3) * 0.05, ph = k * 1.7;
            for (var z = -56; z <= 56; z += 1.25) {
              var y = base + amp * Math.sin(z * f1 + ph) + 0.35 * Math.sin(z * f2 + ph * 2.1) + 0.6 * Math.sin(z * 0.02 + k);
              var x = side * (12.25 - 0.12 * (k % 4) - 0.18 * Math.abs(Math.sin(z * 0.07 + k)));
              path.push(V3(x, Math.max(0.3, y), z));
            }
            strandTube('strand' + side + '_' + k, path, 0.04 + (k % 3) * 0.01, mats[(k * 3 + (side > 0 ? 1 : 0)) % 4]);
          }
        }
        // strands arching across the street
        for (var i = 0; i < 5; i++) {
          var zc = -40 + i * 20, pathA = [], sagA = 1.6 + (i % 3) * 0.6, yA = 7.8 + (i % 2) * 0.7;
          for (var j = 0; j <= 28; j++) { var t = j / 28; pathA.push(V3(-12.2 + 24.4 * t, yA - sagA * 4 * t * (1 - t) + 0.25 * Math.sin(t * 9 + i), zc + 1.2 * Math.sin(t * 6 + i))); }
          strandTube('cross' + i, pathA, 0.045, mats[i % 4]);
        }
        // light streaks overhead and lane markings keep moving; the pulses flow along the strands
        var streakM = glow(W, 'streak', C3(1, 0.97, 0.9), 4.5);
        for (i = 0; i < 8; i++) { var sd = i % 2 ? 1 : -1, sPath = [V3(sd * (3 + (i % 4) * 1.6), 5.5 + (i % 3) * 1.2, -30 + i * 4), V3(sd * (3.2 + (i % 4) * 1.6), 5.6 + (i % 3) * 1.2, -22 + i * 4)]; var st = strandTube('streak' + i, sPath, 0.02, streakM); moving.push(st); }
        var lane = glow(W, 'lane', C3(1, 0.95, 0.8), 1.2); for (i = 0; i < 14; i++) { var l = box(W, 'lane' + i, 0.14, 0.01, 2.2, V3(-3.4, 0.006, -42 + i * 6.5), lane); moving.push(l); P.push(l); }
        // the strands light the street
        [[-10.5, 4, -24, '#00e5ff'], [10.5, 5, -12, '#ff2bd6'], [-10.5, 3, 4, '#5bff7a'], [10.5, 4.5, 16, '#2a5bff'], [-10.5, 5, 30, '#ff5a3c'], [10.5, 3.5, -34, '#ffb300']].forEach(function (p, n) {
          var pl = new BABYLON.PointLight('strandL' + n, V3(p[0], p[1], p[2]), W.scene); pl.intensity = 55; pl.diffuse = lin(p[3]); pl.specular = pl.diffuse; pl.range = 34; P.push(pl);
        });
        W.setState.streaks = moving; W.setState.flows = flows;
      },
      tick: function (W, dt) {
        var v = 12 * dt; (W.setState.streaks || []).forEach(function (s) { s.position.z -= v; if (s.position.z < -46) s.position.z += 92; });
        (W.setState.flows || []).forEach(function (f) { f.tex.vOffset = (f.tex.vOffset + f.v * dt * 0.6) % 1; });
        W.wheelSpin = 10;
      } },

    /* 6 — steel warehouse: corrugated walls, trusses, columns, barrels, one bright window */
    { id: 'warehouse', name: 'Warehouse', blurb: 'Image 6: corrugated steel, trusses, one window',
      hdr: { amb: function (el) { var t = smooth((el + 10) / 50); return [0.03 + 0.06 * t, 0.034 + 0.07 * t, 0.04 + 0.08 * t]; },
        lights: [{ az: 160, w: 30, el: 20, h: 18, f: 4, rgb: [0.9, 0.95, 1], p: 24 }, { az: 0, w: 360, el: 75, h: 12, f: 6, rgb: [0.85, 0.9, 1], p: 3 }, { az: -70, w: 50, el: 35, h: 25, f: 8, rgb: [0.8, 0.9, 1], p: 2.5 }] },
      env: 1.1, key: { dir: V3(-0.6, -1, 0.5), i: 1.1, col: C3(0.85, 0.92, 1) }, fog: { col: '#0a0c0e', d: 0.04 }, clear: '#0a0c0e',
      floor: { albedo: '#131517', rough: 0.34, mirror: 0.85, blur: 24, bump: 0.7, envI: 2 }, grade: { exposure: 1.0, contrast: 1.22, sat: -40, vig: 2.8 }, lamp: 0.8,
      build: function (W, P) {
        var sm = pbr(W, 'steel', lin('#3a3d42'), 0.55, 0.35); sm.bumpTexture = normalFromHeight(W.scene, 256, function (u) { return Math.sin(u * Math.PI * 2 * 24) * 0.5; }, 1.6);
        sm.bumpTexture.uScale = 10; sm.bumpTexture.vScale = 1;
        room(W, 40, 12, sm, P);
        var dark = pbr(W, 'column', C3(0.05, 0.05, 0.055), 0.8), rust = pbr(W, 'rust', lin('#4a3a30'), 0.7, 0.2);
        [[-10, -12], [10, -12], [-10, 10], [10, 10], [15, -1], [-15, -1]].forEach(function (p, i) { P.push(box(W, 'col' + i, 0.6, 12, 0.6, V3(p[0], 6, p[1]), dark)); });
        for (var i = 0; i < 6; i++) { P.push(box(W, 'truss' + i, 40, 0.5, 0.25, V3(0, 11.4, -17 + i * 7), dark)); P.push(box(W, 'trussD' + i, 40, 0.12, 0.12, V3(0, 10.6, -17 + i * 7), dark)); for (var k = 0; k < 9; k++) { var d = box(W, 'dg' + i + k, 0.1, 1.2, 0.1, V3(-16 + k * 4, 11, -17 + i * 7), dark); d.rotation.z = (k % 2 ? 1 : -1) * 0.9; P.push(d); } }
        for (i = 0; i < 4; i++) { var barrel = BABYLON.MeshBuilder.CreateCylinder('barrel' + i, { height: 1.2, diameter: 0.8, tessellation: 18 }, W.scene); barrel.position.set(-13 + (i % 2) * 1.1, 0.6, 4 - Math.floor(i / 2) * 1.1); barrel.material = rust; barrel.isPickable = false; P.push(barrel); }
        P.push(box(W, 'shelf', 3, 3.2, 1, V3(-12, 1.6, -9), dark)); P.push(box(W, 'crate', 1.8, 1.2, 1.8, V3(13, 0.6, 6), rust));
        P.push(box(W, 'poster', 3.2, 2.2, 0.06, V3(2, 6.5, -19.8), pbr(W, 'posterM', C3(0.12, 0.12, 0.13), 0.9)));
        P.push(box(W, 'win', 4.5, 3.2, 0.1, V3(-7, 6.5, 19.8), glow(W, 'winG', C3(0.9, 0.95, 1), 8)));
        var lampM = glow(W, 'hangG', C3(1, 0.95, 0.85), 3.5);
        for (i = 0; i < 3; i++) { P.push(box(W, 'wire' + i, 0.04, 2.5, 0.04, V3(-6 + i * 6, 9.5, -4), dark)); var cone = BABYLON.MeshBuilder.CreateCylinder('shade' + i, { height: 0.5, diameterTop: 0.2, diameterBottom: 1.1, tessellation: 16 }, W.scene); cone.position.set(-6 + i * 6, 8.1, -4); cone.material = dark; cone.isPickable = false; P.push(cone); var bb = BABYLON.MeshBuilder.CreateSphere('bulbw' + i, { diameter: 0.25, segments: 6 }, W.scene); bb.position.set(-6 + i * 6, 7.95, -4); bb.material = lampM; bb.isPickable = false; P.push(bb); }
      } },

    /* 7 — light sculpture: white tubes forming a jagged peak behind the car, black void, mirror floor */
    { id: 'neon', name: 'Neon tubes', blurb: 'Image 7: tube sculpture, black void, mirror floor',
      hdr: { amb: ambGrey(0.01, 0.02, 0.015), lights: [{ az: 160, w: 90, el: 32, h: 6, f: 3, rgb: [1, 1, 1], p: 26 }, { az: 110, w: 40, el: 16, h: 4, f: 2, rgb: [1, 1, 1], p: 18 }, { az: -150, w: 40, el: 20, h: 4, f: 2, rgb: [1, 1, 1], p: 18 }, { az: 0, w: 360, el: 3, h: 2.5, f: 1.5, rgb: [0.95, 0.97, 1], p: 8 }, { az: 0, w: 360, el: 70, h: 30, f: 10, rgb: [0.9, 0.93, 1], p: 2.5 }] },
      env: 2.2, key: { dir: V3(0.1, -1, 0.4), i: 0.9, col: C3(1, 1, 1) }, fog: { col: '#000000', d: 0.012 }, clear: '#000000',
      floor: { albedo: '#030304', rough: 0.05, mirror: 1, blur: 4, bump: 0.02, envI: 2.6 }, grade: { exposure: 1.1, contrast: 1.25, sat: -20, vig: 3 }, lamp: 0, bloom: 0.55, lights: 8,
      build: function (W, P) {
        var nm = glow(W, 'neon', C3(0.96, 0.98, 1), 8), holder = pbr(W, 'holder', C3(0.1, 0.1, 0.11), 0.4, 0.8);
        // segments as [length, centre, rotZ, rotY] — a big inverted V behind the car, a lower V, a floor bar, and leaning tubes on each side
        var T = [
          [13, V3(-5, 4.6, -7), 0.95, 0.1], [12, V3(5.2, 4.3, -7), -1.05, -0.1],       // big peak
          [8, V3(-7.5, 2.0, -4.5), 1.2, 0.5], [9, V3(6.5, 2.4, -4.5), -1.15, -0.4],      // lower V
          [16, V3(0, 0.35, -5.5), 1.5708, 0], [9, V3(-6, 0.3, 2), 1.5708, 0.9],          // floor bars
          [7, V3(-11, 2.8, -1), 0.35, 0.3], [7, V3(11, 2.6, -2), -0.3, -0.3],            // leaning uprights
          [10, V3(9, 3.5, -8), -0.8, 0.6], [6, V3(-12, 1.6, 4), 1.1, 1.2]
        ];
        T.forEach(function (t, i) { P.push(tube(W, 'tube' + i, t[0], t[1], t[2], t[3], nm)); var h = BABYLON.MeshBuilder.CreateCylinder('hold' + i, { height: t[0] + 0.1, diameter: 0.12, tessellation: 8 }, W.scene); h.position.copyFrom(t[1]); h.position.y -= 0.04; h.rotation.set(0, t[3], t[2]); h.material = holder; h.isPickable = false; P.push(h); });
        // the tubes actually light the car and floor
        [[-4, 4.5, -5.5, 90], [5, 4, -5.5, 90], [0, 1.2, -4.5, 60], [-9, 2.5, 0, 45], [9, 2.5, -1, 45], [0, 6, 4, 50]].forEach(function (p, i) {
          var l = new BABYLON.PointLight('neonL' + i, V3(p[0], p[1], p[2]), W.scene); l.intensity = p[3]; l.diffuse = C3(0.95, 0.97, 1); l.specular = l.diffuse; l.range = 40; P.push(l);
        });
      } },

    /* 8 — LED wall: thirty bars of pink light as real geometry, dark room, wet concrete */
    { id: 'led', name: 'LED wall', blurb: 'Image 8: pink light bars, wet concrete',
      hdr: { amb: function (el) { var t = smooth((el + 10) / 40); return [0.08 + 0.1 * t, 0.02 + 0.03 * t, 0.1 + 0.12 * t]; },
        lights: stripeLights(16, 180, 110, -4, 56, 1.9, [1, 0.72, 0.94], 20).concat([{ az: 0, w: 120, el: 20, h: 30, f: 10, rgb: [1, 0.6, 0.9], p: 1.2 }]) },
      env: 1.2, key: { dir: V3(0.1, -1, -0.8), i: 0.8, col: C3(1, 0.65, 0.9) }, fog: { col: '#1a0a1c', d: 0.024 }, clear: '#0d060f',
      floor: { albedo: '#1a1320', rough: 0.22, mirror: 1, blur: 10, bump: 0.8, envI: 2.2 }, grade: { exposure: 1.0, contrast: 1.2, sat: 12, vig: 2.4 }, lamp: 0, bloom: 0.45,
      build: function (W, P) {
        var barM = glow(W, 'ledBar', C3(1, 0.78, 0.96), 5.5), frame = pbr(W, 'ledFrame', C3(0.02, 0.012, 0.025), 0.9);
        P.push(box(W, 'ledBack', 24.5, 10.4, 0.3, V3(0, 5.6, -7.6), frame));
        for (var i = 0; i < 30; i++) P.push(box(W, 'bar' + i, 24, 0.17, 0.08, V3(0, 1.2 + i * 0.31, -7.35), barM));
        var bm = pbr(W, 'ledbk', C3(0.01, 0.005, 0.012), 0.9); room(W, 52, 16, bm, P);
      } },

    /* 9 — timber slat house: plank wall, slatted roof throwing diagonal sun, tiled terrace, bright sky */
    { id: 'slats', name: 'Slat house', blurb: 'Image 9: timber wall, tiled terrace, diagonal sun',
      hdr: { amb: function (el) { var t = smooth((el + 5) / 45); return [0.5 + 1.0 * t, 0.48 + 1.0 * t, 0.46 + 1.05 * t]; },
        lights: [{ az: 60, w: 12, el: 42, h: 10, f: 3, rgb: [1, 0.95, 0.85], p: 45 }, { az: 0, w: 360, el: 25, h: 50, f: 12, rgb: [1, 0.9, 0.75], p: 2.5 }] },
      env: 2.2, key: { dir: V3(-0.75, -1, -0.45), i: 3.6, col: C3(1, 0.93, 0.8) }, fog: { col: '#cfc4ad', d: 0.006 }, clear: '#dcd4c2',
      floor: { albedo: '#7a7164', rough: 0.5, mirror: 0.3, blur: 30, bump: 0.6, envI: 1 }, grade: { exposure: 0.92, contrast: 1.12, sat: 6, vig: 1.6 }, lamp: 0, shadowBlur: 6,
      build: function (W, P) {
        var wood = pbr(W, 'wood', lin('#a4622a'), 0.6); wood.bumpTexture = normalFromHeight(W.scene, 256, function (u, v) { var pl = (u * 12) % 1; return (pl < 0.05 ? -1 : 0) + noise(u * 2, v * 6) * 0.25 + noise(u * 7, v * 40) * 0.1; }, 0.8);
        wood.bumpTexture.uScale = 4; wood.bumpTexture.vScale = 1;
        var wall = box(W, 'twall', 46, 11, 0.3, V3(0, 5.5, -7.5), wood); wall.receiveShadows = true; P.push(wall);
        var side = box(W, 'twall2', 0.3, 11, 34, V3(-18, 5.5, 5), wood); side.receiveShadows = true; P.push(side);
        var dark = pbr(W, 'roofM', C3(0.06, 0.06, 0.06), 0.8); P.push(box(W, 'roofEdge', 46, 0.5, 0.5, V3(0, 11, -7.5), dark)); P.push(box(W, 'roofEdge2', 0.5, 0.5, 34, V3(-18, 11, 5), dark));
        var tiles = normalFromHeight(W.scene, 256, function (u, v) { var gu = (u * 2) % 1, gv = (v * 2) % 1; return (gu < 0.02 || gv < 0.02 ? -1 : 0) + noise(u * 3, v * 3) * 0.15; }, 0.9);
        W.floorMat.bumpTexture = tiles; tiles.uScale = tiles.vScale = 22; tiles.level = 0.6;
        slats(W, P, 15, 1.9, 10.6, 0.78, 0, 70);
        var rail = pbr(W, 'rail', C3(0.7, 0.7, 0.72), 0.3, 1); for (var i = 0; i < 16; i++) P.push(box(W, 'post' + i, 0.06, 1.1, 0.06, V3(14, 0.55, 8 - i * 0.9), rail)); P.push(box(W, 'railTop', 0.06, 0.06, 15, V3(14, 1.1, 1.2), rail));
        var sky = BABYLON.MeshBuilder.CreateSphere('skyS', { diameter: 400, segments: 8, sideOrientation: BABYLON.Mesh.BACKSIDE }, W.scene);
        var skyM = new BABYLON.StandardMaterial('skyM', W.scene); skyM.disableLighting = true; skyM.emissiveColor = C3(0.85, 0.9, 0.98); skyM.diffuseColor = C3(0, 0, 0); skyM.backFaceCulling = false; sky.material = skyM; sky.applyFog = false; sky.isPickable = false; P.push(sky);
        var sea = pbr(W, 'sea', lin('#9fb3bd'), 0.15, 0); P.push(box(W, 'sea', 300, 0.1, 300, V3(160, -0.4, 0), sea));
      } }
  ];

  /* ---------- photo backdrops ----------
     cfg: { id, name, blurb, src (data URL), wallFrac (image row where wall meets floor), mirror, blur, exposure, contrast, sat, clear } */
  var BACK_AZ = 142, BACK_R = 22, BACK_ARC = 120; // the photo faces the hero camera; mirrored copies fill the rest of the ring
  function photoSet(cfg) {
    return { id: cfg.id, name: cfg.name, blurb: cfg.blurb, photo: cfg,
      env: 1, key: { dir: V3(-0.35, -1, 0.45), i: 1, col: C3(1, 1, 1) }, fog: { col: cfg.clear, d: 0 }, clear: cfg.clear,
      floor: { albedo: '#000000', rough: 0.2, mirror: cfg.mirror, blur: cfg.blur, bump: 0, envI: 1 },
      grade: { exposure: cfg.exposure || 1, contrast: cfg.contrast || 1.08, sat: cfg.sat || 0, vig: 1.1 }, lamp: 0, bloom: 0.2 };
  }
  function ribbonArc(W, name, azC, y0, y1, mat, reverse) {
    var n = 40, bot = [], top = [];
    for (var k = 0; k <= n; k++) { var i = reverse ? n - k : k; var az = (azC - BACK_ARC / 2 + BACK_ARC * i / n) * Math.PI / 180; var x = Math.sin(az) * BACK_R, z = Math.cos(az) * BACK_R; bot.push(V3(x, y0, z)); top.push(V3(x, y1, z)); }
    var m = BABYLON.MeshBuilder.CreateRibbon(name, { pathArray: [bot, top], sideOrientation: BABYLON.Mesh.DOUBLESIDE }, W.scene);
    m.material = mat; m.isPickable = false; m.applyFog = false; return m;
  }
  /* decode a data-URL JPEG to RGBA pixels without using an <img src> (works regardless of image-source policy) */
  function loadPixels(src, cb, err) {
    var viaImage = function (why) {
      var img = new Image();
      img.onload = function () { try { var cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); var d = ctx.getImageData(0, 0, cv.width, cv.height); cb(cv.width, cv.height, d.data); } catch (e) { err('canvas: ' + e.message); } };
      img.onerror = function () { err('image blocked' + (why ? ' (' + why + ')' : '')); };
      img.src = src;
    };
    try {
      var b64 = src.split(',')[1], bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      var blob = new Blob([u8], { type: 'image/jpeg' });
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(blob).then(function (bmp) {
          var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; var ctx = cv.getContext('2d'); ctx.drawImage(bmp, 0, 0);
          var d = ctx.getImageData(0, 0, cv.width, cv.height); cb(cv.width, cv.height, d.data);
        }).catch(function (e) { viaImage('bitmap: ' + (e && e.message)); });
      } else viaImage('no createImageBitmap');
    } catch (e) { viaImage(e.message); }
  }
  function buildPhoto(W, set, P, onReady) {
    var cfg = set.photo, scene = W.scene;
    var Hc = (BACK_ARC / 360) * 2 * Math.PI * BACK_R / 2; // image is 2:1
    var yTop = cfg.wallFrac * Hc, yBot = yTop - Hc;
    W.photoStatus = 'decoding photo';
    loadPixels(cfg.src, function (pw, ph, px) {
      if (W.setIndex !== set._idx) return;
      // backdrop texture straight from pixels
      var tex = new BABYLON.RawTexture(px, pw, ph, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene, true, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
      tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      var mat = new BABYLON.StandardMaterial('backdrop', scene); mat.disableLighting = true; mat.diffuseColor = C3(0, 0, 0); mat.specularColor = C3(0, 0, 0);
      mat.emissiveTexture = tex; tex.level = 1.3; mat.emissiveColor = C3(0, 0, 0); mat.backFaceCulling = false; // emissive colour is ADDED to the texture in StandardMaterial
      P.push(ribbonArc(W, 'bkC', BACK_AZ, yBot, yTop, mat, false));
      P.push(ribbonArc(W, 'bkL', BACK_AZ - BACK_ARC, yBot, yTop, mat, true));
      P.push(ribbonArc(W, 'bkR', BACK_AZ + BACK_ARC, yBot, yTop, mat, true));
      W.photoStatus = 'backdrop on';
      // environment + key light estimated from the same pixels
      var lut = new Float32Array(256); for (var i = 0; i < 256; i++) { var l = Math.pow(i / 255, 2.2); lut[i] = l * (1 + 14 * Math.pow(l, 6)); }
      var out3 = [0, 0, 0], sumU = 0, cntU = 0, best = { l: -1 }, acc = new Float32Array(32 * 16 * 3), accN = new Float32Array(32 * 16);
      var sampler = function (el, phi, x, y) {
        var yy = 0.8 + BACK_R * Math.tan(Math.max(-80, Math.min(80, el)) * Math.PI / 180);
        var r = clamp(cfg.wallFrac - yy / Hc, 0, 0.999);
        var d = ((phi - BACK_AZ + 540) % 360) - 180, u = d > BACK_ARC / 2 ? 1 - (d - BACK_ARC / 2) / BACK_ARC : d < -BACK_ARC / 2 ? (-d - BACK_ARC / 2) / BACK_ARC : (d + BACK_ARC / 2) / BACK_ARC;
        var o = ((Math.floor(r * ph) * pw) + Math.floor(clamp(u, 0, 0.999) * pw)) * 4;
        var R = lut[px[o]], G = lut[px[o + 1]], B = lut[px[o + 2]];
        if (el > 0) { var lum = 0.2126 * R + 0.7152 * G + 0.0722 * B; sumU += lum; cntU++; var bi = (y >> 4) * 32 + (x >> 4); acc[bi * 3] += R; acc[bi * 3 + 1] += G; acc[bi * 3 + 2] += B; accN[bi]++; }
        out3[0] = R; out3[1] = G; out3[2] = B; return out3;
      };
      var url = hdrFromSampler(sampler);
      var mean = sumU / Math.max(1, cntU);
      W.envMul = clamp(1.2 / Math.max(mean, 1e-3), 0.6, 6);
      for (var b = 0; b < 32 * 16; b++) { if (!accN[b]) continue; var lb = (0.2126 * acc[b * 3] + 0.7152 * acc[b * 3 + 1] + 0.0722 * acc[b * 3 + 2]) / accN[b]; if (lb > best.l) best = { l: lb, x: (b % 32) + 0.5, y: Math.floor(b / 32) + 0.5, r: acc[b * 3] / accN[b], g: acc[b * 3 + 1] / accN[b], bl: acc[b * 3 + 2] / accN[b] }; }
      var kaz = colAz(best.x * 16, 512) * Math.PI / 180, kel = (90 - best.y / 16 * 90) * Math.PI / 180;
      var kd = V3(Math.sin(kaz) * Math.cos(kel), Math.sin(kel), Math.cos(kaz) * Math.cos(kel));
      W.key.direction = kd.scale(-1); W.key.position = kd.scale(16);
      var kmax = Math.max(best.r, best.g, best.bl, 1e-3); W.key.diffuse = C3(best.r / kmax, best.g / kmax, best.bl / kmax);
      W.keyMul = clamp(best.l * 0.12, 0.25, 2.6);
      try { var hdr = new BABYLON.HDRCubeTexture(url, scene, W.lite ? 128 : 256, false, true, false, true, function () {
        if (W.setIndex !== set._idx) { hdr.dispose(); return; }
        var old = scene.environmentTexture; scene.environmentTexture = hdr; if (old) old.dispose(); W.hdr = hdr; W.photoStatus = 'backdrop + lighting on'; if (onReady) onReady();
      }, function (msg) { W.photoStatus = 'hdr failed: ' + msg; if (onReady) onReady(); }); } catch (e) { W.photoStatus = 'hdr error: ' + e.message; if (onReady) onReady(); }
    }, function (why) { W.photoStatus = 'photo failed: ' + why; console.error(W.photoStatus); if (onReady) onReady(); });
  }
  function ensurePhotoFloor(W) {
    if (W.photoFloorMat) return;
    var m = new BABYLON.StandardMaterial('photoFloor', W.scene);
    m.diffuseColor = C3(0, 0, 0); m.specularColor = C3(0, 0, 0); m.emissiveColor = C3(0, 0, 0); m.disableLighting = true;
    m.reflectionTexture = W.mirror; m.alpha = 0.99; m.alphaMode = BABYLON.Constants.ALPHA_ADD;
    var fp = new BABYLON.FresnelParameters(); fp.bias = 0.12; fp.power = 1.8; fp.leftColor = C3(0.3, 0.3, 0.3); fp.rightColor = C3(1, 1, 1); m.reflectionFresnelParameters = fp;
    W.photoFloorMat = m;
    // soft contact shadow under the car
    var dt = new BABYLON.DynamicTexture('blob', 256, W.scene, false); var ctx = dt.getContext();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
    var g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); dt.update(); dt.getAlphaFromRGB = true;
    var bm = new BABYLON.StandardMaterial('blobMat', W.scene); bm.diffuseColor = C3(0, 0, 0); bm.specularColor = C3(0, 0, 0); bm.emissiveColor = C3(0, 0, 0); bm.disableLighting = true; bm.opacityTexture = dt; bm.alpha = 0.85;
    var blob = BABYLON.MeshBuilder.CreateGround('blob', { width: 6.2, height: 3.4 }, W.scene); blob.position.y = 0.004; blob.material = bm; blob.isPickable = false; blob.alphaIndex = 1;
    W.blob = blob;
  }

  /* ---------- apply ---------- */
  function apply(W, idx, onReady) {
    var scene = W.scene, set = SETS[idx]; W.setIndex = idx; W.setState = {}; W.set = set;
    // dispose previous props
    (W.props || []).forEach(function (n) { try { if (n.material && n.material.name !== 'floorMat') { if (n.material.bumpTexture) n.material.bumpTexture.dispose(); if (n.material.emissiveTexture) n.material.emissiveTexture.dispose(); n.material.dispose(); } n.dispose(); } catch (e) {} });
    W.props = [];
    W.wheelSpin = 0;
    // atmosphere
    scene.clearColor = BABYLON.Color4.FromColor3(lin(set.clear), 1);
    scene.fogColor = lin(set.fog.col); scene.fogDensity = set.fog.d;
    // floor
    var fm = W.floorMat; set._idx = idx;
    if (W.mirror) ensurePhotoFloor(W);
    W.floor.material = set.photo && W.photoFloorMat ? W.photoFloorMat : W.floorMat;
    if (W.blob) W.blob.setEnabled(!!set.photo);
    W.scene.fogMode = set.photo ? BABYLON.Scene.FOGMODE_NONE : BABYLON.Scene.FOGMODE_EXP2;
    World.KEYS[4].h = set.photo ? 3.4 : 6.6; World.KEYS[4].r = set.photo ? 7.8 : 7.4; fm.albedoColor = lin(set.floor.albedo); fm.roughness = set.floor.rough; fm.environmentIntensity = set.floor.envI;
    if (W.mirror) { W.mirror.level = set.floor.mirror; W.mirror.blurKernel = W.lite ? Math.round(set.floor.blur / 2) : set.floor.blur; }
    if (fm.bumpTexture) { fm.bumpTexture = W.floorBump; fm.bumpTexture.level = set.floor.bump; fm.bumpTexture.uScale = fm.bumpTexture.vScale = 26; }
    // key light
    W.key.direction = set.key.dir.clone().normalize(); W.key.diffuse = set.key.col; W.keyMul = set.key.i; W.envMul = set.env; W.lampMul = set.lamp;
    W.key.position = W.key.direction.scale(-16);
    if (W.sg) W.sg.blurKernel = set.shadowBlur || (W.lite ? 16 : 32);
    // strips (the Bay only)
    W.strips.forEach(function (s) { s.setEnabled(!!set.strips); });
    // props
    var P = W.props;
    scene.materials.forEach(function (m) { if (m.maxSimultaneousLights !== undefined) m.maxSimultaneousLights = set.lights || 4; });
    if (set.build) { try { set.build(W, P); } catch (e) { console.warn('set build', set.id, e); } }
    if (set.photo) { try { buildPhoto(W, set, P, onReady); } catch (e) { console.warn('photo', e); if (onReady) onReady(); } }
    if (W.mirror) W.mirror.renderList = set.photo ? W.carMeshes.slice() : W.carMeshes.concat(set.strips ? W.strips : [], P.filter(function (n) { return n.getTotalVertices && n.getTotalVertices() > 0 && n.getClassName() !== 'InstancedMesh'; }));
    // grade
    if (W.pipe) {
      var ip = W.pipe.imageProcessing; ip.exposure = set.grade.exposure; ip.contrast = set.grade.contrast; ip.vignetteWeight = set.grade.vig;
      ip.colorCurvesEnabled = true; var cc = new BABYLON.ColorCurves(); cc.globalSaturation = set.grade.sat; ip.colorCurves = cc;
      W.pipe.bloomWeight = set.bloom || 0.3;
      // photos carry their own depth of field; a lens blur on top turns the backdrop into haze
      if (W.dofAllowed === undefined) W.dofAllowed = W.pipe.depthOfFieldEnabled;
      W.pipe.depthOfFieldEnabled = W.dofAllowed && !set.photo;
      if (W.pipe.chromaticAberrationEnabled !== undefined && !W.lite) W.pipe.chromaticAberrationEnabled = !set.photo;
      W.pipe.grain.intensity = set.photo ? 4 : (W.lite ? 5 : 7.5);
    }
    // environment (photo sets build theirs asynchronously from the image)
    if (set.photo) return;
    var url = hdrDataUrl(set.hdr);
    try { var tex = new BABYLON.HDRCubeTexture(url, scene, W.lite ? 128 : 256, false, true, false, true, function () {
      if (W.setIndex !== idx) { tex.dispose(); return; }
      var old = scene.environmentTexture; scene.environmentTexture = tex; if (old) old.dispose();
      W.hdr = tex; if (onReady) onReady();
    }); } catch (e) { console.warn('hdr', e); if (onReady) onReady(); }
  }

  return { SETS: SETS, apply: apply, hdrDataUrl: hdrDataUrl, photoSet: photoSet };
})();

/* ===================== page ===================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  var portrait = function () { return innerWidth <= 900; };

  /* ---- loader ui ---- */
  var ldbar = $('ldbar'), ldpct = $('ldpct'), ldmsg = $('ldmsg'), loader = $('loader');
  var progress = 0;
  function setProgress(p, msg) { progress = Math.max(progress, p); ldbar.style.width = Math.round(progress * 100) + '%'; ldpct.textContent = Math.round(progress * 100) + '%'; if (msg) ldmsg.textContent = msg; }
  function failGL(msg) {
    document.body.classList.add('nogl'); $('lderr').style.display = 'block'; $('lderr').textContent = msg || $('lderr').textContent;
    setTimeout(function () { loader.classList.add('gone'); }, 1800);
    $('hud').style.display = 'none';
  }

  /* ---- decode embedded assets ---- */
  function b64bytes(id) { var s = $(id).textContent.trim(); var bin = atob(s); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  /* ---- engine ---- */
  var canvas = $('gl'), engine, scene, W;
  try {
    if (!window.BABYLON) throw new Error('Babylon.js did not load');
    engine = new BABYLON.Engine(canvas, true, { antialias: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', adaptToDeviceRatio: false });
    var dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75);
    engine.setHardwareScalingLevel(1 / dpr);
  } catch (e) { failGL(); return; }
  scene = new BABYLON.Scene(engine);
  var lite = coarse || portrait();
  W = World.build({ scene: scene, lite: lite });

  /* ---- post processing ---- */
  var pipe = new BABYLON.DefaultRenderingPipeline('pipe', true, scene, [W.cam]);
  pipe.fxaaEnabled = true;
  pipe.bloomEnabled = true; pipe.bloomThreshold = 0.85; pipe.bloomWeight = 0.3; pipe.bloomKernel = lite ? 36 : 64; pipe.bloomScale = 0.5;
  pipe.imageProcessingEnabled = true;
  var ip = pipe.imageProcessing;
  ip.toneMappingEnabled = true; ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.1; ip.contrast = 1.15;
  ip.vignetteEnabled = true; ip.vignetteWeight = 2.4; ip.vignetteStretch = 0.35; ip.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);
  pipe.chromaticAberrationEnabled = !lite; if (!lite) { pipe.chromaticAberration.aberrationAmount = 9; pipe.chromaticAberration.radialIntensity = 0.85; }
  pipe.grainEnabled = true; pipe.grain.intensity = lite ? 5 : 7.5; pipe.grain.animated = true;
  pipe.depthOfFieldEnabled = !lite && !reduce;
  if (pipe.depthOfFieldEnabled) { pipe.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Low; pipe.depthOfField.focalLength = 70; pipe.depthOfField.fStop = 4; pipe.depthOfField.lensSize = 30; pipe.depthOfField.focusDistance = 7000; }
  W.pipe = pipe;

  /* ---- state ---- */
  var S = { t: 0, portrait: portrait(), px: 0, py: 0, yaw: 0, pitch: 0, chapter: 0, time: 0, intro: -1, reduce: reduce, lampOn: true, lampAt: new BABYLON.Vector3(0.6, 0, 0.9) };
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var drag = { on: false, x: 0, y: 0, vy: 0, vp: 0 };
  var scrollS = 0, scrollT = 0;
  var chapters = Array.prototype.slice.call(document.querySelectorAll('.ch'));
  var panels = chapters.map(function (c) { return c.querySelector('[data-panel]'); });
  var railLinks = Array.prototype.slice.call(document.querySelectorAll('#rail a'));
  var started = false, introStart = 0, counted = false;

  /* ---- load the car: from a URL when the site serves it as a file, otherwise from the embedded copy ---- */
  setProgress(0.06, window.MODEL_URL ? 'Fetching the S13' : 'Decoding the S13');
  var loadModel = window.MODEL_URL
    ? fetch(window.MODEL_URL).then(function (r) {
        if (!r.ok) throw new Error('model ' + r.status);
        var total = +r.headers.get('content-length') || 0, got = 0, reader = r.body && r.body.getReader();
        if (!reader) return r.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
        var chunks = [];
        return (function pump() { return reader.read().then(function (res) {
          if (res.done) { var out = new Uint8Array(got), o = 0; chunks.forEach(function (c) { out.set(c, o); o += c.length; }); return out; }
          chunks.push(res.value); got += res.value.length; if (total) setProgress(0.06 + 0.4 * (got / total)); return pump();
        }); })();
      })
    : new Promise(function (resolve, reject) { try { resolve(b64bytes('glb-data')); } catch (e) { reject(e); } });
  loadModel.then(function (glbBytes) {
    setProgress(0.48, 'Compiling materials');
    return BABYLON.SceneLoader.ImportMeshAsync('', '', glbBytes, scene, null, '.glb');
  }).then(function (res) {
    World.attachCar(W, res.meshes);
    setProgress(0.62, 'Prefiltering the studio HDR');
    return new Promise(function (resolve) {
      var done = false; Sets.apply(W, startSet, function () { done = true; resolve(); });
      setTimeout(function () { if (!done) resolve(); }, 9000);
    });
  }).then(function () {
    setProgress(0.82, 'Warming up the shaders');
    return new Promise(function (resolve) { scene.executeWhenReady(resolve); setTimeout(resolve, 12000); });
  }).then(function () {
    setProgress(1, 'Lights');
    setTimeout(start, 350);
  }).catch(function (e) {
    console.error(e);
    failGL('The studio could not start on this device. The content below still works.');
  });

  function start() {
    if (W.photoStatus) $('setBlurb').textContent = W.photoStatus;
    loader.classList.add('gone');
    started = true; introStart = performance.now();
    document.body.classList.add('live');
    setTimeout(function () { $('cue').classList.add('show'); }, 2600);
    setTimeout(countUp, 2100);
  }

  /* ---- render loop ---- */
  var last = performance.now();
  engine.runRenderLoop(function () {
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.time = now / 1000;
    S.intro = started ? (now - introStart) / 1000 : -1;
    if (reduce && started) S.intro = Math.max(S.intro, 4);

    // smooth scroll -> camera track
    scrollT = scrollY;
    scrollS += (scrollT - scrollS) * (reduce ? 1 : Math.min(1, dt * 7));
    layout(scrollS);

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 5); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 5);
    S.px = pointer.x; S.py = pointer.y; S.portrait = portrait();
    if (!drag.on) { S.yaw += (0 - S.yaw) * Math.min(1, dt * 2.2); S.pitch += (0 - S.pitch) * Math.min(1, dt * 2.2); }

    if (W.ready) World.update(W, dt, S);
    scene.render();
  });

  /* chapter layout: which chapter, local progress, camera track t, panel opacity */
  function layout(sy) {
    var vh = innerHeight, t = 0, cur = 0;
    for (var i = 0; i < chapters.length; i++) {
      var c = chapters[i], top = c.offsetTop, len = Math.max(1, c.offsetHeight - vh);
      var p = clamp((sy - top) / len, 0, 1);
      if (sy >= top - vh * 0.5) cur = i;
      // camera: the first 42% of each chapter travels from the previous view, the rest holds
      if (i === 0) t = 0;
      else if (sy >= top) t = (i - 1) + clamp(p / 0.42, 0, 1);
      // panel: in from 0.12 to 0.34, out from 0.86 to 1 (hero: fades out from 0.55)
      var o = 1;
      if (i === 0) o = 1 - clamp((p - 0.5) / 0.4, 0, 1);
      else o = clamp((p - 0.14) / 0.2, 0, 1) * (1 - clamp((p - 0.86) / 0.14, 0, 1));
      if (i === chapters.length - 1) o = clamp((p - 0.14) / 0.2, 0, 1);
      if (!started && i === 0) o = 0;
      if (i === 0 && started) o *= clamp((S.intro - 1.9) / 1.1, 0, 1);
      var el = panels[i];
      if (el) { el.style.opacity = o.toFixed(3); el.style.transform = 'translate3d(0,' + ((1 - o) * 22).toFixed(1) + 'px,0)'; el.style.pointerEvents = o > 0.5 ? 'auto' : 'none'; }
    }
    S.t = t; S.chapter = cur;
    railLinks.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    $('cue').classList.toggle('show', started && sy < 40 && S.intro > 2.6);
  }

  /* ---- input ---- */
  var cursor = $('cursor');
  addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5;
    cursor.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
    cursor.classList.add('on');
    var hot = e.target.closest && e.target.closest('a, button, [role=tab]');
    cursor.classList.toggle('hot', !!hot);
    cursor.classList.toggle('grab', !hot && e.target === canvas && !drag.on);
    // lamp follows the cursor across the floor
    if (W.floor) {
      var pick = scene.pick(e.clientX, e.clientY, function (m) { return m === W.floor; });
      if (pick && pick.hit) S.lampAt = pick.pickedPoint;
    }
    if (drag.on) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      S.yaw = clamp(S.yaw + dx * 0.0045, -1.6, 1.6); S.pitch = clamp(S.pitch + dy * 0.0035, -0.9, 0.9);
    }
  }, { passive: true });
  canvas.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') return; drag.on = true; drag.x = e.clientX; drag.y = e.clientY; cursor.classList.add('grab'); });
  addEventListener('pointerup', function () { drag.on = false; });
  addEventListener('pointercancel', function () { drag.on = false; });
  document.addEventListener('mouseleave', function () { cursor.classList.remove('on'); });
  addEventListener('resize', function () { engine.resize(); });
  document.addEventListener('visibilitychange', function () { last = performance.now(); });

  /* ---- set picker ---- */
  var setSel = $('setSel');
  if (window.PHOTO_CFG) Sets.SETS.unshift(Sets.photoSet(window.PHOTO_CFG));
  Sets.SETS.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = (i + 1 < 10 ? '0' : '') + (i + 1) + '  ' + s.name; setSel.appendChild(o); });
  var startSet = 0;
  if (window.START_SET) Sets.SETS.forEach(function (s, i) { if (s.id === window.START_SET) startSet = i; });
  setSel.value = startSet;
  setSel.addEventListener('change', function () {
    if (!W.ready) return;
    var i = +setSel.value; $('setBlurb').textContent = Sets.SETS[i].blurb;
    Sets.apply(W, i, function () { if (Sets.SETS[i].photo && W.photoStatus) $('setBlurb').textContent = W.photoStatus; });
  });
  $('setBlurb').textContent = Sets.SETS[startSet].blurb;

  /* ---- hud ---- */
  var swatches = Array.prototype.slice.call(document.querySelectorAll('#swatches button'));
  swatches.forEach(function (b) {
    b.addEventListener('click', function () {
      swatches.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (W.ready) World.setPaint(W, b.getAttribute('data-hex'));
    });
  });
  var lightsBtn = $('lightsBtn'), lightsOn = true;
  lightsBtn.addEventListener('click', function () {
    lightsOn = !lightsOn; lightsBtn.setAttribute('aria-pressed', String(lightsOn));
    if (W.ready) World.setHeadlights(W, lightsOn, false);
  });

  /* ---- panels: tabs, accordions, copy, counters ---- */
  var ABOUT = {
    eng: 'Two years shipping production websites for a digital agency while finishing a CS degree. Comfortable anywhere in the stack, happiest in backend systems, computer vision and high-performance computing.',
    mus: 'Electric and acoustic guitar, and piano. Mostly by ear, sometimes by sheet, always too loud. It’s where the patience for debugging comes from.',
    bld: 'A long-running Nissan 180SX project with a Rocket Bunny V2 kit: the one you’re looking at. Bodywork, wiring, and learning the hard way that every bolt has a story.'
  };
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
  tabs.forEach(function (t) { t.addEventListener('click', function () {
    tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
    var p = $('aboutTxt'); p.style.opacity = 0;
    setTimeout(function () { p.textContent = ABOUT[t.getAttribute('data-tab')]; p.style.transition = 'opacity .35s'; p.style.opacity = 1; }, 140);
  }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-acc]'), function (acc) {
    var rows = Array.prototype.slice.call(acc.querySelectorAll('.row'));
    rows.forEach(function (r) { r.querySelector('.row-head').addEventListener('click', function () {
      var open = r.classList.contains('open');
      rows.forEach(function (x) { x.classList.remove('open'); x.querySelector('.row-head').setAttribute('aria-expanded', 'false'); });
      if (!open) { r.classList.add('open'); r.querySelector('.row-head').setAttribute('aria-expanded', 'true'); }
    }); });
  });
  $('copyBtn').addEventListener('click', function () {
    var out = $('copied');
    try { navigator.clipboard.writeText('ayush.beekum@gmail.com').then(function () { out.textContent = 'Copied'; setTimeout(function () { out.textContent = ''; }, 1800); }); }
    catch (e) { out.textContent = 'ayush.beekum@gmail.com'; }
  });
  function countUp() {
    if (counted) return; counted = true;
    Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var to = +el.getAttribute('data-count'), t0 = performance.now(), dur = 1500;
      (function tick() { var u = clamp((performance.now() - t0) / dur, 0, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(tick); })();
    });
  }
  // links in the fixed chrome scroll smoothly to chapters
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1); var el = id === 'top' ? document.body : $(id);
      if (!el) return; e.preventDefault();
      var y = id === 'top' ? 0 : el.offsetTop + innerHeight * 0.3;
      scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    });
  });
})();
