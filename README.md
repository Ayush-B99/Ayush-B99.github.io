# Beekum Garage — ayush-b99.github.io

Real-time 3D portfolio for Ayush Beekum. The whole site is one WebGL night
workshop — concrete, a wet reflective floor, hanging work lamps, a neon
BEEKUM GARAGE sign and a red Nissan 200SX S13 — rendered live with Three.js.
Scrolling drives a cinematic camera through seven framed shots, one per
section. Every surface is generated in code at runtime: no 3D model files,
no image assets except the favicon/OG image.

The previous pixel-art version lives on in the git history.

## Deploy to GitHub Pages

The repo `Ayush-B99/Ayush-B99.github.io` is a *user site*, so GitHub serves
the `main` branch root automatically.

```bash
git add -A
git commit -m "Rebuild: real-time 3D garage"
git push origin main
```

Then check **Settings → Pages** once: Source should be *Deploy from a branch*,
`main` / `/ (root)`. Live at **https://ayush-b99.github.io** in a minute or two.

Preview locally with `python3 -m http.server` from the folder, then open
http://localhost:8000. (Modules + the import map need http://, not file://.)

## Two links to update

1. **Capstone repo** — the Projects card links to
   `https://github.com/COS301-SE-2026/Gesture-Based-Drone-Control`. If that
   repo is private, point the link at a public mirror (search for the URL in
   `index.html`).
2. **MyBroadband article** — the UA Validator card links to
   `https://mybroadband.co.za` as a placeholder. Paste the exact article URL.

## Where things live

| File | What it is |
| --- | --- |
| `index.html` | All content — text, links, sections, and the Three.js import map |
| `css/style.css` | Glass panels, motorsport typography, HUD, themes, fallback |
| `js/scene3d.js` | The entire 3D world: set, S13, lights, procedural textures, camera rig, post-processing |
| `js/main.js` | Scroll→camera mapping, HUD, theme toggle, easter eggs, WebGL/fonts gating |
| `assets/` | CV PDF, favicon, OG image |

## How it works

- **Three.js r169** is loaded from jsDelivr via an import map — still zero
  build step, still nothing to break on GitHub Pages.
- **Camera rig** — each section owns a keyframed shot (position + look
  target). Scroll progress eases the camera between them, with a slow idle
  drift and a few centimetres of pointer parallax on top.
- **Procedural everything** — concrete, asphalt (with a roughness map so oil
  stains read wet), the neon sign, monitor screens and the city outside the
  roller door are all drawn to canvases at boot and used as textures. The
  S13 is two extruded side-profile shapes with clearcoat paint, plus wheels,
  a tail-light bar and hinged pop-up pods.
- **Post** — ACES tone mapping + UnrealBloom. On capable machines the floor
  gets a true planar reflection (Reflector) under a semi-transparent asphalt
  layer; smaller/slower devices get a glossy env-mapped floor instead.

## Notes

- Easter egg: click the S13 anywhere — the pop-up headlights flip up and
  cast real beams (best at midnight).
- The sunset/midnight toggle relights the whole set — sun through the
  roller-door gap vs. cool night, city glow and neon. Preference is kept in
  `localStorage` and falls back to the visitor's system colour scheme.
- `prefers-reduced-motion` is respected: the camera snaps between shots,
  drift/parallax/dust/flicker are stilled, smooth scrolling is off.
- No WebGL? The site swaps to a styled gradient backdrop and stays fully
  readable and navigable.
