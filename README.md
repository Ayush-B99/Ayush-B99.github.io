# Beekum Garage — ayush-b99.github.io

Real-time 3D portfolio for Ayush Beekum. The whole site is one WebGL sky
lounge — a minimal black-and-glass showroom high above the cloud deck, dark
marble over a true mirror floor, a halo ring light over a slowly turning
Rocket Bunny S13, a neon BEEKUM GARAGE sign — and beyond the curtain wall,
open sky: a starfield at night, a sunset over the clouds by day. Rendered
live with Three.js; scrolling drives a cinematic camera through seven framed
shots, one per section.

There is also a **music lounge**: a grand piano you can actually play (tap
the keys, or use your computer keyboard) and two guitars that strum when you
click them. All instrument sounds are synthesised in WebAudio on the fly —
no audio files.

Everything in the scene is generated in code at runtime, with one exception:
the car itself, which is a Sketchfab model (credit below). The previous
pixel-art version, and the earlier all-procedural workshop, live on in the
git history.

## Deploy to GitHub Pages

The repo `Ayush-B99/Ayush-B99.github.io` is a *user site*, so GitHub serves
the `main` branch root automatically.

```bash
git add -A
git commit -m "Rebuild: glass showroom + playable instruments"
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
| `js/scene3d.js` | The entire 3D world: room, dais, instruments, lights, audio synths, camera rig, post |
| `js/main.js` | Scroll→camera mapping, HUD, theme toggle, input wiring, WebGL/fonts gating |
| `assets/models/rb_s13.glb` | The car (see credit below) |
| `assets/` | CV PDF, favicon, OG image |

## How it works

- **Three.js r169** is loaded from jsDelivr via an import map — zero build
  step, nothing to break on GitHub Pages.
- **Camera rig** — each section owns a keyframed shot (position + look
  target) in the `SHOTS` array at the top of `js/scene3d.js`. Scroll
  progress eases the camera between them, with a slow idle drift and a few
  centimetres of pointer parallax. Reframe any section by editing its line.
- **The dais** — the platform group rotates at `DAIS_RPM`; the car is
  parented to it, auto-grounded and centred from its bounding box after
  load. Clicking the car toggles show mode: underglow + headlight beams.
- **Procedural set** — marble, the city beyond the glass, the neon sign,
  plaques and screens are painted to canvases at boot. The gothic arches,
  rose window, chandeliers, piano, guitars, trophies and furniture are all
  built from Three.js primitives and extruded 2D shapes.
- **Instruments** — 36 piano keys (C4–B6) are individual meshes with a
  press animation; notes are a 3-partial oscillator synth with a hammer
  transient. Guitars use Karplus–Strong plucked-string buffers (the
  electric adds a tanh waveshaper for drive). A generated impulse response
  gives everything a small hall. Keyboard map: A-row = naturals, W-row =
  sharps, `Z`/`X` shift octaves.
- **Realistic look, cheap frame** — three tricks carry the image:
  1. a *studio environment*: a black void with huge soft light panels,
     PMREM'd per theme, which rolls long highlights across the bodywork
     the way a photo studio does;
  2. a *mirror world*: the dais, car, colonnade and city are cloned,
     y-flipped and parked under a translucent marble floor — a true planar
     reflection for a few extra draw calls instead of re-rendering the
     whole scene every frame like a `Reflector` does;
  3. *contact shadows*: soft dark blobs ground the car and every prop.
- **Sketchfab material surgery** — the GLB ships with half its materials
  flagged alpha-BLEND (chassis, engine, interior), which three.js can't
  depth-sort per-mesh, so untreated it renders scrambled. On load the
  scene forces those opaque (keeping real cut-outs via `alphaTest`),
  rebuilds the glass as simple transparency (no transmission pass), hides
  zero-alpha export leftovers, and sets everything double-sided so thin
  panels don't get backface-culled into holes.
- **Post** — ACES tone mapping + UnrealBloom, pixel ratio capped at 1.5
  (visually identical on retina, roughly half the fragment work).
- **Repaint the car** — set `PAINT_OVERRIDE` at the top of `js/scene3d.js`
  to a hex (e.g. `0x8f1626`) to recolour the body-paint materials; `null`
  keeps the original finish.

## If the car doesn't appear

The scene falls back to a plain stand-in coupe whenever it can't load a real
model, and says why in the browser console. The usual cause is that the GLB
never actually reached the repo — GitHub's web uploader silently drops large
binaries. Verify from the terminal:

```bash
ls -la assets/models/rb_s13.glb        # must be ~7.3 MB, not a few bytes
git add -f assets/models/rb_s13.glb
git commit -m "Add car model"
git push origin main
```

Then confirm it really landed:
`curl -sI https://raw.githubusercontent.com/Ayush-B99/Ayush-B99.github.io/main/assets/models/rb_s13.glb | grep -i content-length`

The loader accepts either `rb_s13.glb` or the original long Sketchfab
filename, in `assets/models/` or the repo root, and skips any file under
100 KB as a placeholder.

## Car model credit

"[2013 Rocket Bunny V2 - Nissan S13 240SX / 180SX](https://sketchfab.com/3d-models/2013-rocket-bunny-v2-nissan-s13-240sx-180sx-51eae60217934736887dcf016cde8903)"
by [Ddiaz Design](https://sketchfab.com/ddiaz-design), licensed
[CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/).
The model is included unmodified at `assets/models/rb_s13.glb`; attribution
also appears in the site footer. If you fork this repo for anything
commercial, swap the model out — the licence is non-commercial.

## Notes

- The day/night toggle is **afterglow vs. orbit** — a sunset over the cloud
  deck with warm crimson interior light, or a starfield with cold violet.
  Preference is kept in `localStorage` and falls back to the visitor's
  system colour scheme.
- `prefers-reduced-motion` is respected: the camera snaps between shots, the
  dais holds still, drift/parallax/dust/flicker are stilled. (Sounds still
  play — they only ever happen on your own click or keypress.)
- No WebGL? The site swaps to a styled gradient backdrop and stays fully
  readable and navigable.
- If the GLB ever fails to load, a dark silhouette car keeps the dais from
  standing empty and the console says why.
