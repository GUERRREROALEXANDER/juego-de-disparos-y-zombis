# BRIEF — round 3: AAA push (assets + integration)

Goal: close the gap between this night-forest zombie FPS and an AAA look. You own both the resources and their integration.
Read first: `BRIEF-assets.md`, `BRIEF-render.md` (rules, file limits, out of scope still apply), `assets/manifest.json`, `render/assets.js`, `render/instancing.js`, `render/zombies.js`, `post.js`.
You have bash + curl, no browser. Plain ES modules, three r180 via the importmap. No new npm packages.

## The 3 visible gaps (from a review of screenshots)
1. **Models are low-poly** (Quaternius zombie + pine). Find higher-detail replacements:
   - Trees: Poly Haven models API (`https://api.polyhaven.com/assets?t=models`, files via `/files/<id>`), look for conifer/pine/fir or dead trees; 1k textures, glTF. CC0. Each under 8 MB.
   - Zombie: a rigged, animated humanoid/zombie GLB with a walk clip, more detailed than the current one, CC0 or CC-BY, under 6 MB, from a source you can download with curl. If nothing better is downloadable with a verifiable license, KEEP the current zombie and say so. Do not fake a source.
   - Add new entries to `assets/manifest.json` + `assets/CREDITS.md` (same shape; trees keep going through `instanceFromObject`).
2. **Muzzle flash is a flat yellow disc.** Replace it with an additive, camera-facing flash: 2-3 crossed quads with a star/flare texture (CC0 particle texture, e.g. Kenney Particle Pack, or draw one procedurally on a canvas), random rotation and scale per shot, ~50 ms life, plus the existing point light.
3. **No atmosphere depth.** Add (in `render/` + `post.js`): height fog that thickens near the ground, a few drifting fog cards/sprites between the trees, and moonlight shafts (screen-space god rays from the moon direction, or textured light-shaft cards). Keep night dark.

## Write ONLY
`assets/**`, `render/**`, `visuals.js`, `post.js`, and minimal wiring in `game.js`. Do not touch `style.css`, `server.js`, `combat*.js`, `index.html`, `_refs/**`.
Out of scope: gameplay, weapons list, map layout, UI, multiplayer, new npm deps.

## Prove it (run all, paste outputs)
- `npm test` passes; `node --check` clean on `game.js visuals.js post.js render/*.js`.
- The manifest check from `BRIEF-assets.md` prints OK; `du -sh assets` under 60M.
- `PORT=3200 node server.js &`, `curl` 200 on `/` and every new file under `assets/` you reference; kill the server.
Report: the CREDITS rows you added, model triangle counts (old vs new), and what you could NOT find. Stop every server you start, then DONE.
