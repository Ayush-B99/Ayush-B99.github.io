/* ==========================================================================
   BEEKUM GARAGE — scene3d.js · "the sky lounge"
   A real-time showroom at cruising altitude: minimal black-and-glass hall,
   a Rocket Bunny S13 turning on a lit dais, a grand piano you can actually
   play, two guitars that strum — and beyond the curtain wall, open sky:
   stars at night, sunset over the cloud deck by day.

   Everything except the car is generated in code — geometry, textures,
   even the instrument sounds (WebAudio synthesis, no audio files).
   Car model: "2013 Rocket Bunny V2 – Nissan S13" by Ddiaz Design,
   CC BY-NC-SA 4.0 — see README for the source link.
   ========================================================================== */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================== TUNING ==================================== */

/* Camera keyframes — one per section. Edit these to reframe any shot.       */
const SHOTS = [
  { pos: [0.0, 1.55, 8.8],   look: [0.0, 1.05, 0.0] },    // 0 hero — the dais
  { pos: [-6.0, 1.5, 5.9],   look: [-9.9, 1.0, 3.0] },    // 1 about — music lounge
  { pos: [5.4, 1.35, 5.3],   look: [-1.6, 1.0, -3.2] },   // 2 experience — gallery run
  { pos: [6.0, 1.4, -1.3],   look: [7.8, 1.05, -3.7] },   // 3 projects — drone plinth
  { pos: [-10.9, 1.5, -0.9], look: [-14.6, 1.35, -3.9] }, // 4 skills — parts wall
  { pos: [-11.3, 1.45, 6.9], look: [-14.7, 1.25, 7.7] },  // 5 awards — trophy vitrine
  { pos: [9.6, 3.7, 9.8],    look: [-2.2, 1.3, -2.4] }    // 6 contact — the whole chapel
];

/* The loader tries these in order and skips anything under 100 KB (a
   placeholder or LFS pointer, not a model). Drop the Sketchfab GLB into
   assets/models/ under ANY of these names and it will be found.            */
const CAR_URLS = [
  'assets/models/rb_s13.glb',
  'assets/models/rb_13.glb',
  'assets/models/car.glb',
  'assets/models/2013_rocket_bunny_v2_-_nissan_s13_240sx__180sx.glb',
  'assets/rb_s13.glb',
  'assets/rb_13.glb',
  'rb_s13.glb',
  'rb_13.glb',
  '2013_rocket_bunny_v2_-_nissan_s13_240sx__180sx.glb'
];
/* Set to a hex (e.g. 0x8f1626) to repaint the body panels; null = original. */
const PAINT_OVERRIDE = null;
const DAIS_RPM = 1.45;               // turntable speed, revolutions / minute
const PIANO_SCALE = 1.12;            // slightly over-life-size = easier to tap

const THEMES = {
  /* "day" = AFTERGLOW — sunset over the cloud deck, warm crimson interior */
  day: {
    accent: 0xff4d66, accentDim: 0x8f1626,
    fog: 0x120810, fogD: 0.013,
    hemiSky: 0x3a1a22, hemiGround: 0x080409, hemiI: 0.6,
    keyLight: 0xffe2d0, keyI: 160,
    cove: 0xff3050, sign: 0xff4d66,
    sky: 'day', orb: 0xffd9a0, orbHalo: 0xff9a5a, orbHaloOp: 0.5, orbY: 2.4,
    cloud: 0x9a4636,
    haloTint: 0xffe0c8, strip: 0xffd9c2, pendant: 0xffd9b8,
    glowTint: 0xff2b4d
  },
  /* "night" = ORBIT — starfield, silver moon, violet-cyan interior         */
  night: {
    accent: 0xb48cff, accentDim: 0x4b2a8f,
    fog: 0x06060f, fogD: 0.015,
    hemiSky: 0x191430, hemiGround: 0x040308, hemiI: 0.6,
    keyLight: 0xdfe4ff, keyI: 150,
    cove: 0x8a5cff, sign: 0xb48cff,
    sky: 'night', orb: 0xe6ecff, orbHalo: 0xa8b8ff, orbHaloOp: 0.3, orbY: 4.5,
    cloud: 0x2c3450,
    haloTint: 0xcfd6ff, strip: 0xcdd5ff, pendant: 0xffe6cf,
    glowTint: 0x8a5cff
  }
};

/* ========================================================================== */

export function createGarage(canvas, opts = {}) {
  const quality = opts.quality || 'high';
  const reduced = !!opts.reduced;
  const HIGH = quality === 'high';

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: HIGH, powerPreference: 'high-performance'
  });
  /* DPR is the #1 fragment cost on retina laptops — 1.5 is visually
     indistinguishable here and roughly halves the pixel work vs 2.0        */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, HIGH ? 1.5 : 1.2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030308);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 130);

  /* ---- studio environment — what makes car paint look real -------------- *
   * A black void with a few huge soft light panels. PMREM'd, this gives    *
   * long rolling highlights across the bodywork like a photo studio.       *
   * Two variants, tinted per theme.                                        */
  const pmrem = new THREE.PMREMGenerator(renderer);
  function studioEnv(tint) {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x000000);
    const panel = (w, h, x, y, z, ry, rx, color, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      m.material.color.multiplyScalar(i);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      env.add(m);
    };
    /* big overhead softbox strip — the main "showroom ceiling" highlight   */
    panel(14, 3.2, 0, 7.5, 0, 0, Math.PI / 2, 0xffffff, 5.5);
    /* two angled side strips, one cool one tinted                           */
    panel(3.0, 9, -9, 3.4, 0, Math.PI / 2.4, 0, 0xcfd8ff, 2.6);
    panel(3.0, 9, 9, 3.4, 0, -Math.PI / 2.4, 0, tint, 2.2);
    /* long low warm kick — candlelight bounce                               */
    panel(16, 1.2, 0, 0.7, 8.5, Math.PI, 0, 0xffc9a0, 1.1);
    /* faint floor bounce so undersides aren't pitch black                   */
    panel(12, 12, 0, -1.5, 0, 0, -Math.PI / 2, 0x1a1a24, 1.0);
    /* sigma must stay <= ~0.04 — beyond that three.js clips the blur and
       warns ("requested 30 samples when the maximum is set to 20")         */
    return pmrem.fromScene(env, 0.035).texture;
  }
  const ENV = { day: studioEnv(0xff9aa8), night: studioEnv(0xb9a0ff) };
  pmrem.dispose();
  scene.environment = ENV.night;
  scene.environmentIntensity = 1.0;

  /* ------------------------------ helpers -------------------------------- */

  const TAU = Math.PI * 2;
  const box3 = new THREE.Box3();
  const v3 = new THREE.Vector3();

  function cnv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function ctex(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = HIGH ? 8 : 2;
    return t;
  }
  const mat = {
    std: (p) => new THREE.MeshStandardMaterial(p),
    phys: (p) => new THREE.MeshPhysicalMaterial(p),
    flat: (p) => new THREE.MeshBasicMaterial(p)
  };
  const IRON = mat.std({ color: 0x0c0c10, roughness: 0.45, metalness: 0.85 });
  const IRON_SOFT = mat.std({ color: 0x121218, roughness: 0.6, metalness: 0.6 });
  const CHROME = mat.std({ color: 0xf2f4f8, roughness: 0.12, metalness: 1.0 });
  const BLACK_GLOSS = mat.phys({
    color: 0x07070b, roughness: 0.16, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12
  });
  const GOLD = mat.std({ color: 0xd8a53f, roughness: 0.28, metalness: 1.0 });

  /* ======================================================================== *
   *  TEXTURES (all painted in code)                                          *
   * ======================================================================== */

  function marbleTexture() {
    const S = HIGH ? 1024 : 512;
    const [c, x] = cnv(S, S);
    x.fillStyle = '#08080c'; x.fillRect(0, 0, S, S);
    const sheen = x.createRadialGradient(S * .5, S * .42, S * .05, S * .5, S * .5, S * .75);
    sheen.addColorStop(0, 'rgba(70,66,92,0.16)');
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sheen; x.fillRect(0, 0, S, S);
    /* veins — drunk walks of pale violet-grey */
    for (let i = 0; i < 26; i++) {
      let px = Math.random() * S, py = Math.random() * S;
      let a = Math.random() * TAU;
      const seg = 40 + Math.random() * 90;
      x.strokeStyle = `rgba(${150 + Math.random() * 40 | 0},${140 + Math.random() * 30 | 0},${170 + Math.random() * 50 | 0},${0.028 + Math.random() * 0.05})`;
      x.lineWidth = 0.6 + Math.random() * 1.8;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < seg; s++) {
        a += (Math.random() - 0.5) * 0.9;
        px += Math.cos(a) * 5; py += Math.sin(a) * 5;
        x.lineTo(px, py);
      }
      x.stroke();
      /* occasional fine branch */
      if (Math.random() < 0.6) {
        x.lineWidth = 0.5;
        x.strokeStyle = 'rgba(160,150,190,0.04)';
        x.beginPath(); x.moveTo(px, py);
        for (let s = 0; s < 22; s++) {
          a += (Math.random() - 0.5) * 1.4;
          px += Math.cos(a) * 4; py += Math.sin(a) * 4;
          x.lineTo(px, py);
        }
        x.stroke();
      }
    }
    /* tile grid — big slabs */
    x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 2;
    const T = S / 4;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(i * T, 0); x.lineTo(i * T, S); x.stroke();
      x.beginPath(); x.moveTo(0, i * T); x.lineTo(S, i * T); x.stroke();
    }
    const t = ctex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3.4, 2.2);
    return t;
  }

  function skyTexture(mode) {
    const W = 2048, H = 1024;
    const [c, x] = cnv(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    if (mode === 'day') {           /* sunset, seen from above the clouds */
      g.addColorStop(0, '#150a2c'); g.addColorStop(0.42, '#38122f');
      g.addColorStop(0.7, '#7d2a2e'); g.addColorStop(0.88, '#c4632f');
      g.addColorStop(1, '#dd9350');
    } else {                        /* clean high-altitude night */
      g.addColorStop(0, '#010107'); g.addColorStop(0.55, '#070a1c');
      g.addColorStop(1, '#12142e');
    }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (mode === 'day') {
      /* long lit cloud streaks near the horizon */
      for (let i = 0; i < 26; i++) {
        const y = H * (0.6 + Math.random() * 0.34);
        const w = 120 + Math.random() * 420, h = 5 + Math.random() * 14;
        const cx2 = Math.random() * W;
        const grad = x.createRadialGradient(cx2, y, 2, cx2, y, w / 2);
        const warmth = 200 + (Math.random() * 55 | 0);
        grad.addColorStop(0, `rgba(255,${warmth},150,${0.16 + Math.random() * 0.2})`);
        grad.addColorStop(1, 'rgba(255,150,90,0)');
        x.fillStyle = grad;
        x.save(); x.translate(cx2, y); x.scale(1, h / w); x.translate(-cx2, -y);
        x.beginPath(); x.arc(cx2, y, w / 2, 0, TAU); x.fill(); x.restore();
      }
    } else {
      /* stars — small and mostly dim on purpose, so the bloom pass can't
         catch them and strobe (that was the old city-flicker)              */
      for (let i = 0; i < 520; i++) {
        const sx = Math.random() * W, sy = Math.random() * H * 0.86;
        const r = Math.random() < 0.06 ? 1.6 : 0.9;
        const a = 0.18 + Math.random() * (Math.random() < 0.12 ? 0.6 : 0.3);
        x.fillStyle = `rgba(${215 + Math.random() * 40 | 0},${220 + Math.random() * 35 | 0},255,${a})`;
        x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
      }
      const mw = x.createLinearGradient(0, 0, W, H * 0.5);
      mw.addColorStop(0, 'rgba(120,120,190,0)');
      mw.addColorStop(0.5, 'rgba(150,140,210,0.05)');
      mw.addColorStop(1, 'rgba(120,120,190,0)');
      x.fillStyle = mw;
      x.fillRect(0, 0, W, H * 0.7);
    }
    return ctex(c);
  }

  function cloudTexture() {
    /* grayscale cumulus tops — tinted per theme by the material colour     */
    const W = 1024, H = 512;
    const [c, x] = cnv(W, H);
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const cx2 = Math.random() * W, cy = Math.random() * H;
      const r = 24 + Math.random() * 70;
      const bright = 120 + (Math.random() * 135 | 0);
      const g2 = x.createRadialGradient(cx2, cy, r * 0.1, cx2, cy, r);
      g2.addColorStop(0, `rgba(${bright},${bright},${bright + 8},${0.22 + Math.random() * 0.2})`);
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g2;
      x.beginPath(); x.arc(cx2, cy, r, 0, TAU); x.fill();
    }
    return ctex(c);
  }

  function neonSignTexture() {
    const [c, x] = cnv(1024, 300);
    x.clearRect(0, 0, 1024, 300);
    x.textAlign = 'center';
    const glow = (blur, alpha, draw) => {
      x.save(); x.shadowColor = `rgba(255,255,255,${alpha})`;
      x.shadowBlur = blur; draw(); x.restore();
    };
    x.fillStyle = '#ffffff';
    x.font = '700 92px Michroma, sans-serif';
    glow(34, 0.9, () => x.fillText('BEEKUM', 512, 118));
    glow(34, 0.9, () => x.fillText('BEEKUM', 512, 118));
    x.font = '700 52px Michroma, sans-serif';
    glow(26, 0.85, () => x.fillText('G A R A G E', 512, 196));
    x.font = '400 40px sans-serif';
    glow(20, 0.8, () => x.fillText('ビークム・ガレージ', 512, 262));
    return ctex(c);
  }

  function underglowTexture() {
    const S = 256;
    const [c, x] = cnv(S, S);
    const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return ctex(c);
  }

  function labelTexture(lines, w = 256, h = 128, font = '600 26px Overpass, sans-serif', color = '#cfd4e0') {
    const [c, x] = cnv(w, h);
    x.fillStyle = 'rgba(8,8,12,0.0)'; x.fillRect(0, 0, w, h);
    x.fillStyle = color; x.font = font; x.textAlign = 'center';
    lines.forEach((L, i) => x.fillText(L, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 30 + 9));
    return ctex(c);
  }

  function screenTexture(kind) {
    const [c, x] = cnv(256, 160);
    x.fillStyle = '#05070c'; x.fillRect(0, 0, 256, 160);
    x.font = '11px "Share Tech Mono", monospace';
    if (kind === 'code') {
      const cols = ['#b48cff', '#57d7e6', '#ff5470', '#8ea3c0', '#ffd28f'];
      for (let r = 0; r < 11; r++) {
        let cx2 = 10 + (Math.random() * 22 | 0);
        const n = 2 + Math.random() * 4 | 0;
        for (let k = 0; k < n; k++) {
          const w2 = 12 + Math.random() * 46 | 0;
          x.fillStyle = cols[Math.random() * cols.length | 0];
          x.globalAlpha = 0.75;
          x.fillRect(cx2, 14 + r * 13, w2, 7);
          cx2 += w2 + 8;
        }
      }
      x.globalAlpha = 1;
    } else {
      x.strokeStyle = '#57d7e6'; x.lineWidth = 2; x.beginPath();
      for (let i = 0; i <= 60; i++) {
        const px = 10 + i * 4;
        const py = 110 - Math.abs(Math.sin(i * 0.4)) * (24 + 40 * Math.exp(-((i - 34) ** 2) / 160));
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
      x.fillStyle = '#8ea3c0'; x.fillText('gesture.stream — live', 12, 20);
    }
    return ctex(c);
  }

  /* ======================================================================== *
   *  ROOM — floor, glass, arches, columns, coves                             *
   * ======================================================================== */

  const ROOM = { w: 34, d: 22, h: 6.5 };          // x, z, y
  const root = new THREE.Group();
  scene.add(root);

  /* floor — translucent black marble. A mirrored clone of the set sits
     UNDER this plane (see MIRROR WORLD below): a real planar reflection
     for the cost of a few extra draw calls, instead of the old Reflector
     which re-rendered the entire scene every frame.                        */
  const marble = mat.phys({
    map: marbleTexture(),
    color: 0xffffff,
    roughness: 0.3, metalness: 0.1,
    clearcoat: 0.9, clearcoatRoughness: 0.18,
    transparent: true, opacity: 0.8
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), marble);
  floor.renderOrder = 1;                 // after the mirror world beneath it
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  /* ceiling */
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    mat.std({ color: 0x0a0a10, roughness: 0.9, metalness: 0.1 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  root.add(ceil);

  /* solid left wall + front/right partial walls (camera side stays open)    */
  const wallMat = mat.std({ color: 0x0b0b11, roughness: 0.85, metalness: 0.12 });
  function wall(w, h, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.receiveShadow = true;
    root.add(m); return m;
  }
  wall(ROOM.d, ROOM.h, -ROOM.w / 2, ROOM.h / 2, 0, Math.PI / 2);      // left (display wall)
  wall(ROOM.d, ROOM.h, ROOM.w / 2, ROOM.h / 2, 0, -Math.PI / 2);      // right
  wall(ROOM.w, ROOM.h, 0, ROOM.h / 2, ROOM.d / 2, Math.PI);           // behind camera

  /* --- the glass wall: seven pointed-arch bays, city behind ---------------- */

  const glassMat = mat.phys({
    color: 0x8fa4c8, roughness: 0.06, metalness: 0,
    transparent: true, opacity: 0.09,
    clearcoat: 1, clearcoatRoughness: 0.05,
    side: THREE.DoubleSide, depthWrite: false
  });
  const BAYS = 7, bayW = ROOM.w / BAYS;
  const glassZ = -ROOM.d / 2;

  const colonnade = new THREE.Group();   // everything here gets mirrored
  root.add(colonnade);

  /* --- curtain wall: floor-to-ceiling glass, slim mullions, all glazing
         bars sit clearly IN FRONT of the glass plane — coplanar overlap was
         the source of the shimmer along the old arches ------------------- */
  const mullionMat = mat.std({ color: 0x0d0d12, roughness: 0.4, metalness: 0.8 });
  for (let i = 0; i < BAYS; i++) {
    const cx = -ROOM.w / 2 + bayW * (i + 0.5);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(bayW - 0.12, ROOM.h - 0.2), glassMat);
    glass.renderOrder = 4;
    glass.position.set(cx, ROOM.h / 2 - 0.06, glassZ);
    root.add(glass);
  }
  for (let i = 0; i <= BAYS; i++) {
    const mx = -ROOM.w / 2 + bayW * i;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, ROOM.h, 0.12), mullionMat);
    post.position.set(mx, ROOM.h / 2, glassZ + 0.09);
    colonnade.add(post);
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.06, 0.1), mullionMat);
  transom.position.set(0, 2.35, glassZ + 0.09);
  colonnade.add(transom);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.24, 0.16), mullionMat);
  fascia.position.set(0, ROOM.h - 0.12, glassZ + 0.11);
  colonnade.add(fascia);
  /* three structural pillars, edge-lit */
  const pillarLedMat = mat.std({
    color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 1.5, roughness: 0.5
  });
  for (let i = 1; i < BAYS; i += 2) {
    const px = -ROOM.w / 2 + bayW * i;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.26, ROOM.h, 0.26), BLACK_GLOSS);
    col.position.set(px, ROOM.h / 2, glassZ + 0.55);
    col.castShadow = true;
    colonnade.add(col);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.028, ROOM.h - 0.7, 0.02), pillarLedMat);
    led.position.set(px, ROOM.h / 2, glassZ + 0.69);
    colonnade.add(led);
  }

  /* --- the view: cruising altitude ----------------------------------------
     night = starfield · day = sunset over the cloud deck                   */
  const backdrop = new THREE.Group();    // mirrored — sky in the floor
  root.add(backdrop);
  const skyTexs = { night: skyTexture('night'), day: skyTexture('day') };
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 40),
    mat.flat({ map: skyTexs.night, fog: false })
  );
  sky.name = 'sky';
  sky.position.set(0, 6.4, glassZ - 22);
  backdrop.add(sky);

  const orb = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48),
    mat.flat({ color: 0xe6ecff, fog: false, transparent: true, opacity: 0.98 }));
  orb.position.set(6.5, 4.5, glassZ - 25.2);
  backdrop.add(orb);
  const orbHalo = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48),
    mat.flat({
      map: underglowTexture(), color: 0xa8b8ff, fog: false,
      transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false
    }));
  orbHalo.position.copy(orb.position); orbHalo.position.z -= 0.1;
  backdrop.add(orbHalo);

  const cloudTex = cloudTexture();
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.repeat.set(2.6, 1.5);
  /* The deck sits BELOW eye level, so without a clip it would slide under
     the (translucent) marble floor and fight the mirror world — that was
     the light-mode flicker. This plane keeps it strictly beyond the glass. */
  const outsideOnly = new THREE.Plane(new THREE.Vector3(0, 0, -1), glassZ - 0.5);
  const cloudDeck = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 62),
    mat.flat({
      map: cloudTex, color: 0x2c3450, fog: false,
      transparent: true, opacity: 0.96, depthWrite: false,
      clippingPlanes: [outsideOnly]
    })
  );
  cloudDeck.rotation.x = -Math.PI / 2;
  cloudDeck.position.set(0, -3.2, glassZ - 34);
  cloudDeck.renderOrder = -1;
  root.add(cloudDeck);                    // deliberately NOT mirrored

  /* neon cove strips along the ceiling edges                                */
  const coveMat = mat.std({
    color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 2.4, roughness: 0.5
  });
  [[0, ROOM.h - 0.12, glassZ + 0.35, ROOM.w - 1, 0],
   [0, ROOM.h - 0.12, ROOM.d / 2 - 0.35, ROOM.w - 1, 0],
   [-ROOM.w / 2 + 0.35, ROOM.h - 0.12, 0, ROOM.d - 1, Math.PI / 2],
   [ROOM.w / 2 - 0.35, ROOM.h - 0.12, 0, ROOM.d - 1, Math.PI / 2]
  ].forEach(([x, y, z, len, ry]) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), coveMat);
    s.position.set(x, y, z); s.rotation.y = ry;
    root.add(s);
  });

  /* neon sign on the left display wall                                      */
  const signMat = mat.flat({
    map: neonSignTexture(), color: 0xb48cff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.58), signMat);
  sign.position.set(-ROOM.w / 2 + 0.06, 4.35, 3.2);
  sign.rotation.y = Math.PI / 2;
  root.add(sign);
  const signLight = new THREE.PointLight(0xb48cff, 26, 9, 2);
  signLight.position.set(-ROOM.w / 2 + 0.9, 4.3, 3.2);
  root.add(signLight);

  /* ======================================================================== *
   *  LIGHTS                                                                  *
   * ======================================================================== */

  const hemi = new THREE.HemisphereLight(0x191430, 0x040308, 0.55);
  root.add(hemi);

  const key = new THREE.SpotLight(0xdfe4ff, 150, 20, 0.5, 0.45, 1.6);
  key.position.set(0, ROOM.h - 0.25, 0.4);
  key.target.position.set(0, 0.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(HIGH ? 2048 : 1024, HIGH ? 2048 : 1024);
  key.shadow.bias = -0.0004;
  root.add(key, key.target);

  /* two rim kickers raking the car from behind — edge highlights that
     separate the bodywork from the dark glass                              */
  const rimA = new THREE.SpotLight(0x9fb4ff, 70, 18, 0.62, 0.65, 1.8);
  rimA.position.set(-6.2, 4.7, -6.8);
  rimA.target.position.set(0, 0.85, 0);
  root.add(rimA, rimA.target);
  const rimB = new THREE.SpotLight(0xffd0ba, 46, 18, 0.62, 0.65, 1.8);
  rimB.position.set(6.6, 4.3, -5.6);
  rimB.target.position.set(0, 0.85, 0);
  root.add(rimB, rimB.target);

  const loungeSpot = new THREE.SpotLight(0xffe6c8, 60, 14, 0.55, 0.5, 1.7);
  loungeSpot.position.set(-9.4, ROOM.h - 0.3, 3.3);
  loungeSpot.target.position.set(-9.8, 0.8, 3.4);
  loungeSpot.castShadow = HIGH;
  if (HIGH) { loungeSpot.shadow.mapSize.set(1024, 1024); loungeSpot.shadow.bias = -0.0004; }
  root.add(loungeSpot, loungeSpot.target);

  const moonDir = new THREE.DirectionalLight(0x8f9dcc, 0.5);
  moonDir.position.set(2, 5.5, -9);
  moonDir.target.position.set(0, 0, 2);
  root.add(moonDir, moonDir.target);

  function makeSpot(x, z, tx, tz, color = 0xffffff, i = 26, angle = 0.42) {
    const s = new THREE.SpotLight(color, i, 12, angle, 0.55, 1.8);
    s.position.set(x, ROOM.h - 0.35, z);
    s.target.position.set(tx, 0.9, tz);
    root.add(s, s.target);
    return s;
  }
  const plinthSpot = makeSpot(7.4, -2.6, 7.8, -3.7, 0xcfd8ff, 40, 0.3);
  const partsSpot = makeSpot(-13.4, -3.9, -14.7, -3.9, 0xffe9d2, 30, 0.5);
  const vitrineSpot = makeSpot(-13.5, 7.6, -14.7, 7.7, 0xffe9d2, 30, 0.42);

  /* ----------------------- sleek light package ---------------------------
     dais halo ring · linear pendants · recessed ceiling strips ·
     under-lit floor grooves. Everything static and calm on purpose.        */

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.75, 0.055, 12, 96),
    mat.std({ color: 0x0a0a0c, emissive: 0xcfd6ff, emissiveIntensity: 2.1, roughness: 0.4 })
  );
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.set(0, 4.7, 0);
  root.add(haloRing);
  const haloDrop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ROOM.h - 4.7, 5), IRON_SOFT);
  haloDrop.position.set(0, (ROOM.h + 4.7) / 2, 0);
  root.add(haloDrop);
  const haloLight = new THREE.PointLight(0xcfd6ff, 5, 12, 1.9);
  haloLight.position.set(0, 4.55, 0);
  root.add(haloLight);

  const pendants = [];
  function pendant(x, z, len, ry, tint = 0xffe6cf) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.045, 0.1),
      mat.std({ color: 0x0c0c10, emissive: tint, emissiveIntensity: 1.7, roughness: 0.5 }));
    g.add(bar);
    [-len / 2 + 0.12, len / 2 - 0.12].forEach((dx) => {
      const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ROOM.h - 4.5, 4), IRON_SOFT);
      drop.position.set(dx, (ROOM.h - 4.5) / 2, 0);
      g.add(drop);
    });
    const l = new THREE.PointLight(tint, 3.4, 9, 1.9);
    g.add(l);
    g.position.set(x, 4.5, z);
    g.rotation.y = ry;
    root.add(g);
    pendants.push({ bar, l });
    return g;
  }
  pendant(-9.6, 3.4, 2.4, 0.62);         // over the music lounge
  pendant(9.0, 6.6, 2.0, -0.5);          // over the front desk

  const stripMat = mat.std({
    color: 0x0b0b0e, emissive: 0xcfd6ff, emissiveIntensity: 1.05, roughness: 0.6
  });
  for (const sz of [-6.4, -2.2, 2.2, 6.4]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(24, 0.035, 0.09), stripMat);
    strip.position.set(0, ROOM.h - 0.05, sz);
    root.add(strip);
  }

  const grooveMat = mat.std({
    color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 0.85, roughness: 0.6
  });
  for (const gx of [-6.4, 6.4]) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 17.5), grooveMat);
    groove.position.set(gx, 0.03, 0.4);
    root.add(groove);
  }

  /* ======================================================================== *
   *  THE DAIS — rotating platform + car                                      *
   * ======================================================================== */

  const dais = new THREE.Group();
  root.add(dais);

  const plat = new THREE.Group();
  plat.name = 'plat';
  dais.add(plat);
  {
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(3.35, 3.42, 0.17, 72, 1, true),
      mat.std({ color: 0x14141c, roughness: 0.35, metalness: 0.9 })
    );
    side.position.y = 0.085;
    plat.add(side);
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(3.35, 72),
      mat.phys({ color: 0x0a0a10, roughness: 0.12, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 })
    );
    top.rotation.x = -Math.PI / 2; top.position.y = 0.171;
    top.receiveShadow = true;
    plat.add(top);
  }
  const daisRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.42, 0.028, 10, 90),
    mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 3.2, roughness: 0.4 })
  );
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.y = 0.155;
  dais.add(daisRing);
  const floorRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.25, 0.02, 8, 96),
    mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 1.6, roughness: 0.5 })
  );
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = 0.024;
  dais.add(floorRing);

  /* ------------------------------- the car -------------------------------- */

  const carRig = new THREE.Group();       // rotates with the platform
  carRig.name = 'carRig';
  carRig.rotation.y = -0.55;
  plat.add(carRig);

  let carReady = false, carAppear = 0, carModel = null;
  const showGroup = new THREE.Group();     // underglow + beams, toggled
  showGroup.name = 'showkit';
  showGroup.visible = false;
  carRig.add(showGroup);
  let glowPlane = null, glowLights = [], beamCones = [], beamSpots = [];

  function buildShowKit(bb) {
    /* underglow */
    const w = (bb.max.x - bb.min.x), l = (bb.max.z - bb.min.z);
    glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.7, l * 1.35),
      mat.flat({
        map: underglowTexture(), color: 0x8a5cff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.renderOrder = 3;
    glowPlane.position.y = 0.177;          // just above the dais top (0.171)
    showGroup.add(glowPlane);
    [[bb.min.x * 0.7, bb.min.z * 0.6], [bb.max.x * 0.7, bb.min.z * 0.6],
     [bb.min.x * 0.7, bb.max.z * 0.6], [bb.max.x * 0.7, bb.max.z * 0.6]
    ].forEach(([gx, gz]) => {
      const L = new THREE.PointLight(0x8a5cff, 6, 3.4, 2.2);
      L.position.set(gx, 0.3, gz);
      showGroup.add(L); glowLights.push(L);
    });
    /* headlight beams from the nose */
    const frontZ = bb.max.z;
    const beamGeo = new THREE.ConeGeometry(0.55, 5.2, 24, 1, true);
    const beamMat = mat.flat({
      color: 0xcfe0ff, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    [-0.58, 0.58].forEach((bx) => {
      const cone = new THREE.Mesh(beamGeo, beamMat);
      cone.renderOrder = 3;
      cone.position.set(bx, 0.8, frontZ + 2.55);
      cone.rotation.x = -Math.PI / 2 + 0.06;
      showGroup.add(cone); beamCones.push(cone);
      const sp = new THREE.SpotLight(0xcfe0ff, 30, 9, 0.4, 0.5, 1.6);
      sp.position.set(bx, 0.84, frontZ - 0.1);
      sp.target.position.set(bx * 1.4, 0.25, frontZ + 7);
      showGroup.add(sp, sp.target); beamSpots.push(sp);
    });
  }

  function fallbackCar() {
    /* if the model can't load, park a clean stylised coupe so the dais
       still reads as a showroom, not an empty plinth                       */
    const g = new THREE.Group();
    const paint = mat.phys({
      color: 0x101018, roughness: 0.16, metalness: 0.5,
      clearcoat: 1, clearcoatRoughness: 0.08
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.5, 4.3, 4, 0.1), paint);
    body.position.y = 0.52;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.4, 2.0, 4, 0.12),
      mat.phys({ color: 0x05060a, roughness: 0.06, metalness: 0.2, clearcoat: 1 }));
    cabin.position.set(0, 0.94, -0.28);
    cabin.castShadow = true;
    g.add(cabin);
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.5), IRON);
    splitter.position.set(0, 0.3, 2.12);
    g.add(splitter);
    /* rear wing */
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.34), paint);
    wing.position.set(0, 1.02, -2.02);
    g.add(wing);
    [[-0.7], [0.7]].forEach(([wx]) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.16), IRON);
      strut.position.set(wx, 0.88, -2.0);
      g.add(strut);
    });
    /* tail-light bar */
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.03),
      mat.std({ color: 0x1a0104, emissive: 0xff1830, emissiveIntensity: 2.4, roughness: 0.3 }));
    tail.position.set(0, 0.62, -2.16);
    g.add(tail);
    /* wheels */
    const tyreG = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 24);
    const lipG = new THREE.TorusGeometry(0.21, 0.028, 8, 24);
    [[-0.84, 1.38], [0.84, 1.38], [-0.84, -1.42], [0.84, -1.42]].forEach(([wx, wz]) => {
      const t = new THREE.Mesh(tyreG, mat.std({ color: 0x0a0a0c, roughness: 0.9 }));
      t.rotation.z = Math.PI / 2;
      t.position.set(wx, 0.33, wz);
      t.castShadow = true;
      g.add(t);
      const lip = new THREE.Mesh(lipG, CHROME);
      lip.rotation.y = Math.PI / 2;
      lip.position.set(wx * 1.02, 0.33, wz);
      g.add(lip);
    });
    g.position.y = 0.171;
    carRig.add(g);
    carModel = g;
    buildShowKit(new THREE.Box3(
      new THREE.Vector3(-0.95, 0, -2.2), new THREE.Vector3(0.95, 1.2, 2.2)
    ));
    carReady = true; carAppear = 1;
    buildMirrorDais();
  }

  console.info('BEEKUM GARAGE · build 7 — sky lounge');
  const gl = new GLTFLoader();

  function setupCar(car) {
    /* --- material surgery -------------------------------------------------
       Sketchfab exports flag half these materials as alpha-BLEND (chassis,
       engine, interior, decals). three.js sorts transparency per-mesh, so
       left as-is the car renders scrambled: panels vanish, the cabin shows
       through the body. Rules:
         · factor-alpha 0 layers        → hidden (they're export leftovers)
         · real glass                   → clean transparent, no transmission
                                          (transmission = a whole extra
                                          scene render per frame)
         · everything else              → forced opaque; textures with real
                                          cut-outs keep them via alphaTest
         · every material               → DoubleSide, so thin panels don't
                                          get backface-culled into holes    */
    const seen = new Set();
    car.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (!m) return;
      const nm = m.name || '';
      if (m.opacity === 0) { o.visible = false; return; }   // export leftovers
      const isGlass = /Window|LightGlass/.test(nm) && !/Surround/.test(nm);
      if (isGlass) o.renderOrder = 6;
      if (seen.has(m)) return;
      seen.add(m);
      m.envMapIntensity = 1.45;
      if ('transmission' in m && m.transmission > 0) m.transmission = 0;
      if (/GlassOpaque_Mirror/.test(nm)) {
        /* wing mirrors — just chrome */
        m.transparent = false; m.depthWrite = true;
        m.metalness = 1; m.roughness = 0.06;
      } else if (isGlass) {
        /* real glass: windows and light lenses */
        m.transparent = true;
        m.opacity = Math.max(0.24, Math.min(m.opacity || 0.3, 0.55));
        m.depthWrite = false;
        m.roughness = 0.03; m.metalness = 0;
        m.envMapIntensity = 2.1;
      } else if (m.transparent) {
        /* flagged BLEND, but the textures are true cut-outs (rim vents,
           badges, engine grilles — measured 10–50% fully-clear pixels), so
           alpha-MASK is what the artist meant. This is what un-scrambles
           the render.                                                      */
        m.transparent = false;
        m.depthWrite = true;
        m.opacity = 1;
        m.alphaTest = 0.5;
      }
      if (/CarPaint/.test(nm) && 'clearcoat' in m && m.roughness < 0.5) {
        m.clearcoat = 1; m.clearcoatRoughness = 0.07;
        m.envMapIntensity = 1.7;
      }
      if (PAINT_OVERRIDE != null && nm.includes('CarPaint')) {
        m.color = new THREE.Color(PAINT_OVERRIDE);
        if ('clearcoat' in m) { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
      }
      m.needsUpdate = true;
    });
    box3.setFromObject(car);
    const c = box3.getCenter(v3.clone());
    car.position.set(-c.x, 0.171 - box3.min.y, -c.z);
    carRig.add(car);
    carModel = car;
    const bb = new THREE.Box3(
      new THREE.Vector3(box3.min.x - c.x, 0, box3.min.z - c.z),
      new THREE.Vector3(box3.max.x - c.x, box3.max.y - box3.min.y, box3.max.z - c.z)
    );
    buildShowKit(bb);
    const cb = aoBlob((bb.max.x - bb.min.x) * 1.5, (bb.max.z - bb.min.z) * 1.15, 0.6);
    cb.position.y = 0.176;
    carRig.add(cb);
    carRig.scale.setScalar(0.001);
    carReady = true;
    buildMirrorDais();
  }

  async function loadCar() {
    for (const url of CAR_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 100000) {
          console.warn('BEEKUM GARAGE — "' + url + '" is only ' + buf.byteLength +
            ' bytes. That is a placeholder, not the model — skipping it.');
          continue;
        }
        const g = await new Promise((ok, bad) => gl.parse(buf, '', ok, bad));
        console.info('BEEKUM GARAGE · S13 loaded from ' + url + ' (' +
          (buf.byteLength / 1048576).toFixed(1) + ' MB)');
        setupCar(g.scene || (g.scenes && g.scenes[0]));
        return;
      } catch (e) {
        console.warn('BEEKUM GARAGE — could not use "' + url + '":', e);
      }
    }
    console.warn('BEEKUM GARAGE — no car model found. Upload the Sketchfab GLB to ' +
      'assets/models/ under either name: rb_s13.glb or the original long filename. ' +
      'Using the stand-in coupe meanwhile.');
    fallbackCar();
  }
  loadCar();

  /* ======================================================================== *
   *  MUSIC LOUNGE — grand piano + two guitars, all playable                  *
   * ======================================================================== */

  const lounge = new THREE.Group();
  lounge.position.set(-9.9, 0, 3.2);
  lounge.rotation.y = 0.62;
  root.add(lounge);

  /* rug */
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 48),
    mat.std({ color: 0x120d16, roughness: 0.96 })
  );
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.02;
  rug.receiveShadow = true;
  lounge.add(rug);
  const rugTrim = new THREE.Mesh(
    new THREE.TorusGeometry(3.05, 0.012, 6, 64),
    mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 0.9 })
  );
  rugTrim.rotation.x = Math.PI / 2; rugTrim.position.y = 0.028;
  lounge.add(rugTrim);

  /* ------------------------------ the piano ------------------------------- */

  const piano = new THREE.Group();
  piano.scale.setScalar(PIANO_SCALE);
  lounge.add(piano);

  const pianoKeys = [];                 // { mesh, freq, isBlack, press, glow }
  const PIANO_BLACK = mat.phys({
    color: 0x08080b, roughness: 0.1, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06
  });

  {
    /* body — grand outline, keyboard edge at z=0, tail into -z              */
    const s = new THREE.Shape();
    s.moveTo(-0.78, 0);
    s.lineTo(-0.78, -1.28);                              // straight bass side
    s.quadraticCurveTo(-0.78, -1.86, -0.16, -1.9);       // round tail
    s.quadraticCurveTo(0.42, -1.9, 0.52, -1.34);         // curve towards treble
    s.quadraticCurveTo(0.6, -0.9, 0.78, -0.66);          // the waist
    s.lineTo(0.78, 0);
    s.lineTo(-0.78, 0);
    const rimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    const rim = new THREE.Mesh(rimGeo, PIANO_BLACK);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.68;               // extrudes up → rim top at 0.98
    rim.castShadow = true;
    piano.add(rim);

    /* soundboard hint — brass with string lines, just under the rim top     */
    const [bc, bx] = cnv(256, 256);
    const grad = bx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#6b4c1c'); grad.addColorStop(1, '#a8842e');
    bx.fillStyle = grad; bx.fillRect(0, 0, 256, 256);
    bx.strokeStyle = 'rgba(255,236,180,0.55)'; bx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      bx.beginPath(); bx.moveTo(10 + i * 6, 250); bx.lineTo(60 + i * 4.4, 8); bx.stroke();
    }
    const sb = new THREE.Mesh(
      new THREE.ShapeGeometry(s),
      mat.std({ map: ctex(bc), roughness: 0.4, metalness: 0.7 })
    );
    sb.rotation.x = -Math.PI / 2;
    sb.position.y = 0.9;
    piano.add(sb);

    /* open lid — same shape, hinged along the bass side                     */
    const lidGeo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(lidGeo, PIANO_BLACK);
    lidMesh.rotation.x = -Math.PI / 2;
    lidMesh.position.x = 0.78;           // shift so hinge line sits at group x=0
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    lid.position.set(-0.78, 0.985, 0);
    lid.rotation.z = 0.88;               // propped open
    piano.add(lid);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.88, 6), PIANO_BLACK);
    stick.position.set(0.32, 1.32, -0.9);
    stick.rotation.z = -0.5;
    piano.add(stick);

    /* keybed shelf + fallboard                                              */
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.055, 0.3), PIANO_BLACK);
    shelf.position.set(0, 0.735, 0.148);
    piano.add(shelf);
    const cheekGeo = new THREE.BoxGeometry(0.07, 0.115, 0.3);
    [-0.745, 0.745].forEach((cx) => {
      const cheek = new THREE.Mesh(cheekGeo, PIANO_BLACK);
      cheek.position.set(cx, 0.82, 0.148);
      piano.add(cheek);
    });
    const fall = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.11, 0.03), PIANO_BLACK);
    fall.position.set(0, 0.885, 0.012);
    piano.add(fall);
    const brand = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.045),
      mat.flat({
        map: labelTexture(['B E E K U M'], 512, 48, 'italic 600 30px Georgia, serif', '#d8b25f'),
        transparent: true
      })
    );
    brand.position.set(0, 0.885, 0.03);
    piano.add(brand);

    /* legs + casters + pedals + bench                                       */
    const legGeo = new THREE.BoxGeometry(0.09, 0.72, 0.09);
    [[-0.68, 0.05], [0.68, 0.05], [-0.2, -1.62]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, PIANO_BLACK);
      leg.position.set(lx, 0.36, lz);
      leg.castShadow = true;
      piano.add(leg);
      const cast = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), GOLD);
      cast.position.set(lx, 0.045, lz);
      piano.add(cast);
    });
    const lyre = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.05), PIANO_BLACK);
    lyre.position.set(0, 0.24, -0.32);
    piano.add(lyre);
    for (let i = 0; i < 3; i++) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.09), GOLD);
      ped.position.set(-0.05 + i * 0.05, 0.09, -0.27);
      piano.add(ped);
    }
    const bench = new THREE.Group();
    const bTop = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.09, 0.34, 3, 0.02),
      mat.std({ color: 0x140f16, roughness: 0.7 }));
    bTop.position.y = 0.5; bTop.castShadow = true;
    bench.add(bTop);
    const bLeg = new THREE.BoxGeometry(0.06, 0.46, 0.06);
    [[-0.38, -0.12], [0.38, -0.12], [-0.38, 0.12], [0.38, 0.12]].forEach(([lx, lz]) => {
      const l = new THREE.Mesh(bLeg, PIANO_BLACK);
      l.position.set(lx, 0.23, lz);
      bench.add(l);
    });
    bench.position.set(0, 0, 0.62);
    piano.add(bench);

    /* --------------------------- the keys ------------------------------- */

    const N_OCT = 3, LOW_C = 261.63;                 // C4 … B6
    const WHITE_W = 0.0225, GAP = 0.0016;
    const whiteGeo = new THREE.BoxGeometry(WHITE_W, 0.018, 0.147);
    whiteGeo.translate(0, 0, 0.147 / 2);             // pivot at the back edge
    const blackGeo = new THREE.BoxGeometry(0.0132, 0.026, 0.094);
    blackGeo.translate(0, 0, 0.094 / 2);
    const whiteSemis = [0, 2, 4, 5, 7, 9, 11];
    const blackSemis = { 1: 0.5, 3: 1.5, 6: 3.5, 8: 4.5, 10: 5.5 };  // after which white
    const totalW = N_OCT * 7 * (WHITE_W + GAP) - GAP;
    const startX = -totalW / 2 + WHITE_W / 2;
    const keysY = 0.762, keysZ = 0.145;   // back-edge hinge line

    for (let o = 0; o < N_OCT; o++) {
      for (let w = 0; w < 7; w++) {
        const i = o * 7 + w;
        const m = new THREE.Mesh(whiteGeo, mat.std({
          color: 0xf2ead9, roughness: 0.34, metalness: 0.02,
          emissive: 0x000000, emissiveIntensity: 1
        }));
        m.position.set(startX + i * (WHITE_W + GAP), keysY, keysZ);
        piano.add(m);
        pianoKeys.push({
          mesh: m, isBlack: false, press: 0, glow: 0,
          freq: LOW_C * Math.pow(2, o + whiteSemis[w] / 12)
        });
      }
      for (const semi of Object.keys(blackSemis)) {
        const m = new THREE.Mesh(blackGeo, mat.std({
          color: 0x101014, roughness: 0.25, metalness: 0.3,
          emissive: 0x000000, emissiveIntensity: 1
        }));
        const off = blackSemis[semi];
        m.position.set(startX + (o * 7 + off) * (WHITE_W + GAP) + (WHITE_W + GAP) / 2,
          keysY + 0.013, keysZ);
        piano.add(m);
        pianoKeys.push({
          mesh: m, isBlack: true, press: 0, glow: 0,
          freq: LOW_C * Math.pow(2, o + (+semi) / 12)
        });
      }
    }
    pianoKeys.sort((a, b) => a.freq - b.freq);
    piano.position.set(0.15, 0, -0.5);
    piano.rotation.y = -0.25;
  }

  /* ------------------------------ guitars --------------------------------- */

  function guitarStand() {
    const g = new THREE.Group();
    const tube = (len) => new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 8), IRON_SOFT);
    const l1 = tube(0.78); l1.position.set(-0.13, 0.36, 0.1); l1.rotation.z = 0.34; l1.rotation.x = -0.18;
    const l2 = tube(0.78); l2.position.set(0.13, 0.36, 0.1); l2.rotation.z = -0.34; l2.rotation.x = -0.18;
    const l3 = tube(0.7); l3.position.set(0, 0.33, -0.16); l3.rotation.x = 0.42;
    g.add(l1, l2, l3);
    [[-0.11, 0.16], [0.11, 0.16]].forEach(([ax]) => {
      const arm = tube(0.16);
      arm.position.set(ax, 0.16, 0.2); arm.rotation.z = Math.PI / 2;
      g.add(arm);
    });
    return g;
  }

  function stringSet(g, x0, y0, z0, y1, z1, spread) {
    for (let i = 0; i < 6; i++) {
      const sx = x0 + (i - 2.5) * spread;
      const a = new THREE.Vector3(sx, y0, z0), b = new THREE.Vector3(sx * 0.55, y1, z1);
      const len = a.distanceTo(b);
      const str = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0009 + (5 - i) * 0.00035, 0.0009 + (5 - i) * 0.00035, len, 4),
        mat.std({ color: 0xd8dce4, roughness: 0.3, metalness: 1 })
      );
      str.position.copy(a).lerp(b, 0.5);
      str.lookAt(b); str.rotateX(Math.PI / 2);
      g.add(str);
    }
  }

  function electricGuitar() {
    const g = new THREE.Group();
    /* offset body */
    const s = new THREE.Shape();
    s.moveTo(0, -0.24);
    s.bezierCurveTo(0.17, -0.24, 0.2, -0.1, 0.16, 0.0);
    s.bezierCurveTo(0.13, 0.07, 0.15, 0.1, 0.12, 0.15);   // lower horn side
    s.bezierCurveTo(0.1, 0.2, 0.02, 0.18, 0.0, 0.14);
    s.bezierCurveTo(-0.02, 0.2, -0.12, 0.23, -0.15, 0.15); // upper horn
    s.bezierCurveTo(-0.18, 0.08, -0.14, 0.05, -0.16, -0.02);
    s.bezierCurveTo(-0.2, -0.13, -0.14, -0.24, 0, -0.24);
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }),
      mat.phys({ color: 0x0c0810, roughness: 0.12, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 })
    );
    body.castShadow = true;
    g.add(body);
    /* neck + headstock */
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.02),
      mat.std({ color: 0x171019, roughness: 0.5 }));
    neck.position.set(0, 0.42, 0.03);
    g.add(neck);
    const fretMat = mat.std({ color: 0x241a26, roughness: 0.6 });
    for (let i = 0; i < 12; i++) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.003, 0.004), CHROME);
      fr.position.set(0, 0.2 + i * (0.42 - i * 0.008) / 12, 0.041);
      g.add(fr);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.016), BLACK_GLOSS);
    head.position.set(-0.012, 0.79, 0.028);
    head.rotation.z = 0.1;
    g.add(head);
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), CHROME);
      t.rotation.z = Math.PI / 2;
      t.position.set(-0.045, 0.735 + i * 0.02, 0.028);
      g.add(t);
    }
    /* pickups, bridge, knobs */
    [[-0.02], [-0.13]].forEach(([py]) => {
      const pu = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.035, 0.018, 2, 0.006),
        mat.std({ color: 0x101014, roughness: 0.3, metalness: 0.7 }));
      pu.position.set(0, py, 0.056);
      g.add(pu);
    });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.02, 0.014), CHROME);
    br.position.set(0, -0.185, 0.056);
    g.add(br);
    [[0.09, -0.13], [0.11, -0.19]].forEach(([kx, ky]) => {
      const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 12), CHROME);
      kn.rotation.x = Math.PI / 2; kn.position.set(kx, ky, 0.056);
      g.add(kn);
    });
    stringSet(g, 0, -0.18, 0.062, 0.77, 0.038, 0.0075);
    return g;
  }

  function acousticGuitar() {
    const g = new THREE.Group();
    const s = new THREE.Shape();          // dreadnought-ish two-lobe outline
    s.moveTo(0, -0.26);
    s.bezierCurveTo(0.2, -0.26, 0.22, -0.09, 0.16, -0.02);
    s.bezierCurveTo(0.13, 0.02, 0.13, 0.05, 0.15, 0.09);
    s.bezierCurveTo(0.19, 0.17, 0.12, 0.25, 0, 0.25);
    s.bezierCurveTo(-0.12, 0.25, -0.19, 0.17, -0.15, 0.09);
    s.bezierCurveTo(-0.13, 0.05, -0.13, 0.02, -0.16, -0.02);
    s.bezierCurveTo(-0.22, -0.09, -0.2, -0.26, 0, -0.26);
    /* satin black top with an oxblood burst — painted in code               */
    const [tc, tx] = cnv(256, 256);
    const rg = tx.createRadialGradient(128, 128, 20, 128, 128, 150);
    rg.addColorStop(0, '#181014'); rg.addColorStop(0.72, '#20080c');
    rg.addColorStop(1, '#3a0a12');
    tx.fillStyle = rg; tx.fillRect(0, 0, 256, 256);
    const topMat = mat.phys({
      map: ctex(tc), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25
    });
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.105, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }),
      [topMat, mat.std({ color: 0x160c10, roughness: 0.5 })]
    );
    body.castShadow = true;
    g.add(body);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24),
      mat.flat({ color: 0x030304 }));
    hole.position.set(0, 0.035, 0.118);
    g.add(hole);
    const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 32), GOLD);
    rosette.position.copy(hole.position);
    g.add(rosette);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.01),
      mat.std({ color: 0x0d0a0c, roughness: 0.6 }));
    bridge.position.set(0, -0.12, 0.118);
    g.add(bridge);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.024),
      mat.std({ color: 0x1a1216, roughness: 0.55 }));
    neck.position.set(0, 0.5, 0.075);
    g.add(neck);
    for (let i = 0; i < 12; i++) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.004), CHROME);
      fr.position.set(0, 0.3 + i * 0.038, 0.088);
      g.add(fr);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), BLACK_GLOSS);
    head.position.set(0, 0.84, 0.068);
    g.add(head);
    for (let i = 0; i < 3; i++) {
      [-0.048, 0.048].forEach((hx) => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 6), GOLD);
        t.rotation.z = Math.PI / 2;
        t.position.set(hx, 0.795 + i * 0.032, 0.068);
        g.add(t);
      });
    }
    stringSet(g, 0, -0.11, 0.124, 0.82, 0.082, 0.008);
    return g;
  }

  const eStand = guitarStand();
  eStand.position.set(-1.62, 0, 0.72);
  eStand.rotation.y = 0.5;
  lounge.add(eStand);
  const eGuitar = electricGuitar();
  eGuitar.position.set(-1.62, 0.42, 0.78);
  eGuitar.rotation.set(-0.16, 0.5, 0.04);
  lounge.add(eGuitar);

  const aStand = guitarStand();
  aStand.position.set(1.7, 0, 0.9);
  aStand.rotation.y = -0.42;
  lounge.add(aStand);
  const aGuitar = acousticGuitar();
  aGuitar.position.set(1.7, 0.44, 0.96);
  aGuitar.rotation.set(-0.16, -0.42, -0.04);
  lounge.add(aGuitar);

  /* small amp beside the electric — a wink                                   */
  {
    const amp = new THREE.Group();
    const cab = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.4, 0.24, 3, 0.02),
      mat.std({ color: 0x100d12, roughness: 0.85 }));
    cab.position.y = 0.2; cab.castShadow = true;
    amp.add(cab);
    const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26),
      mat.std({ color: 0x1c161c, roughness: 1 }));
    grill.position.set(0, 0.17, 0.121);
    amp.add(grill);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6),
      mat.std({ color: 0x1a0505, emissive: 0xff3040, emissiveIntensity: 6 }));
    lamp.position.set(0.14, 0.365, 0.121);
    amp.add(lamp);
    amp.position.set(-2.25, 0, 0.3);
    amp.rotation.y = 0.7;
    lounge.add(amp);
  }

  /* ======================================================================== *
   *  DRONE PLINTH (projects) · PARTS WALL (skills) · VITRINE (awards)        *
   *  FRONT DESK (contact)                                                    *
   * ======================================================================== */

  const spin = [];                        // things that rotate every frame

  /* drone plinth */
  {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.56, 1.06, 0.56, 3, 0.02), BLACK_GLOSS);
    plinth.position.y = 0.53; plinth.castShadow = true;
    g.add(plinth);
    const plTrim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.02, 0.58),
      mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 2 }));
    plTrim.position.y = 1.06;
    g.add(plTrim);
    /* the capstone cameo — tiny quad, hovering                              */
    const drone = new THREE.Group();
    const bodyD = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.16, 2, 0.012),
      mat.std({ color: 0x14141a, roughness: 0.4, metalness: 0.6 }));
    drone.add(bodyD);
    const armG = new THREE.BoxGeometry(0.2, 0.014, 0.02);
    [Math.PI / 4, -Math.PI / 4].forEach((a) => {
      const arm = new THREE.Mesh(armG, IRON_SOFT);
      arm.rotation.y = a;
      drone.add(arm);
    });
    [[0.09, 0.09], [-0.09, 0.09], [0.09, -0.09], [-0.09, -0.09]].forEach(([px, pz]) => {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), IRON);
      hub.position.set(px, 0.02, pz);
      drone.add(hub);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.002, 0.012),
        mat.std({ color: 0x202028, roughness: 0.5, transparent: true, opacity: 0.85 }));
      rotor.position.set(px, 0.032, pz);
      drone.add(rotor);
      spin.push({ mesh: rotor, speed: 34 + Math.random() * 8 });
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6),
      mat.std({ color: 0x021014, emissive: 0x57d7e6, emissiveIntensity: 7 }));
    led.position.set(0, -0.018, 0.07);
    drone.add(led);
    drone.position.y = 1.42;
    drone.userData.baseY = 1.42;
    g.add(drone);
    g.userData.drone = drone;
    const droneGlow = new THREE.PointLight(0x57d7e6, 3, 2.4, 2);
    droneGlow.position.y = 1.4;
    g.add(droneGlow);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1),
      mat.flat({ map: labelTexture(['GESTURE-CONTROLLED UAV', 'COS301 · CODEX MERCHANTS'], 512, 96, '600 26px "Share Tech Mono", monospace', '#9fb2d8'), transparent: true }));
    plaque.position.set(0, 0.62, 0.29);
    g.add(plaque);
    g.position.set(7.8, 0, -3.7);
    g.rotation.y = -0.5;
    root.add(g);
    root.userData.droneGroup = g;
  }

  /* parts wall — floating shelves on the left wall                          */
  const partsWall = new THREE.Group();
  partsWall.position.set(-ROOM.w / 2 + 0.02, 0, -3.9);
  partsWall.rotation.y = Math.PI / 2;
  root.add(partsWall);
  {
    const shelfG = new THREE.BoxGeometry(3.6, 0.05, 0.42);
    [1.05, 1.75].forEach((sy) => {
      const sh = new THREE.Mesh(shelfG, BLACK_GLOSS);
      sh.position.set(0, sy, 0.21);
      sh.castShadow = true;
      partsWall.add(sh);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.015, 0.015),
        mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 1.4 }));
      lip.position.set(0, sy - 0.03, 0.42);
      partsWall.add(lip);
    });
    /* coilover — red spring, our one loud colour                            */
    const coil = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 10), CHROME);
    shaft.position.y = 0.22; coil.add(shaft);
    const helixPts = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      helixPts.push(new THREE.Vector3(Math.cos(t * TAU * 6) * 0.055, 0.05 + t * 0.3, Math.sin(t * TAU * 6) * 0.055));
    }
    const spring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 120, 0.009, 6),
      mat.std({ color: 0xe0344a, roughness: 0.35, metalness: 0.4 })
    );
    coil.add(spring);
    coil.position.set(-1.35, 1.075, 0.2);
    partsWall.add(coil);
    /* turbo snail */
    const turbo = new THREE.Group();
    const snail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.045, 12, 24), CHROME);
    snail.rotation.y = Math.PI / 2;
    turbo.add(snail);
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 14), IRON);
    inlet.rotation.z = Math.PI / 2; inlet.position.x = 0.12;
    turbo.add(inlet);
    turbo.position.set(-0.4, 1.16, 0.2);
    turbo.rotation.z = 0.1;
    partsWall.add(turbo);
    /* steering wheel */
    const sw = new THREE.Group();
    const swRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 10, 28),
      mat.std({ color: 0x181218, roughness: 0.6 }));
    sw.add(swRim);
    for (let i = 0; i < 3; i++) {
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.008), IRON_SOFT);
      spk.rotation.z = i * TAU / 3 + Math.PI / 6;
      spk.position.set(Math.cos(i * TAU / 3 + Math.PI / 6) * 0.065, Math.sin(i * TAU / 3 + Math.PI / 6) * 0.065, 0);
      sw.add(spk);
    }
    sw.position.set(0.55, 1.28, 0.16);
    partsWall.add(sw);
    /* oil cans on top shelf */
    for (let i = 0; i < 3; i++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 14),
        i === 1 ? mat.std({ color: 0xe0344a, roughness: 0.4 }) : mat.std({ color: 0x14141c, roughness: 0.4, metalness: 0.5 }));
      can.position.set(0.95 + i * 0.18, 1.865, 0.2);
      partsWall.add(can);
    }
    /* a spare wheel slot — filled with a cloned GLB wheel once it loads     */
    partsWall.userData.wheelSlot = new THREE.Vector3(1.15, 1.15, 0.22);
  }

  /* trophy vitrine on the left wall                                         */
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.9, 0.6, 3, 0.02), BLACK_GLOSS);
    base.position.y = 0.45; base.castShadow = true;
    g.add(base);
    const caseGlass = mat.phys({
      color: 0xaab8d8, transparent: true, opacity: 0.1, roughness: 0.05,
      clearcoat: 1, side: THREE.DoubleSide, depthWrite: false
    });
    const gcase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 0.52), caseGlass);
    gcase.renderOrder = 4;
    gcase.position.y = 1.34;
    g.add(gcase);
    const caseFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.04, 0.56), IRON);
    caseFrame.position.y = 1.78;
    g.add(caseFrame);
    /* LED-framed niche behind */
    const nicheFrameMat = mat.std({
      color: 0x0b0b0e, emissive: 0xcfd6ff, emissiveIntensity: 1.3, roughness: 0.5
    });
    const nicheW = 1.9, nicheH = 2.5;
    [[0, nicheH, nicheW, 0.04], [0, 0.06, nicheW, 0.04]].forEach(([nx, ny, w, h]) => {
      const barMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), nicheFrameMat);
      barMesh.position.set(nx, ny, -0.34);
      g.add(barMesh);
    });
    [-nicheW / 2, nicheW / 2].forEach((nx) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, nicheH, 0.04), nicheFrameMat);
      post.position.set(nx, nicheH / 2 + 0.04, -0.34);
      g.add(post);
    });
    /* three cups */
    function trophy(h) {
      const t = new THREE.Group();
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 16), IRON);
      t.add(foot);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, h * 0.36, 10), GOLD);
      stem.position.y = 0.05 + h * 0.18;
      t.add(stem);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.045, h * 0.5, 18), GOLD);
      cup.position.y = 0.05 + h * 0.36 + h * 0.25;
      t.add(cup);
      [-1, 1].forEach((sgn) => {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 18, Math.PI), GOLD);
        handle.position.set(sgn * 0.095, cup.position.y + 0.02, 0);
        handle.rotation.z = sgn * Math.PI / 2 - Math.PI / 2 * (sgn > 0 ? 0 : 0);
        handle.rotation.z = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
        t.add(handle);
      });
      return t;
    }
    const t1 = trophy(0.42); t1.position.set(0, 0.92, 0); g.add(t1);
    const t2 = trophy(0.3); t2.position.set(-0.58, 0.92, 0.02); t2.scale.setScalar(0.85); g.add(t2);
    const t3 = trophy(0.3); t3.position.set(0.58, 0.92, 0.02); t3.scale.setScalar(0.85); g.add(t3);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.16),
      mat.flat({ map: labelTexture(['UA VALIDATOR — HACKATHON WIN', 'CHPC SCC · DEAN’S LIST'], 512, 96, '600 24px "Share Tech Mono", monospace', '#cdb27a'), transparent: true }));
    plq.position.set(0, 0.5, 0.305);
    g.add(plq);
    g.position.set(-ROOM.w / 2 + 0.34, 0, 7.7);
    g.rotation.y = Math.PI / 2;
    root.add(g);
  }

  /* front desk near the entrance — contact                                  */
  {
    const g = new THREE.Group();
    const counterGeo = new THREE.CylinderGeometry(1.5, 1.5, 1.02, 40, 1, true, 0, Math.PI * 0.9);
    const counter = new THREE.Mesh(counterGeo, BLACK_GLOSS);
    counter.position.y = 0.51;
    counter.castShadow = true;
    g.add(counter);
    const counterTop = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.56, 40, 1, 0, Math.PI * 0.9),
      mat.phys({ color: 0x0c0c12, roughness: 0.15, metalness: 0.4, clearcoat: 1 }));
    counterTop.rotation.x = -Math.PI / 2;
    counterTop.position.y = 1.03;
    g.add(counterTop);
    const underLED = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.014, 6, 48, Math.PI * 0.9),
      mat.std({ color: 0x0a0a0c, emissive: 0x8a5cff, emissiveIntensity: 2 }));
    underLED.rotation.x = Math.PI / 2;
    underLED.position.y = 0.09;
    g.add(underLED);
    /* laptop */
    const lap = new THREE.Group();
    const lb = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.012, 0.2, 2, 0.004), IRON_SOFT);
    lap.add(lb);
    const ls = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.19, 0.008, 2, 0.004), IRON_SOFT);
    ls.position.set(0, 0.095, -0.1);
    ls.rotation.x = -0.32;
    lap.add(ls);
    const lscr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.16),
      mat.std({ map: screenTexture('code'), emissive: 0xffffff, emissiveMap: screenTexture('code'), emissiveIntensity: 0.9, roughness: 1 }));
    lscr.position.set(0, 0.098, -0.0955);
    lscr.rotation.x = -0.32;
    lap.add(lscr);
    lap.position.set(-0.3, 1.045, 0.9);
    lap.rotation.y = 2.6;
    g.add(lap);
    g.position.set(8.6, 0, 7.6);
    g.rotation.y = Math.PI * 1.18;
    root.add(g);
  }

  /* EXIT sign over a door on the right wall + extinguisher — fire code       */
  {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.5),
      mat.std({ color: 0x08080c, roughness: 0.8 }));
    door.position.set(ROOM.w / 2 - 0.02, 1.25, -6);
    door.rotation.y = -Math.PI / 2;
    root.add(door);
    const exitS = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22),
      mat.flat({
        map: labelTexture(['E X I T'], 256, 96, '800 52px Overpass, sans-serif', '#7dffab'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
    exitS.position.set(ROOM.w / 2 - 0.06, 2.75, -6);
    exitS.rotation.y = -Math.PI / 2;
    root.add(exitS);
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12),
      mat.std({ color: 0xa11a24, roughness: 0.35, metalness: 0.3 }));
    ext.position.set(ROOM.w / 2 - 0.14, 0.6, -4.9);
    root.add(ext);
  }

  /* dust motes */
  const dust = (() => {
    const N = HIGH ? 340 : 150;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * ROOM.w * 0.9;
      pos[i * 3 + 1] = Math.random() * ROOM.h;
      pos[i * 3 + 2] = (Math.random() - 0.5) * ROOM.d * 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xbcb4d8, size: 0.014, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    p.renderOrder = 2;
    root.add(p);
    return p;
  })();

  /* ======================================================================== *
   *  MIRROR WORLD — the floor reflection, done the cheap honest way          *
   *  A y-flipped clone of the reflective-worthy set lives under the marble.  *
   *  Perfect planar reflection, zero extra render passes.                    *
   * ======================================================================== */

  const mirrorRoot = new THREE.Group();
  mirrorRoot.scale.y = -1;
  mirrorRoot.position.y = -0.006;
  root.add(mirrorRoot);

  /* mirrored meshes get cloned materials with a clipping plane, so nothing
     reflected can ever poke up through the floor (the sky plane is tall
     enough that its mirror image otherwise would)                          */
  renderer.localClippingEnabled = true;
  const mirrorClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.0);
  const mirrorMats = new Map();          // source material → clipped clone
  function mirrorMat(m) {
    if (Array.isArray(m)) return m.map(mirrorMat);
    let c = mirrorMats.get(m);
    if (!c) {
      c = m.clone();
      c.clippingPlanes = [mirrorClip];
      mirrorMats.set(m, c);
    }
    return c;
  }
  function syncMirrorMats() {
    mirrorMats.forEach((c, src) => {
      if (src.color && c.color) c.color.copy(src.color);
      if (src.emissive && c.emissive) c.emissive.copy(src.emissive);
      c.emissiveIntensity = src.emissiveIntensity;
      if (c.map !== src.map) { c.map = src.map; c.needsUpdate = true; }
      c.opacity = src.opacity;
    });
  }

  function intoMirror(obj) {
    const c = obj.clone(true);
    const strip = [];
    c.traverse((o) => {
      if (o.isLight || o.isCamera) strip.push(o);
      else if (o.isMesh) {
        o.castShadow = false; o.receiveShadow = false; o.renderOrder = 0;
        o.material = mirrorMat(o.material);
      }
    });
    strip.forEach((L) => { if (L.parent) L.parent.remove(L); });
    mirrorRoot.add(c);
    return c;
  }

  intoMirror(colonnade);
  let mSky = null;
  if (HIGH) {
    const mBackdrop = intoMirror(backdrop);
    mSky = mBackdrop.getObjectByName('sky');
  }

  let mPlat = null, mCarRig = null, mShow = null, mirrorDaisBuilt = false;
  function buildMirrorDais() {
    if (mirrorDaisBuilt) return;
    mirrorDaisBuilt = true;
    const md = intoMirror(dais);
    mPlat = md.getObjectByName('plat');
    mCarRig = md.getObjectByName('carRig');
    mShow = md.getObjectByName('showkit');
  }

  /* ---- contact shadows: soft dark blobs that ground every prop ----------- */

  const blobTex = underglowTexture();
  function aoBlob(w, l, opacity = 0.5) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
      mat.flat({ map: blobTex, color: 0x000000, transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.022;
    return m;
  }
  {
    const under = (parent, w, l, x, z, op = 0.5) => {
      const b = aoBlob(w, l, op);
      b.position.x = x; b.position.z = z;
      parent.add(b);
    };
    under(lounge, 3.6, 3.4, 0.15, -0.7, 0.5);       // piano + bench
    under(lounge, 0.85, 0.85, -1.62, 0.75, 0.5);    // electric stand
    under(lounge, 0.85, 0.85, 1.7, 0.93, 0.5);      // acoustic stand
    under(lounge, 0.7, 0.6, -2.25, 0.3, 0.45);      // amp
    under(root, 1.1, 1.1, 7.8, -3.7, 0.55);         // drone plinth
    under(root, 3.6, 3.4, 8.6, 7.6, 0.45);          // front desk
    under(root, 1.1, 2.4, -16.55, 7.7, 0.5);        // vitrine
    under(root, 0.4, 0.4, ROOM.w / 2 - 0.14, -4.9, 0.5); // extinguisher
  }

  /* ======================================================================== *
   *  AUDIO — every sound is synthesised on the fly                           *
   * ======================================================================== */

  let AC = null, bus = null, wet = null;
  const ksCache = new Map();

  function audio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6; comp.knee.value = 18;
    comp.connect(AC.destination);
    bus = AC.createGain(); bus.gain.value = 0.9;
    bus.connect(comp);
    /* a small generated hall — noise burst with exponential decay           */
    const verb = AC.createConvolver();
    const len = AC.sampleRate * 2.3;
    const ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * Math.exp(-3.2 * t);
      }
    }
    verb.buffer = ir;
    wet = AC.createGain(); wet.gain.value = 0.32;
    bus.connect(wet); wet.connect(verb); verb.connect(comp);
    return AC;
  }

  function pianoNote(freq, vel = 1) {
    const ac = audio();
    const t = ac.currentTime;
    const out = ac.createGain();
    out.gain.value = 0.001;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600 + 4200 * vel * Math.min(1, 500 / freq + 0.4);
    out.connect(lp); lp.connect(bus);
    const dur = Math.max(1.1, 3.4 - freq / 500);
    [[1, 0.55, 'triangle'], [2.0014, 0.16, 'sine'], [2.9987, 0.06, 'sine']].forEach(([mul, g, type]) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = ac.createGain();
      og.gain.value = g * vel;
      o.connect(og); og.connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    });
    /* hammer thump */
    const nb = ac.createBufferSource();
    const nlen = ac.sampleRate * 0.03 | 0;
    const nbuf = ac.createBuffer(1, nlen, ac.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen);
    nb.buffer = nbuf;
    const ng = ac.createGain(); ng.gain.value = 0.1 * vel;
    nb.connect(ng); ng.connect(bus);
    nb.start(t);
    /* envelope */
    out.gain.setValueAtTime(0.001, t);
    out.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function ksBuffer(freq) {
    const ac = audio();
    const key2 = Math.round(freq * 10);
    if (ksCache.has(key2)) return ksCache.get(key2);
    const sr = ac.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const len = sr * 1.6 | 0;
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N; i < len; i++) d[i] = 0.5 * 0.9955 * (d[i - N] + d[i - N + 1]);
    ksCache.set(key2, buf);
    return buf;
  }

  let shaperCurve = null;
  function guitarNote(freq, delay, electric) {
    const ac = audio();
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = ksBuffer(freq);
    const g = ac.createGain();
    if (electric) {
      if (!shaperCurve) {
        shaperCurve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          const x = (i / 511) * 2 - 1;
          shaperCurve[i] = Math.tanh(3.6 * x);
        }
      }
      const sh = ac.createWaveShaper();
      sh.curve = shaperCurve;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.8;
      g.gain.value = 0.34;
      src.connect(sh); sh.connect(lp); lp.connect(g);
    } else {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 5600;
      g.gain.value = 0.5;
      src.connect(lp); lp.connect(g);
    }
    g.connect(bus);
    src.start(t);
  }

  const CHORDS = {
    a: [[82.41, 123.47, 164.81, 196.0, 246.94, 329.63],   // Em
        [82.41, 123.47, 164.81, 207.65, 246.94, 329.63],  // E-ish lift
        [110.0, 164.81, 220.0, 261.63, 329.63, 440.0]],   // Am add
    e: [[82.41, 123.47, 164.81, 246.94, 329.63],          // E5 stack
        [98.0, 146.83, 196.0, 293.66],                    // G5
        [73.42, 110.0, 146.83, 220.0]]                    // D5 low
  };
  const chordIdx = { a: 0, e: 0 };

  function strum(which) {
    const list = CHORDS[which];
    const chord = list[chordIdx[which] % list.length];
    chordIdx[which]++;
    chord.forEach((f, i) => guitarNote(f, i * 0.022, which === 'e'));
  }

  /* ======================================================================== *
   *  THEME                                                                   *
   * ======================================================================== */

  let themeName = (opts.theme === 'day') ? 'day' : 'night';
  function setTheme(t) {
    themeName = (t === 'day') ? 'day' : 'night';
    const T = THEMES[themeName];
    scene.environment = ENV[themeName];
    rimA.color.setHex(themeName === 'night' ? 0x9fb4ff : 0xffb4a4);
    rimB.color.setHex(themeName === 'night' ? 0xc9b2ff : 0xff9d8a);
    scene.fog = new THREE.FogExp2(T.fog, T.fogD);
    scene.background = new THREE.Color(T.fog);
    hemi.color.setHex(T.hemiSky);
    hemi.groundColor.setHex(T.hemiGround);
    hemi.intensity = T.hemiI;
    key.color.setHex(T.keyLight); key.intensity = T.keyI;
    coveMat.emissive.setHex(T.cove);
    daisRing.material.emissive.setHex(T.accent);
    floorRing.material.emissive.setHex(T.accent);
    rugTrim.material.emissive.setHex(T.accent);
    grooveMat.emissive.setHex(T.accent);
    pillarLedMat.emissive.setHex(T.accent);
    signMat.color.setHex(T.sign);
    signLight.color.setHex(T.sign);
    sky.material.map = skyTexs[T.sky];
    if (mSky) mSky.material.map = skyTexs[T.sky];
    orb.material.color.setHex(T.orb);
    orbHalo.material.color.setHex(T.orbHalo);
    orbHalo.material.opacity = T.orbHaloOp;
    orb.position.y = T.orbY; orbHalo.position.y = T.orbY;
    cloudDeck.material.color.setHex(T.cloud);
    haloRing.material.emissive.setHex(T.haloTint);
    haloLight.color.setHex(T.haloTint);
    stripMat.emissive.setHex(T.strip);
    pendants.forEach((p) => {
      p.bar.material.emissive.setHex(T.pendant);
      p.l.color.setHex(T.pendant);
    });
    if (glowPlane) glowPlane.material.color.setHex(T.glowTint);
    glowLights.forEach((L) => L.color.setHex(T.glowTint));
    moonDir.intensity = themeName === 'night' ? 0.55 : 0.35;
    moonDir.color.setHex(themeName === 'night' ? 0x8f9dcc : 0xcc8a7a);
    syncMirrorMats();
  }
  setTheme(themeName);

  /* ======================================================================== *
   *  INTERACTION — raycast the keys, the guitars, the car                    *
   * ======================================================================== */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const keyMeshes = pianoKeys.map((k) => k.mesh);

  function cast(x, y, objects, recursive) {
    ndc.set((x / renderer.domElement.clientWidth) * 2 - 1,
      -(y / renderer.domElement.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objects, recursive);
  }

  let headlights = false;
  const api = {
    get headlights() { return headlights; },
    setHeadlights(v) {
      headlights = !!v;
      showGroup.visible = headlights;
    }
  };

  function pressKey(k, vel = 1) {
    k.press = 1; k.glow = 1;
    pianoNote(k.freq, vel);
  }

  function tap(x, y) {
    /* piano keys take priority — they're small                              */
    let hit = cast(x, y, keyMeshes, false);
    if (hit.length) {
      const k = pianoKeys.find((kk) => kk.mesh === hit[0].object);
      if (k) { pressKey(k); return 'piano'; }
    }
    hit = cast(x, y, [eGuitar], true);
    if (hit.length) {
      strum('e');
      eGuitar.userData.rock = 1;
      return 'guitar-e';
    }
    hit = cast(x, y, [aGuitar], true);
    if (hit.length) {
      strum('a');
      aGuitar.userData.rock = 1;
      return 'guitar-a';
    }
    if (carModel) {
      hit = cast(x, y, [carModel], true);
      if (hit.length) {
        audio();                          // unlock on any gesture
        api.setHeadlights(!headlights);
        return 'car';
      }
    }
    return null;
  }

  function hover(x, y) {
    const targets = [...keyMeshes, eGuitar, aGuitar];
    if (carModel) targets.push(carModel);
    const hit = cast(x, y, targets, true);
    return hit.length > 0;
  }

  /* keyboard → piano. Standard DAW row: a w s e d f t g y h u j k o l p ; ' */
  const KEYMAP = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
    KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
    KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17
  };
  let octaveShift = 1;                   // start on the middle octave
  const heldCodes = new Set();
  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.code === 'KeyZ') { octaveShift = Math.max(0, octaveShift - 1); return true; }
    if (e.code === 'KeyX') { octaveShift = Math.min(2, octaveShift + 1); return true; }
    const semi = KEYMAP[e.code];
    if (semi === undefined) return false;
    heldCodes.add(e.code);
    const idx = octaveShift * 12 + semi;
    if (idx < pianoKeys.length) pressKey(pianoKeys[idx], 0.9);
    return true;
  }
  function keyup(e) { heldCodes.delete(e.code); }

  /* ======================================================================== *
   *  CAMERA + RENDER LOOP                                                    *
   * ======================================================================== */

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.58, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let scrollU = 0, px = 0, py = 0, sx = 0, sy = 0;
  const smooth = (a, b, t2) => a + (b - a) * t2;
  const ssteps = (t2) => t2 * t2 * (3 - 2 * t2);

  function setScroll(u) { scrollU = Math.max(0, Math.min(SHOTS.length - 1, u)); }
  function setPointer(x, y) { px = x; py = y; }

  const camPos = new THREE.Vector3().fromArray(SHOTS[0].pos);
  const camLook = new THREE.Vector3().fromArray(SHOTS[0].look);
  const A = new THREE.Vector3(), B = new THREE.Vector3();

  function shotAt(u, out, key2) {
    const i = Math.min(SHOTS.length - 2, Math.floor(u));
    const f = ssteps(Math.min(1, Math.max(0, u - i)));
    A.fromArray(SHOTS[i][key2]); B.fromArray(SHOTS[i + 1][key2]);
    out.copy(A).lerp(B, f);
  }

  let t0 = performance.now();
  function render(dt, now) {
    const t = (now - t0) / 1000;
    const dts = Math.min(0.05, dt / 1000);

    /* camera */
    shotAt(scrollU, camPos, 'pos');
    shotAt(scrollU, camLook, 'look');
    sx = smooth(sx, px, reduced ? 1 : 0.06);
    sy = smooth(sy, py, reduced ? 1 : 0.06);
    const drift = reduced ? 0 : 1;
    camera.position.set(
      camPos.x + sx * 0.24 + Math.sin(t * 0.23) * 0.05 * drift,
      camPos.y + sy * 0.12 + Math.sin(t * 0.31) * 0.03 * drift,
      camPos.z
    );
    camera.lookAt(
      camLook.x + sx * 0.4,
      camLook.y + sy * 0.22,
      camLook.z
    );

    /* dais rotation */
    if (!reduced) plat.rotation.y += (DAIS_RPM / 60) * TAU * dts;
    if (mPlat) {
      mPlat.rotation.y = plat.rotation.y;
      mCarRig.scale.copy(carRig.scale);
      if (mShow) mShow.visible = showGroup.visible;
    }

    /* car arrival pop */
    if (carReady && carAppear < 1) {
      carAppear = Math.min(1, carAppear + dts * 1.4);
      const e = 1 - Math.pow(1 - carAppear, 3);
      carRig.scale.setScalar(0.001 + 0.999 * e);
    }

    /* piano key springs + glow decay */
    for (let i = 0; i < pianoKeys.length; i++) {
      const k = pianoKeys[i];
      if (k.press > 0.001 || k.glow > 0.001) {
        k.mesh.rotation.x = k.press * 0.055;
        k.press *= Math.pow(0.0018, dts);        // fast release
        k.glow *= Math.pow(0.02, dts);
        k.mesh.material.emissive.setHex(themeName === 'day' ? 0xff4d66 : 0xb48cff);
        k.mesh.material.emissiveIntensity = k.glow * (k.isBlack ? 1.4 : 0.8);
      } else if (k.mesh.material.emissiveIntensity !== 0) {
        k.mesh.material.emissiveIntensity = 0;
        k.mesh.rotation.x = 0;
      }
    }

    /* guitars rock when strummed */
    [eGuitar, aGuitar].forEach((gt) => {
      if (gt.userData.rock > 0.001) {
        gt.rotation.z = (gt === eGuitar ? 0.04 : -0.04) + Math.sin(t * 34) * 0.018 * gt.userData.rock;
        gt.userData.rock *= Math.pow(0.01, dts);
      }
    });

    /* the cloud deck slides past, slowly — we're cruising */
    if (!reduced) cloudTex.offset.x = t * 0.0022;

    /* drone hover + rotors */
    const dg = root.userData.droneGroup;
    if (dg && !reduced) {
      const dr = dg.userData.drone;
      dr.position.y = dr.userData.baseY + Math.sin(t * 1.7) * 0.035;
      dr.rotation.y = t * 0.4;
    }
    for (let i = 0; i < spin.length; i++) {
      spin[i].mesh.rotation.y += spin[i].speed * dts * (reduced ? 0.12 : 1);
    }

    /* dais ring breath */
    const pulse = reduced ? 1 : 1 + Math.sin(t * 1.6) * 0.18;
    daisRing.material.emissiveIntensity = 3.2 * pulse * (carReady ? 1 : 1.6);
    const mRing = mirrorMats.get(daisRing.material);
    if (mRing) mRing.emissiveIntensity = daisRing.material.emissiveIntensity;

    /* dust drift */
    if (!reduced) dust.rotation.y = t * 0.008;

    composer.render();
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* clone one of the GLB wheels onto the parts shelf once the car is in     */
  const wheelWatch = setInterval(() => {
    if (!carReady) return;
    clearInterval(wheelWatch);
    let wheel = null;
    carRig.traverse((o) => {
      if (!wheel && o.name && o.name.includes('3DWheel')) wheel = o;
    });
    if (wheel) {
      const w = wheel.clone(true);
      w.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
      box3.setFromObject(w);
      const size = box3.getSize(v3.clone());
      const s = 0.62 / Math.max(size.x, size.y, size.z);
      w.scale.multiplyScalar(s);
      const c2 = box3.getCenter(new THREE.Vector3());
      w.position.copy(partsWall.userData.wheelSlot).sub(c2.multiplyScalar(s));
      w.position.y += (size.y * s) / 2 - 0.02;
      w.rotation.y = 0.7;
      partsWall.add(w);
    }
  }, 300);

  return {
    setTheme, setScroll, setPointer, render, resize,
    tap, hover, keydown, keyup,
    setHeadlights: api.setHeadlights,
    get headlights() { return headlights; }
  };
}
