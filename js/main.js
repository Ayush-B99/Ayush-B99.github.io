/* ==========================================================================
   BEEKUM GARAGE — main.js
   Boots the glass showroom, maps your scroll to the camera dolly, and wires
   the HUD, theme toggle, the piano keys and the easter eggs.
   ========================================================================== */

const FLOORS = [
  'SHOWROOM · BEEKUM GARAGE',
  'LOUNGE · DRIVER PROFILE',
  'GALLERY · CLIENT WORK',
  'PLINTH · R&D',
  'PARTS WALL · SKILLS',
  'VITRINE · TROPHY',
  'FRONT DESK · PIT WALL'
];
const GEARS = ['N', '1', '2', '3', '4', '5', '6'];

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sections = Array.from(document.querySelectorAll('main section'));
const canvas = document.getElementById('world');

/* ------------------------------- theme ---------------------------------- */

function getSavedTheme() {
  try { return localStorage.getItem('bg-theme'); } catch (e) { return null; }
}
function saveTheme(t) { try { localStorage.setItem('bg-theme', t); } catch (e) { /* fine */ } }

let theme = getSavedTheme() ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');

const toggleBtn = document.getElementById('themeToggle');
function applyThemeAttr(t) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  toggleBtn.setAttribute('data-mode', t);
  toggleBtn.setAttribute('aria-label',
    t === 'night' ? 'Switch to sunset mode' : 'Switch to midnight mode');
}
applyThemeAttr(theme);

/* --------------------------- reveal + HUD -------------------------------- */

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: 0.12 });
document.querySelectorAll('.panel').forEach((p) => io.observe(p));

const hudFloor = document.getElementById('hudFloor');
const gearNum = document.getElementById('gearNum');
const rpmFill = document.getElementById('rpmFill');
const dots = Array.from(document.querySelectorAll('.nav-dot'));
let activeIdx = -1;

function sectionProgress() {
  const vh = window.innerHeight;
  const y = window.scrollY + vh * 0.5;
  let idx = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].offsetTop <= y) idx = i;
  }
  const el = sections[idx];
  const local = Math.max(0, Math.min(1, (y - el.offsetTop) / el.offsetHeight));
  return { idx, local };
}

function updateHUD() {
  const { idx, local } = sectionProgress();
  if (idx !== activeIdx) {
    activeIdx = idx;
    hudFloor.textContent = FLOORS[idx];
    gearNum.textContent = GEARS[idx];
    dots.forEach((d, di) => d.classList.toggle('on', di === idx));
  }
  rpmFill.style.width = Math.round(Math.max(0.06, local) * 100) + '%';
  return idx + local;
}

dots.forEach((d, i) => {
  d.addEventListener('click', () => {
    window.scrollTo({
      top: sections[i].offsetTop + 4,
      behavior: reduced ? 'auto' : 'smooth'
    });
  });
});

/* ------------------------------- boot 3D --------------------------------- */

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
const quality = (smallScreen || navigator.hardwareConcurrency <= 4) ? 'low' : 'high';

if (!webglOK()) {
  /* fallback: styled gradient backdrop, everything readable, no 3D */
  document.documentElement.classList.add('no3d');
  canvas.remove();
  updateHUD();
  window.addEventListener('scroll', updateHUD, { passive: true });
  toggleBtn.addEventListener('click', () => {
    applyThemeAttr(theme === 'night' ? 'day' : 'night');
    saveTheme(theme);
  });
} else {
  /* wait for fonts too — the neon sign is rasterised once, and it should
     bake with Michroma, not the fallback face                             */
  const fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready.catch(() => {})
    : Promise.resolve();
  Promise.all([import('./scene3d.js?v=8'), fontsReady]).then(([{ createGarage }]) => {
    const garage = createGarage(canvas, { quality, reduced, theme });

    function resize() {
      garage.resize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', resize);
    resize();

    toggleBtn.addEventListener('click', () => {
      applyThemeAttr(theme === 'night' ? 'day' : 'night');
      saveTheme(theme);
      garage.setTheme(theme);
    });

    /* mouse / touch parallax + a pointer cursor over anything playable */
    let lastHover = 0;
    window.addEventListener('pointermove', (e) => {
      garage.setPointer(
        (e.clientX / window.innerWidth - 0.5) * 2,
        -(e.clientY / window.innerHeight - 0.5) * 2
      );
      const now = performance.now();
      if (now - lastHover > 90) {
        lastHover = now;
        canvas.style.cursor = garage.hover(e.clientX, e.clientY) ? 'pointer' : '';
      }
    }, { passive: true });

    /* tap things: piano keys play, guitars strum, the S13 goes show mode */
    canvas.addEventListener('pointerdown', (e) => {
      garage.tap(e.clientX, e.clientY);
    });

    /* your computer keyboard is the piano — A row plays, W row is sharps,
       Z / X shift octaves                                                  */
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      garage.keydown(e);
    });
    window.addEventListener('keyup', (e) => garage.keyup(e));

    let running = true;
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) { last = performance.now(); requestAnimationFrame(frame); }
    });

    let last = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(48, now - last); last = now;
      const u = updateHUD();
      garage.setScroll(u);
      garage.render(dt, now);
      requestAnimationFrame(frame);
    }
    document.documentElement.classList.add('live');
    requestAnimationFrame(frame);
  }).catch(() => {
    document.documentElement.classList.add('no3d');
    updateHUD();
    window.addEventListener('scroll', updateHUD, { passive: true });
    toggleBtn.addEventListener('click', () => {
      applyThemeAttr(theme === 'night' ? 'day' : 'night');
      saveTheme(theme);
    });
  });
}
