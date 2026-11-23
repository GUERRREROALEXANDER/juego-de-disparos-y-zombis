# BRIEF — render lane, round 2 (fixes from review)

Same rules as `BRIEF-render.md` (files you may write, out of scope, proof commands). Review of round 1 in a headless 1600x900 run:

## Problems to fix
1. **Pine foliage looks like glossy green plastic**: bright specular sheen, lit like daytime. Make foliage matte (roughness >= 0.85, metalness 0, no clearcoat), darker desaturated albedo (around #1f3a28), and lower `scene.environmentIntensity` / `material.envMapIntensity` so the night stays dark: trees must read mostly as silhouettes, lit only by moon rim and the flashlight cone. Same check for trunks and bushes.
2. **FPS fell 31.8 → 28.6** (484 meshes in scene). Convert repeated trees, trunks, bushes and rocks to `InstancedMesh` (one per geometry/material), keep shadows only on the nearest props (or a cheaper shadow map), so the frame budget goes back above baseline.
3. **The first-person gun is still flat boxes** and is the most visible object on screen. Rebuild the viewmodel in `visuals.js` from beveled/extruded geometry (`ExtrudeGeometry` with bevel, cylinders for barrel/slide details), PBR gunmetal (metalness ~0.8, roughness 0.35-0.5, subtle roughness noise), darker polymer grip; hands not as skin-colored cubes (gloved, dark).
4. **Death**: the zombie has no death clip. Instead of instant removal, blend out the current clip, tip the body over (~0.5s rotation + drop to ground), fade/sink, then remove.

Out of scope: same as round 1, plus no new assets and no changes to `assets/`.

## Prove it
Same three proofs as round 1, and print `scene.children.length` plus a mesh count from a Node-side count of how many `new THREE.Mesh(` / `InstancedMesh` calls the world builders make (before vs after). Stop every server you start, then DONE.
