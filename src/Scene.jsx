import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PAINT = 0xc8102e;
const CAM = new THREE.Vector3(0, 12.2, -3.4);
const LOOK = new THREE.Vector3(0, 0.3, 0.45);

// Black water seen from above, with the car driving up out of the dark
// and parking on the left at an angle. Fixed behind the whole page.
export default function Scene({ onProgress, onParked, onError }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    camera.position.copy(CAM);
    camera.lookAt(LOOK);

    // --- lights: one dim lamp over the parking spot, a cool rim from the far side
    scene.add(new THREE.AmbientLight(0x202a3a, 0.35));
    const lamp = new THREE.SpotLight(0xfff1dc, 40, 40, 0.5, 0.85, 1.5);
    lamp.position.set(1.5, 9.5, -1);
    scene.add(lamp, lamp.target);
    const rim = new THREE.DirectionalLight(0x5a7fb3, 0.9);
    rim.position.set(-6, 4, -8);
    scene.add(rim);

    // --- water
    const normals = new THREE.TextureLoader().load('/assets/waternormals.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
    const sun = new THREE.Vector3(-0.35, 0.28, 0.9).normalize();
    const water = new Water(new THREE.PlaneGeometry(240, 240), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sun.clone(),
      sunColor: 0x7d8fa6,
      waterColor: 0x02060c,
      distortionScale: 1.8,
      fog: false
    });
    water.rotation.x = -Math.PI / 2;
    // a dim moon high above and behind the camera: out of shot, but the water reflects it
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 24), new THREE.MeshBasicMaterial({ color: 0x66748c }));
    moon.position.set(1.5, 58, 30);
    scene.add(moon);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 24), new THREE.MeshBasicMaterial({ color: 0x1a1f29, transparent: true, opacity: 0.5 }));
    glow.position.copy(moon.position);
    scene.add(glow);
    water.material.uniforms.size.value = 3.2;
    scene.add(water);

    // --- car
    const rig = new THREE.Group();
    const body = new THREE.Group();
    rig.add(body);
    scene.add(rig);
    const wheels = [], headMats = [], tailMats = [];
    let ready = false;

    new GLTFLoader().load(
      '/assets/models/rb_s13.glb',
      gltf => {
        const car = gltf.scene;
        const box = new THREE.Box3().setFromObject(car);
        const size = box.getSize(new THREE.Vector3());
        car.scale.setScalar(4.5 / size.z);
        box.setFromObject(car);
        const c = box.getCenter(new THREE.Vector3());
        car.position.set(-c.x, -box.min.y, -c.z);
        car.traverse(o => {
          if (!o.isMesh) return;
          const m = o.material, n = m.name || '';
          m.envMapIntensity = 0.45;
          if (/CarPaint/.test(n) && !/Trim/.test(n)) {
            m.color.setHex(PAINT); m.metalness = 0.5; m.roughness = 0.28; m.envMapIntensity = 0.7;
          } else if (/LightGlass_Clear/.test(n)) {
            m.emissive = new THREE.Color(0xfff1c0); m.emissiveIntensity = 0; headMats.push(m);
          } else if (/LightGlassNormal_Red/.test(n)) {
            m.emissive = new THREE.Color(0xff2a2a); m.emissiveIntensity = 0.3; tailMats.push(m);
          }
          if (/Wheel|rim/i.test(n) && !/Trim/i.test(n)) {
            o.geometry.computeBoundingBox();
            const s = o.geometry.boundingBox.getSize(new THREE.Vector3());
            if (s.y > 0.4 && s.z > 0.4 && s.x < 0.4) wheels.push(o);
          }
        });
        body.add(car);
        ready = true;
        start();
      },
      e => { if (e.total && onProgress) onProgress(e.loaded / e.total); },
      () => { onError && onError(); }
    );

    // --- framing
    let aspect = 1, camScale = 1, parkX = 2.4, parkZ = 0;
    function resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h, false);
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const portrait = w <= 900;
      camScale = portrait ? 1.45 : 1.05;
      parkZ = portrait ? 1.6 : 0;
      // visible width on the water at the car's distance; park 27% in from the left edge
      const visH = 2 * 13 * camScale * Math.tan(THREE.MathUtils.degToRad(15));
      parkX = portrait ? 0.5 : visH * aspect * (0.5 - 0.27);
      lamp.position.set(parkX - 0.8, 9.5, parkZ - 1);
      lamp.target.position.set(parkX, 0, parkZ + 0.2);
    }
    resize();
    addEventListener('resize', resize);

    // --- motion
    const S = { x: 0, z: -11, yaw: 0, parked: false, t0: 0, scrollZ: 0, pitch: 0, pv: 0 };
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const YAW0 = THREE.MathUtils.degToRad(-11), YAW1 = THREE.MathUtils.degToRad(-24);
    const setLights = (h, t) => { headMats.forEach(m => m.emissiveIntensity = h); tailMats.forEach(m => m.emissiveIntensity = t); };

    let raf = 0, last = performance.now(), running = true;
    function start() {
      if (reduce) {
        S.parked = true; S.x = parkX; S.z = parkZ; S.yaw = YAW1;
        setLights(2.4, 0.3);
        onParked && onParked();
      } else {
        S.t0 = performance.now();
      }
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;

      // water
      water.material.uniforms.time.value += dt * 0.32;
      const a = now * 0.00006;
      water.material.uniforms.sunDirection.value.set(sun.x + Math.sin(a) * 0.12, sun.y, sun.z + Math.cos(a) * 0.08).normalize();

      if (ready) {
        const prevZ = S.z;
        if (!S.parked) {
          const t = Math.min(1, (now - S.t0) / 2900);
          const x0 = parkX + 2.0;
          S.z = -11 + (parkZ + 11) * easeOut(t);
          S.x = x0 + (parkX - x0) * easeInOut(t);
          S.yaw = YAW0 + (YAW1 - YAW0) * easeInOut(Math.max(0, (t - 0.45) / 0.55));
          setLights(0, t > 0.6 ? 1.8 : 0.3);
          if (t >= 1) {
            S.parked = true;
            setTimeout(() => { setLights(2.4, 0.3); onParked && onParked(); }, 350);
          }
        } else {
          S.z += (parkZ + S.scrollZ - S.z) * 0.08;
        }
        const v = (S.z - prevZ) / Math.max(dt, 1e-3);
        const accel = (v - S.pv) / Math.max(dt, 1e-3); S.pv = v;
        S.pitch = THREE.MathUtils.clamp(S.pitch + ((-accel * 0.005) - S.pitch) * 0.12, -0.05, 0.05);
        wheels.forEach(w => w.rotation.x += (S.z - prevZ) / 0.31);
        rig.position.set(S.x, 0, S.z);
        rig.rotation.y = S.yaw;
        body.rotation.x = S.pitch;
      }

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      camera.position.set(CAM.x + pointer.x * 1.4, CAM.y + pointer.y * 0.7, CAM.z - pointer.y * 0.5).multiplyScalar(camScale);
      camera.lookAt(LOOK);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);

    const onScroll = () => { S.scrollZ = Math.min(scrollY, innerHeight) / innerHeight * 16; };
    const onMove = e => { if (e.pointerType === 'touch') return; pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; };
    const onVis = () => { running = !document.hidden; last = performance.now(); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('scroll', onScroll);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
      pmrem.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="scene" aria-hidden="true" />;
}
