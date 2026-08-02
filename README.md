# Beekum Garage — ayush-b99.github.io

Pixel-art portfolio for Ayush Beekum. A 7-storey JDM workshop rendered entirely
in canvas code — no image assets except the generated favicon/OG image. A tiny
pixel Ayush walks and climbs down the building as you scroll; the theme toggle
switches the whole world between sunset and midnight.

## Deploy to GitHub Pages

The repo `Ayush-B99/Ayush-B99.github.io` is a *user site*, so GitHub serves the
`main` branch root automatically.

```bash
git clone https://github.com/Ayush-B99/Ayush-B99.github.io.git
cd Ayush-B99.github.io
# copy everything from this folder in (index.html, css/, js/, assets/, .nojekyll)
git add -A
git commit -m "Launch pixel garage portfolio"
git push origin main
```

Then check **Settings → Pages** once: Source should be *Deploy from a branch*,
`main` / `/ (root)`. The site goes live at **https://ayush-b99.github.io** in a
minute or two.

Preview locally with `python3 -m http.server` from the folder, then open
http://localhost:8000.

## Two links to update

1. **Capstone repo** — the Projects card links to
   `https://github.com/COS301-SE-2026/Gesture-Based-Drone-Control`. If that repo
   is private, point the link at a public mirror or remove it (search for the
   URL in `index.html`).
2. **MyBroadband article** — the UA Validator card currently links to
   `https://mybroadband.co.za` as a placeholder. Paste the exact article URL in
   `index.html`.

## Where things live

| File | What it is |
| --- | --- |
| `index.html` | All content — edit text, links and sections here |
| `css/style.css` | Panels, HUD, typography, theme variables |
| `js/sprites.js` | Palette, 3×5 bitmap font, every sprite (car, character, cat…) |
| `js/scene.js` | World layout, building renderer, sky, ambient animation, walk path |
| `js/main.js` | Scroll↔character sync, camera, theme toggle, HUD, easter eggs |
| `assets/` | CV PDF, favicon, OG image |

## Notes

- Small easter egg: click the S13 in the garage bay to pop the headlights
  (they cast a beam at night).
- Day/night preference is remembered in `localStorage` and falls back to the
  visitor's system color scheme.
- `prefers-reduced-motion` is respected: the character snaps instead of
  walking, flicker/twinkle is stilled and smooth scrolling is off.
- Everything is vanilla JS on purpose: zero build step, nothing to break on
  GitHub Pages, and the whole world is hand-editable pixel data.
