/* ==========================================================================
   BEEKUM GARAGE — scene3d.js
   The whole workshop, built in code: geometry, PBR materials, procedural
   textures, lighting, post-processing and the scroll-driven camera rig.
   No model files, no image files — every surface is generated at runtime.
   ========================================================================== */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------ constants ------------------------------- */

const ROOM = { W: 26, D: 16, H: 5.4 };            /* x-width, z-depth, height */
const BACK = -ROOM.D / 2, FRONT = ROOM.D / 2;
const LEFT = -ROOM.W / 2, RIGHT = ROOM.W / 2;

const BRAND = {
  red: 0xe0344a,
  redDeep: 0x8f1626,
  amber: 0xffb257,
  cyan: 0x57d7e6,
  cream: 0xfff3d6
};

/* Camera keyframes — one shot per section, sampled by scroll progress u∈[0,6] */
const SHOTS = [
  { pos: [7.2, 2.5, 6.4],   look: [-0.8, 1.35, -3.2] },  /* hero — establishing */
  { pos: [4.6, 1.65, -1.4], look: [8.2, 1.15, -6.6] },   /* about — workbench */
  { pos: [-4.9, 1.05, 3.9], look: [0.6, 0.72, -1.4] },   /* exp — car profile */
  { pos: [-4.4, 1.7, -0.9], look: [-8.6, 1.3, -6.4] },   /* proj — R&D desk */
  { pos: [6.1, 1.7, 2.6],   look: [11.9, 1.55, -2.4] },  /* skills — parts rack */
  { pos: [-6.4, 1.8, 3.6],  look: [-12.0, 1.85, 0.6] },  /* awards — trophies */
  { pos: [-3.4, 1.6, -3.3], look: [2.4, 0.9, 7.4] }      /* contact — roller door */
];

/* --------------------------- procedural canvas -------------------------- */

function canvasTexture(w, h, draw, colorSpace) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (colorSpace !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, alpha, light) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * alpha * 255;
    d[i] += n; d[i + 1] += n; d[i + 2] += n + (light || 0);
  }
  ctx.putImageData(img, 0, 0);
}

function makeConcrete() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6d7178'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {                       /* stains */
      ctx.fillStyle = `rgba(40,44,52,${0.03 + Math.random() * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h,
        20 + Math.random() * 90, 14 + Math.random() * 60, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,32,38,0.35)'; ctx.lineWidth = 2;
    for (let y = 0.33; y < 1; y += 0.33) {               /* shutter-board seams */
      ctx.beginPath(); ctx.moveTo(0, h * y); ctx.lineTo(w, h * y); ctx.stroke();
    }
    noise(ctx, w, h, 0.16);
  });
}

function makeFloorMaps() {
  const draw = (rough) => (ctx, w, h) => {
    ctx.fillStyle = rough ? '#8c8c8c' : '#20242c';       /* rough: mid grey base */
    ctx.fillRect(0, 0, w, h);
    /* oil stains — dark on colour map, DARK on roughness map = wet & mirror-sharp */
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 40 + Math.random() * 120);
      g.addColorStop(0, rough ? 'rgba(24,24,24,0.9)' : 'rgba(6,8,12,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 40 + Math.random() * 120, 0, 7); ctx.fill();
    }
    /* tyre arcs */
    ctx.strokeStyle = rough ? 'rgba(40,40,40,0.5)' : 'rgba(8,10,14,0.5)';
    ctx.lineWidth = 14;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 120 + Math.random() * 260,
        Math.random() * 6, Math.random() * 2 + 2.6);
      ctx.stroke();
    }
    if (!rough) {
      /* painted service bay + hazard stripes (front edge = +v) */
      ctx.strokeStyle = 'rgba(224,52,74,0.85)'; ctx.lineWidth = 8;
      ctx.strokeRect(w * 0.30, h * 0.22, w * 0.34, h * 0.42);
      ctx.fillStyle = 'rgba(224,52,74,0.85)';
      ctx.font = `700 ${Math.round(h * 0.045)}px Michroma, Arial`;
      ctx.fillText('BAY 01', w * 0.305, h * 0.21);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, h * 0.94, w, h * 0.06); ctx.clip();
      for (let x = -h; x < w + h; x += 46) {
        ctx.fillStyle = (x / 46 | 0) % 2 ? '#c9a12e' : '#15161a';
        ctx.save(); ctx.translate(x, h * 0.94); ctx.rotate(0.6);
        ctx.fillRect(0, -20, 26, h * 0.2); ctx.restore();
      }
      ctx.restore();
    }
    noise(ctx, w, h, rough ? 0.2 : 0.1);
  };
  const map = canvasTexture(1024, 1024, draw(false));
  const roughMap = canvasTexture(1024, 1024, draw(true), false);
  return { map, roughMap };
}

function makeNeonSign() {
  return canvasTexture(1024, 300, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const line = (txt, font, y, color) => {
      ctx.font = font; ctx.textAlign = 'center';
      ctx.shadowColor = color;
      for (const blur of [46, 26, 12]) {
        ctx.shadowBlur = blur; ctx.fillStyle = color; ctx.fillText(txt, w / 2, y);
      }
      ctx.shadowBlur = 6; ctx.fillStyle = '#fff0f2'; ctx.fillText(txt, w / 2, y);
    };
    line('BEEKUM GARAGE', `700 ${h * 0.34}px Michroma, "Arial Black", sans-serif`, h * 0.46, '#ff2b4a');
    line('ビークム・ガレージ', `600 ${h * 0.17}px sans-serif`, h * 0.8, '#ff5d76');
  });
}

function makeMonitor(seed) {
  return canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#03131c'; ctx.fillRect(0, 0, w, h);
    const cols = ['#4be0c3', '#57d7e6', '#ffb257', '#e0344a', '#9aa7b8'];
    let y = 14;
    for (let i = 0; i < 12; i++) {
      let x = 10 + ((seed + i) % 3) * 14;
      const segs = 2 + ((seed * 7 + i * 3) % 4);
      for (let s = 0; s < segs; s++) {
        const len = 14 + ((seed * 13 + i * 5 + s * 11) % 52);
        ctx.fillStyle = cols[(seed + i + s) % cols.length];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, len, 6);
        x += len + 9;
      }
      y += 12;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#57d7e6'; ctx.fillRect(10, y, 8, 8);   /* cursor */
  });
}

function makeCityGlow(nightMode) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (nightMode) {
      g.addColorStop(0, '#0a1526'); g.addColorStop(0.62, '#1d3a5c');
      g.addColorStop(0.63, '#0a0f18'); g.addColorStop(1, '#05070c');
    } else {
      g.addColorStop(0, '#2b2033'); g.addColorStop(0.5, '#b1471f');
      g.addColorStop(0.62, '#ff9440'); g.addColorStop(0.63, '#140f16');
      g.addColorStop(1, '#0a080d');
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    /* skyline windows */
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = h * 0.63 + Math.random() * h * 0.3;
      ctx.fillStyle = nightMode
        ? (Math.random() > 0.5 ? 'rgba(255,214,140,0.8)' : 'rgba(120,190,230,0.7)')
        : 'rgba(255,190,120,0.5)';
      ctx.fillRect(x, y, 2, 2 + Math.random() * 2);
    }
  });
}

/* ------------------------------- helpers -------------------------------- */

const M = {
  steel: (c, r = 0.35) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: r }),
  matte: (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.05, roughness: r }),
  glow: (c, i = 1.6) => new THREE.MeshStandardMaterial({
    color: 0x090909, emissive: c, emissiveIntensity: i, roughness: 0.5, metalness: 0
  })
};

function box(w, h, d, mat, x, y, z, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.y = rot;
  return m;
}

/* ============================== the scene =============================== */

export function createGarage(canvas, opts) {
  const quality = opts.quality;                    /* 'high' | 'low' */
  const reduced = opts.reduced;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x0a0d14, 0.028);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
  camera.position.set(...SHOTS[0].pos);

  /* ------------------------------ shell -------------------------------- */

  const concrete = makeConcrete();
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  const wallMat = new THREE.MeshStandardMaterial({
    map: concrete, color: 0x9aa0aa, roughness: 0.92, metalness: 0.0
  });

  const mkWall = (w, h, x, y, z, ry) => {
    const mat = wallMat.clone();
    mat.map = concrete.clone();
    mat.map.repeat.set(w / 6, h / 5.4);
    mat.map.needsUpdate = true;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    wall.position.set(x, y, z); wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
    return wall;
  };
  mkWall(ROOM.W, ROOM.H, 0, ROOM.H / 2, BACK, 0);
  mkWall(ROOM.D, ROOM.H, LEFT, ROOM.H / 2, 0, Math.PI / 2);
  mkWall(ROOM.D, ROOM.H, RIGHT, ROOM.H / 2, 0, -Math.PI / 2);
  /* front wall in two pieces around the roller-door opening (door 6m wide) */
  const doorW = 6, doorH = 3.6, doorX = 2.2;
  mkWall(doorX - 3 - LEFT, ROOM.H, (LEFT + doorX - 3) / 2, ROOM.H / 2, FRONT, Math.PI);
  mkWall(RIGHT - (doorX + 3), ROOM.H, (RIGHT + doorX + 3) / 2, ROOM.H / 2, FRONT, Math.PI);
  mkWall(doorW, ROOM.H - doorH, doorX, doorH + (ROOM.H - doorH) / 2, FRONT, Math.PI);

  /* ceiling + I-beams */
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D),
    M.matte(0x14161c, 0.95));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.H;
  scene.add(ceil);
  for (let x = -9; x <= 9; x += 6) {
    scene.add(box(0.34, 0.5, ROOM.D, M.steel(0x2a2e36, 0.5), x, ROOM.H - 0.25, 0));
  }

  /* ------------------------------ floor -------------------------------- */

  const { map: floorMap, roughMap } = makeFloorMaps();
  let mirror = null;
  if (quality === 'high') {
    mirror = new Reflector(new THREE.PlaneGeometry(ROOM.W, ROOM.D), {
      clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x9aa4b0
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.002;
    scene.add(mirror);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.W, ROOM.D),
    new THREE.MeshStandardMaterial({
      map: floorMap, roughnessMap: roughMap, roughness: 1,
      metalness: 0.08, transparent: quality === 'high',
      opacity: quality === 'high' ? 0.82 : 1,
      envMapIntensity: quality === 'high' ? 0.5 : 1.3
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* --------------------------- roller door ------------------------------ */

  const doorGroup = new THREE.Group();
  const slatMat = M.steel(0x565d68, 0.42);
  const openGap = 1.9;                              /* door raised this much */
  for (let y = openGap + 0.1; y < doorH; y += 0.22) {
    const s = box(doorW - 0.2, 0.19, 0.06, slatMat, doorX, y, FRONT - 0.05);
    s.castShadow = s.receiveShadow = true;
    doorGroup.add(s);
  }
  doorGroup.add(box(0.22, doorH, 0.24, M.steel(0x3a4048, 0.5), doorX - doorW / 2, doorH / 2, FRONT - 0.06));
  doorGroup.add(box(0.22, doorH, 0.24, M.steel(0x3a4048, 0.5), doorX + doorW / 2, doorH / 2, FRONT - 0.06));
  scene.add(doorGroup);

  /* the world outside the gap — city glow plane */
  const cityMatN = new THREE.MeshBasicMaterial({ map: makeCityGlow(true), fog: false });
  const cityMatD = new THREE.MeshBasicMaterial({ map: makeCityGlow(false), fog: false });
  const city = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), cityMatN);
  city.position.set(doorX, 2.4, FRONT + 6);
  city.rotation.y = Math.PI;
  scene.add(city);

  /* ----------------------------- neon sign ------------------------------ */

  const neonTex = makeNeonSign();
  const neonMat = new THREE.MeshBasicMaterial({
    map: neonTex, transparent: true, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.25), neonMat);
  neon.position.set(-0.6, 3.55, BACK + 0.08);
  scene.add(neon);
  const neonBack = box(7.9, 2.3, 0.06, M.matte(0x0b0d11, 0.9), -0.6, 3.55, BACK + 0.04);
  scene.add(neonBack);
  const neonLight = new THREE.PointLight(BRAND.red, 14, 12, 1.8);
  neonLight.position.set(-0.6, 3.4, BACK + 1.2);
  scene.add(neonLight);

  /* ------------------------------ the S13 ------------------------------- */

  const car = new THREE.Group();
  const carW = 1.72;

  const bodyShape = new THREE.Shape();
  /* side profile, metres — tail at -2.25, nose at +2.3, y up from sills   */
  bodyShape.moveTo(-2.25, 0.02);
  bodyShape.lineTo(-2.32, 0.34);                        /* tail panel */
  bodyShape.quadraticCurveTo(-2.3, 0.46, -2.1, 0.475);  /* deck lip */
  bodyShape.lineTo(-0.55, 0.44);                        /* rear deck */
  bodyShape.quadraticCurveTo(0.5, 0.40, 1.35, 0.335);   /* bonnet line */
  bodyShape.quadraticCurveTo(2.05, 0.28, 2.28, 0.24);   /* nose wedge */
  bodyShape.lineTo(2.34, 0.05);                         /* bumper */
  bodyShape.lineTo(2.1, 0.0);
  bodyShape.lineTo(-2.25, 0.02);

  const extrude = { depth: carW, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.055, bevelSegments: 3, curveSegments: 14 };
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrude);
  bodyGeo.translate(0, 0, -carW / 2);
  const paint = new THREE.MeshPhysicalMaterial({
    color: BRAND.red, metalness: 0.65, roughness: 0.32,
    clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.4
  });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = body.receiveShadow = true;
  car.add(body);

  /* fastback greenhouse */
  const ghShape = new THREE.Shape();
  ghShape.moveTo(-1.62, 0.0);
  ghShape.quadraticCurveTo(-1.2, 0.34, -0.62, 0.385);   /* fast glass up to roof */
  ghShape.lineTo(0.02, 0.39);                           /* roof */
  ghShape.quadraticCurveTo(0.55, 0.36, 0.95, 0.02);     /* windscreen rake */
  ghShape.lineTo(-1.62, 0.0);
  const ghGeo = new THREE.ExtrudeGeometry(ghShape, {
    depth: carW * 0.82, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.045, bevelSegments: 2, curveSegments: 12
  });
  ghGeo.translate(0, 0.455, -carW * 0.82 / 2);
  const glass = new THREE.Mesh(ghGeo, new THREE.MeshPhysicalMaterial({
    color: 0x0a0f14, metalness: 0.4, roughness: 0.08,
    clearcoat: 1, envMapIntensity: 1.6
  }));
  glass.castShadow = true;
  car.add(glass);

  /* wheels */
  const tyreGeo = new THREE.TorusGeometry(0.245, 0.095, 12, 28);
  const rimGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.2, 20);
  const spokeGeo = new THREE.BoxGeometry(0.05, 0.3, 0.03);
  const tyreMat = M.matte(0x101114, 0.92);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 1, roughness: 0.22 });
  const wheelXs = [1.42, -1.42], wheelZ = carW / 2 + 0.02;
  for (const wx of wheelXs) for (const sz of [1, -1]) {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    for (let s = 0; s < 6; s++) {                       /* six-spoke deep dish */
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.z = (s / 6) * Math.PI * 2;
      sp.position.z = sz * 0.105;
      g.add(sp);
    }
    g.add(tyre); g.add(rim);
    g.position.set(wx, 0.34, sz * wheelZ);
    g.traverse(o => { o.castShadow = true; });
    car.add(g);
  }

  /* tail-light bar — the 200SX signature */
  const tail = box(0.06, 0.15, carW * 0.92, M.glow(0xff1e33, 2.6), -2.33, 0.42, 0);
  car.add(tail);
  /* number plate light */
  car.add(box(0.04, 0.09, 0.42, M.matte(0xd9dde2, 0.5), -2.34, 0.22, 0));

  /* pop-up headlight pods */
  const pods = [];
  const podGeo = new RoundedBoxGeometry(0.34, 0.07, 0.34, 3, 0.02);
  const lampFaceMat = M.glow(BRAND.cream, 0.0);
  for (const sz of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(1.98, 0.30, sz * 0.55);
    const pod = new THREE.Mesh(podGeo, paint);
    pod.position.set(0.17, 0.035, 0);
    pod.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.05), lampFaceMat);
    face.position.set(0.34, 0.035, 0);
    face.rotation.y = Math.PI / 2;
    pivot.add(pod); pivot.add(face);
    car.add(pivot);
    pods.push(pivot);
  }

  /* headlight beams + spots (activated on click) */
  const beamMat = new THREE.MeshBasicMaterial({
    color: BRAND.cream, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const beams = [], headSpots = [];
  for (const sz of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 24, 1, true), beamMat);
    cone.rotation.z = Math.PI / 2 + 0.06;
    cone.position.set(2.3 + 3.4, 0.18, sz * 0.55);
    car.add(cone); beams.push(cone);
    const sp = new THREE.SpotLight(BRAND.cream, 0, 16, 0.42, 0.5, 1.4);
    sp.position.set(2.15, 0.42, sz * 0.55);
    sp.target.position.set(9, -0.4, sz * 0.7);
    car.add(sp); car.add(sp.target);
    headSpots.push(sp);
  }

  car.position.set(0.4, 0.155, -1.5);
  car.rotation.y = -0.52;
  scene.add(car);

  /* two-post lift arms under the car (dressing) */
  const liftMat = M.steel(0x3d67c2, 0.45);
  for (const sz of [1, -1]) {
    const arm = box(3.4, 0.12, 0.3, liftMat, 0.4, 0.07, -1.5 + sz * 1.15, -0.52);
    arm.castShadow = true; scene.add(arm);
  }

  /* --------------------------- set dressing ----------------------------- */

  const dress = new THREE.Group();
  scene.add(dress);

  /* workbench + pegboard (about — right of back wall) */
  const bench = new THREE.Group();
  bench.position.set(8.2, 0, -6.9);
  const benchTop = box(3.4, 0.09, 1.05, M.steel(0x8b8f96, 0.35), 0, 0.92, 0);
  benchTop.castShadow = benchTop.receiveShadow = true;
  bench.add(benchTop);
  bench.add(box(3.2, 0.86, 0.9, M.matte(0xb8412f, 0.6), 0, 0.45, 0));
  const peg = box(3.2, 1.5, 0.06, M.matte(0x5b4632, 0.9), 0, 2.1, -0.52);
  bench.add(peg);
  for (let i = 0; i < 14; i++) {                        /* hanging tools */
    bench.add(box(0.05, 0.28 + Math.random() * 0.3, 0.05,
      M.steel(0x9aa0a8, 0.4), -1.4 + i * 0.21, 2.05 + Math.random() * 0.5, -0.46));
  }
  bench.add(box(0.5, 0.34, 0.34, M.matte(0xc9a12e, 0.7), -1.1, 1.13, 0.1, 0.4)); /* jerry can */
  dress.add(bench);

  /* rolling tool chest + tyre stack (experience) */
  const chest = new THREE.Group();
  chest.position.set(-3.4, 0, -5.6);
  const chestBody = box(1.15, 1.05, 0.6, M.matte(0xb8412f, 0.55), 0, 0.62, 0, 0.25);
  chestBody.castShadow = true;
  chest.add(chestBody);
  for (let i = 0; i < 4; i++) {
    chest.add(box(1.0, 0.16, 0.04, M.steel(0x22252b, 0.5), 0, 0.32 + i * 0.22, 0.31, 0.25));
  }
  dress.add(chest);
  const stack = new THREE.Group();
  stack.position.set(-6.3, 0, -6.4);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 10, 22), tyreMat);
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.14 + i * 0.27;
    t.rotation.z = Math.random();
    t.castShadow = true;
    stack.add(t);
  }
  dress.add(stack);

  /* R&D desk with three monitors (projects — left of back wall) */
  const lab = new THREE.Group();
  lab.position.set(-8.6, 0, -6.7);
  const desk = box(3.1, 0.07, 1.0, M.matte(0x2a2d33, 0.6), 0, 0.85, 0);
  desk.castShadow = desk.receiveShadow = true;
  lab.add(desk);
  lab.add(box(0.1, 0.85, 0.9, M.matte(0x1c1f24, 0.7), -1.45, 0.42, 0));
  lab.add(box(0.1, 0.85, 0.9, M.matte(0x1c1f24, 0.7), 1.45, 0.42, 0));
  const screens = [];
  [-1, 0, 1].forEach((sx, i) => {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.54),
      new THREE.MeshBasicMaterial({ map: makeMonitor(i * 5 + 3), fog: false }));
    scr.position.set(sx * 0.95, 1.42, -0.18 + Math.abs(sx) * 0.06);
    scr.rotation.y = -sx * 0.28;
    lab.add(scr);
    const bezel = box(0.94, 0.62, 0.05, M.matte(0x0c0e12, 0.5), sx * 0.95, 1.42, -0.22 + Math.abs(sx) * 0.06, -sx * 0.28);
    lab.add(bezel);
    screens.push(scr);
  });
  const labGlow = new THREE.PointLight(BRAND.cyan, 6, 6, 2);
  labGlow.position.set(0, 1.5, 0.7);
  lab.add(labGlow);
  /* tiny drone on a stand — the capstone cameo */
  const drone = new THREE.Group();
  drone.position.set(1.15, 1.02, 0.32);
  drone.add(box(0.16, 0.05, 0.16, M.matte(0x15181d, 0.5), 0, 0.09, 0));
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    drone.add(box(0.14, 0.02, 0.03, M.steel(0x8f959e, 0.4), ax * 0.11, 0.1, az * 0.11, Math.PI / 4 * ax * az));
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 12),
      M.matte(0x30343b, 0.6));
    rotor.position.set(ax * 0.17, 0.115, az * 0.17);
    drone.add(rotor);
  }
  drone.add(box(0.03, 0.03, 0.03, M.glow(0x37e08d, 2), 0.06, 0.12, 0));
  lab.add(drone);
  dress.add(lab);

  /* parts rack (skills — right wall) */
  const rack = new THREE.Group();
  rack.position.set(12.2, 0, -2.2);
  rack.rotation.y = -Math.PI / 2;
  for (let s = 0; s < 4; s++) {
    const shelf = box(4.6, 0.06, 1.0, M.steel(0xd0662f, 0.55), 0, 0.4 + s * 0.75, 0);
    shelf.castShadow = shelf.receiveShadow = true;
    rack.add(shelf);
  }
  for (const x of [-2.25, 0, 2.25]) {
    rack.add(box(0.09, 3.1, 0.09, M.steel(0xd0662f, 0.55), x, 1.55, -0.46));
    rack.add(box(0.09, 3.1, 0.09, M.steel(0xd0662f, 0.55), x, 1.55, 0.46));
  }
  const crateCols = [0x8a6a3c, 0x9aa0a8, 0x475059, 0x8a6a3c, 0x6b6154];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.22) continue;
    const cw = 0.5 + Math.random() * 0.45, chh = 0.3 + Math.random() * 0.3;
    const crate = box(cw, chh, 0.7, M.matte(crateCols[(s + i) % 5], 0.85),
      -1.9 + i * 0.95 + Math.random() * 0.15, 0.43 + s * 0.75 + chh / 2, 0,
      (Math.random() - 0.5) * 0.15);
    crate.castShadow = true;
    rack.add(crate);
  }
  dress.add(rack);

  /* trophy shelf (awards — left wall) */
  const trophyWall = new THREE.Group();
  trophyWall.position.set(-12.9, 0, 0.6);
  trophyWall.rotation.y = Math.PI / 2;
  const shelfBoard = box(2.6, 0.06, 0.5, M.matte(0x3a3126, 0.7), 0, 1.85, 0);
  shelfBoard.castShadow = shelfBoard.receiveShadow = true;
  trophyWall.add(shelfBoard);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a93c, metalness: 1, roughness: 0.25 });
  [-0.8, 0, 0.8].forEach((tx, i) => {
    const cup = new THREE.Group();
    cup.position.set(tx, 1.88, 0);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.045, 0.16, 16), gold);
    bowl.position.y = 0.22;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 10), gold);
    stem.position.y = 0.08;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), M.matte(0x1c1a17, 0.5));
    base.position.y = 0.025;
    cup.add(bowl, stem, base);
    cup.scale.setScalar(i === 0 ? 1.15 : 0.92);
    cup.traverse(o => { o.castShadow = true; });
    trophyWall.add(cup);
  });
  const trophySpot = new THREE.SpotLight(0xffd9a0, 20, 5, 0.5, 0.55, 1.6);
  trophySpot.position.set(1.6, 3.2, 1.6);
  trophySpot.target = shelfBoard;
  trophyWall.add(trophySpot);
  dress.add(trophyWall);

  /* EXIT sign over the door */
  const exit = box(0.66, 0.24, 0.08, M.glow(0x37e08d, 2.2), doorX, doorH + 0.35, FRONT - 0.12);
  scene.add(exit);

  /* wall clock, cables, extinguisher — small truths */
  const ext = box(0.16, 0.44, 0.16, M.matte(0xc22030, 0.5), RIGHT - 0.3, 1.1, 3.4);
  scene.add(ext);

  /* ------------------------------ lighting ------------------------------ */

  const hemi = new THREE.HemisphereLight(0x3c465c, 0x0c0e12, 0.5);
  scene.add(hemi);

  /* hanging work lamps */
  const lampDefs = [
    { x: 0.4, z: -1.5, real: true },                    /* over the car */
    { x: -8.4, z: -5.2, real: true },                   /* over the lab  */
    { x: 8.2, z: -5.4, real: false },
    { x: 8.0, z: 2.6, real: false }
  ];
  const lampMeshes = [];
  for (const L of lampDefs) {
    const g = new THREE.Group();
    g.position.set(L.x, 0, L.z);
    g.add(box(0.02, 1.1, 0.02, M.matte(0x14161a, 0.6), 0, ROOM.H - 0.55, 0));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x20343c, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.y = ROOM.H - 1.12;
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), M.glow(0xffd9a0, 3));
    bulb.position.y = ROOM.H - 1.2;
    g.add(bulb);
    if (L.real) {
      const sp = new THREE.SpotLight(0xffc98a, 60, 12, 0.62, 0.45, 1.6);
      sp.position.set(0, ROOM.H - 1.15, 0);
      sp.target.position.set(0, 0, 0);
      sp.castShadow = true;
      sp.shadow.mapSize.setScalar(quality === 'high' ? 1024 : 512);
      sp.shadow.bias = -0.0005;
      g.add(sp); g.add(sp.target);
    } else {
      const pt = new THREE.PointLight(0xffc98a, 10, 7, 1.9);
      pt.position.y = ROOM.H - 1.3;
      g.add(pt);
    }
    scene.add(g);
    lampMeshes.push({ group: g, bulb, def: L });
  }

  /* light through the roller-door gap */
  const doorLight = new THREE.DirectionalLight(0xffb36b, 0);
  doorLight.position.set(doorX + 3, 2.6, FRONT + 8);
  doorLight.target.position.set(doorX - 2, 0, 0);
  doorLight.castShadow = quality === 'high';
  if (doorLight.castShadow) {
    doorLight.shadow.mapSize.setScalar(1024);
    doorLight.shadow.camera.left = -10; doorLight.shadow.camera.right = 10;
    doorLight.shadow.camera.top = 8; doorLight.shadow.camera.bottom = -4;
    doorLight.shadow.bias = -0.0006;
  }
  scene.add(doorLight); scene.add(doorLight.target);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.2, openGap),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  doorGlow.position.set(doorX, openGap / 2 + 0.05, FRONT - 0.02);
  doorGlow.rotation.y = Math.PI;
  scene.add(doorGlow);

  /* ------------------------------ dust ---------------------------------- */

  const DUST_N = quality === 'high' ? 340 : 160;
  const dustPos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i++) {
    const nearLamp = lampDefs[i % lampDefs.length];
    dustPos[i * 3] = nearLamp.x + (Math.random() - 0.5) * 3.4;
    dustPos[i * 3 + 1] = Math.random() * (ROOM.H - 0.6);
    dustPos[i * 3 + 2] = nearLamp.z + (Math.random() - 0.5) * 3.4;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffe6bf, size: 0.02, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(dust);

  /* --------------------------- post-processing --------------------------- */

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.85, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ------------------------------ theming -------------------------------- */

  let themeName = 'night';
  function setTheme(t) {
    themeName = t;
    const night = t === 'night';
    scene.fog.color.set(night ? 0x0a0d14 : 0x171018);
    scene.background.set(night ? 0x05070c : 0x120b10);
    hemi.color.set(night ? 0x3c465c : 0x6b4a3a);
    hemi.intensity = night ? 0.5 : 0.7;
    doorLight.color.set(night ? 0x7ea0ff : 0xffb36b);
    doorLight.intensity = night ? 0.5 : 3.4;
    doorGlow.material.color.set(night ? 0x9fc3ff : 0xffb36b);
    doorGlow.material.opacity = night ? 0.10 : 0.32;
    city.material = night ? cityMatN : cityMatD;
    neonMat.opacity = night ? 1 : 0.68;
    neonLight.intensity = night ? 16 : 7;
    bloom.strength = night ? 0.62 : 0.42;
    renderer.toneMappingExposure = night ? 1.18 : 1.06;
    scene.environmentIntensity = night ? 0.35 : 0.5;
    for (const l of lampMeshes) l.bulb.material.emissiveIntensity = night ? 3 : 1.6;
  }
  setTheme(opts.theme || 'night');

  /* --------------------------- headlight state ---------------------------- */

  let popped = false, popT = 0;
  function setHeadlights(on) {
    popped = on;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitCar(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(car, true).length > 0;
  }

  /* ----------------------------- camera rig ------------------------------ */

  const camPos = new THREE.Vector3(...SHOTS[0].pos);
  const camLook = new THREE.Vector3(...SHOTS[0].look);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  let scrollU = 0, pointerX = 0, pointerY = 0;

  const smooth = (x) => x * x * (3 - 2 * x);

  function camTargets(u) {
    const i = Math.min(SHOTS.length - 2, Math.floor(u));
    const f = smooth(Math.min(1, Math.max(0, u - i)));
    const a = SHOTS[i], b = SHOTS[i + 1];
    tmpA.fromArray(a.pos).lerp(tmpB.fromArray(b.pos), f);
    camPos.lerp(tmpA, reduced ? 1 : 0.08);
    tmpA.fromArray(a.look).lerp(tmpB.fromArray(b.look), f);
    camLook.lerp(tmpA, reduced ? 1 : 0.08);
  }

  /* ------------------------------- frame --------------------------------- */

  const clock = { t: 0 };
  let flicker = 1, flickerNext = 2600;

  function render(dt, now) {
    clock.t = now;

    camTargets(scrollU);
    camera.position.copy(camPos);
    if (!reduced) {
      camera.position.x += Math.sin(now * 0.00021) * 0.07 + pointerX * 0.16;
      camera.position.y += Math.cos(now * 0.00017) * 0.05 + pointerY * 0.1;
    }
    tmpA.copy(camLook);
    if (!reduced) { tmpA.x += pointerX * 0.3; tmpA.y += pointerY * 0.2; }
    camera.lookAt(tmpA);

    /* pop-up pods ease open / closed */
    const target = popped ? 1 : 0;
    popT += (target - popT) * (reduced ? 1 : Math.min(1, dt * 0.008));
    const ang = 1.1 * popT;                       /* front edge tilts up */
    pods[0].rotation.z = ang; pods[1].rotation.z = ang;
    lampFaceMat.emissiveIntensity = 4 * popT;
    const beamOn = popT * (themeName === 'night' ? 0.16 : 0.06);
    beams[0].material.opacity = beamOn;
    headSpots[0].intensity = headSpots[1].intensity = 90 * popT;

    /* dust drift */
    if (!reduced) {
      const p = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST_N; i++) {
        p[i * 3 + 1] -= 0.00012 * dt * (1 + (i % 5) * 0.3);
        p[i * 3] += Math.sin(now * 0.0004 + i) * 0.0006;
        if (p[i * 3 + 1] < 0.05) p[i * 3 + 1] = ROOM.H - 0.7;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    /* one lamp flickers, occasionally, at midnight */
    if (!reduced && themeName === 'night') {
      flickerNext -= dt;
      if (flickerNext <= 0) {
        flicker = 0.35 + Math.random() * 0.65;
        flickerNext = flicker > 0.9 ? 1800 + Math.random() * 4200 : 40 + Math.random() * 90;
      }
      lampMeshes[3].bulb.material.emissiveIntensity = 3 * flicker;
    }

    /* idle rotor spin on the desk drone */
    if (!reduced) drone.rotation.y = now * 0.0004;

    composer.render();
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }

  return {
    setTheme,
    setScroll(u) { scrollU = Math.min(SHOTS.length - 1, Math.max(0, u)); },
    setPointer(nx, ny) { pointerX = nx; pointerY = ny; },
    setHeadlights,
    get headlights() { return popped; },
    hitCar,
    render,
    resize
  };
}
