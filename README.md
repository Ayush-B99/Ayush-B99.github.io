# ayush-b99.github.io

Portfolio site. One HTML file, no build step. The car in the hero is a GLB model rendered with three.js (loaded from a CDN at runtime).

## Run it locally

The page fetches `assets/models/rb_s13.glb`, so it must be served over HTTP (opening the file directly won't load the car).

```bash
cd portfolio
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages (replace the old site)

```bash
git clone https://github.com/Ayush-B99/Ayush-B99.github.io.git
cd Ayush-B99.github.io
git rm -r --quiet css js index.html README.md .DS_Store 2>/dev/null
cp -r /path/to/portfolio/. .
git add -A
git commit -m "Rebuild site"
git push
```

GitHub Pages is already set up for this repo, so the site updates at https://ayush-b99.github.io/ a minute or two after the push.

## Files

- `index.html` — the whole site: layout, styles, interactions and the three.js scene
- `assets/models/rb_s13.glb` — Rocket Bunny S13 (Ddiaz Design, CC BY-NC-SA 4.0; credit stays in the footer)
- `assets/Ayush_Beekum_CV.pdf`, `assets/favicon.png`, `assets/og.png`

## Tweaks

Near the top of the `<script type="module">` block in `index.html`:

- `PAINT` — body colour (hex)
- `CAM` / `LOOK` — camera position and the point it looks at
- `key.position` — key light direction (moves the shadow)

To swap the car, drop in another `.glb` with the nose pointing +Z and update the path in `GLTFLoader().load(...)`.
