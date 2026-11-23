# BRIEF — render lane (shaders + asset loading)

Goal: the night-forest zombie FPS must read as a moody 3D AAA-style scene, not flat low-poly boxes, without breaking gameplay.
Stack: plain ES modules, three r180 via the importmap in `index.html` (`three`, `three/addons/`). No bundler, no new npm deps.

## Read first
`game.js` (renderer setup ~L460-500, world builders ~L860-1300, zombie creation), `post.js`, `visuals.js`.
Methods to borrow (read, adapt, do not copy whole files): `_refs/zombies-render/` (sky, lights, shadows, post, quality tiers), `_refs/zombies-mats/` (procedural materials), `_refs/valle-engine/` (height fog, AO, tone mapping).

## Write ONLY
`game.js`, `visuals.js`, `post.js`, new files under `render/`. In `index.html` only add importmap/script entries if needed.
Do NOT touch: `style.css`, `server.js`, `combat.js`, `combat.test.mjs`, `assets/**`, `_refs/**`. Another lane is filling `assets/` right now.

## Build
1. `render/assets.js`: `fetch('assets/manifest.json')`. Shape is in `BRIEF-assets.md`. Every key may be null → keep today's procedural look for that key. HDRI: `RGBELoader` + `PMREMGenerator` → `scene.environment` (keep the night dark: low `environmentIntensity`). PBR: `TextureLoader`, `SRGBColorSpace` on `map` only, `RepeatWrapping`, anisotropy from renderer. Zombie: `GLTFLoader`, `SkeletonUtils.clone` per zombie, one `AnimationMixer` each, clips by the manifest names (walk while chasing, attack in range, death on kill). Keep existing hitboxes/collision logic working with the new mesh.
2. Shader work via `onBeforeCompile` (shared chunks in `render/shaders.js`): wind sway on tree/bush foliage; height-based ground mist added to distance fog; wet-ground roughness variation on the ground.
3. Lighting: player flashlight `SpotLight` (soft shadow, penumbra), moonlight directional with tuned shadow camera; muzzle flash point light that bloom picks up.
4. `post.js`: keep GTAO/bloom/SMAA; add film grain + vignette + subtle chromatic aberration in the grade pass.
5. Expose `window.__game = { scene, renderer }` after init (for automated checks).

Out of scope: new weapons, maps, enemies, gameplay rules, UI/CSS, multiplayer, build tooling, new npm packages.

## Prove it (run all, paste outputs)
- `npm test` passes.
- `for f in game.js visuals.js post.js render/*.js; do node --check $f; done` clean.
- `PORT=3200 node server.js &` then `curl -s -o /dev/null -w '%{http_code}\n'` for `/`, `/render/assets.js`, `/render/shaders.js` → 200; then kill that server.
Stop every server you start, then DONE.
