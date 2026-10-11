# ayush-b99.github.io

Portfolio site: React + Vite, three.js (black water with the car's reflection, Rocket Bunny S13 GLB), Motion, and a few React Bits components.

## Run locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to GitHub Pages.

One-time setting: in the repo on GitHub go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

## Where things are

- `src/Scene.jsx` — the three.js scene: water, lights, the car's entrance and parking spot. `PAINT` is the body colour; `CAM`/`LOOK` frame the camera; `YAW1` is the parked angle; `parkX`/`parkZ` in `resize()` place the car.
- `src/App.jsx` — all the page content and sections.
- `src/Builds.jsx` — the one-project-at-a-time stack.
- `src/bits/` — React Bits components (MIT), copied in as-is.
- `public/assets/` — model, CV, favicon, OG image, water normal map.

Car model: 2013 Rocket Bunny V2 Nissan S13 by Ddiaz Design, CC BY-NC-SA 4.0.
