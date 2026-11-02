# ayush-b99.github.io

Personal portfolio: a Rocket Bunny 180SX in a night street, rendered live with Babylon.js (PBR materials, HDR image-based lighting, planar glass-floor reflections, post-processing).

- `index.html` — the page: content, layout, chrome.
- `public/js/site.js` — the 3D world, the lighting sets and the page logic (plain script, no build step needed).
- `public/assets/models/rb_s13.glb` — the car (quantized + WebP, 2 MB). [2013 Rocket Bunny V2 Nissan S13](https://sketchfab.com/3d-models/2013-rocket-bunny-v2-nissan-s13-240sx-180sx-51eae60217934736887dcf016cde8903) by Ddiaz Design, CC BY-NC-SA 4.0.

Default set is `night` (`window.START_SET` in `index.html`). Other sets are in the Set picker; to ship only one, delete the `.setpick` element and the picker code in `site.js`.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist, deployed by .github/workflows/deploy.yml on push to main
```
