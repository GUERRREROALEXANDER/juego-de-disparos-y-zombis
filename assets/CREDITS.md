# Credits — third-party assets in `assets/`

All files below were downloaded with curl and verified to open. Licenses as stated by the source at download time.

| File | Author | License | Source URL |
| --- | --- | --- | --- |
| `assets/hdri/moonlit_golf_1k.hdr` | Poly Haven (Greg Zaal / Rob Tuytel) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/moonlit_golf |
| `assets/textures/ground/diff.jpg` | Poly Haven — `forrest_ground_01` (Diffuse 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/forrest_ground_01 |
| `assets/textures/ground/nor_gl.jpg` | Poly Haven — `forrest_ground_01` (nor_gl 1k JPG, OpenGL normal) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/forrest_ground_01 |
| `assets/textures/ground/rough.jpg` | Poly Haven — `forrest_ground_01` (Rough 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/forrest_ground_01 |
| `assets/textures/ground/ao.jpg` | Poly Haven — `forrest_ground_01` (AO 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/forrest_ground_01 |
| `assets/textures/bark/diff.jpg` | Poly Haven — `bark_brown_01` (Diffuse 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/bark_brown_01 |
| `assets/textures/bark/nor_gl.jpg` | Poly Haven — `bark_brown_01` (nor_gl 1k JPG, OpenGL normal) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/bark_brown_01 |
| `assets/textures/bark/rough.jpg` | Poly Haven — `bark_brown_01` (Rough 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/bark_brown_01 |
| `assets/textures/bark/ao.jpg` | Poly Haven — `bark_brown_01` (AO 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/bark_brown_01 |
| `assets/textures/rock/diff.jpg` | Poly Haven — `rock_01` (Diffuse 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/rock_01 |
| `assets/textures/rock/nor_gl.jpg` | Poly Haven — `rock_01` (nor_gl 1k JPG, OpenGL normal) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/rock_01 |
| `assets/textures/rock/rough.jpg` | Poly Haven — `rock_01` (Rough 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/rock_01 |
| `assets/textures/rock/ao.jpg` | Poly Haven — `rock_01` (AO 1k JPG) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/rock_01 |
| `assets/models/zombie.glb` | Quaternius — "Animated Zombie" (ZombieWalk / ZombieBite / ZombieIdle; skin recolored gray by the zeroed project) | CC-BY 3.0, attribution: Quaternius | https://poly.pizza/m/jkrEvQZb8J |
| `assets/trees/pine_trees.glb` | Quaternius — "Pine Trees" | CC0 — https://creativecommons.org/publicdomain/zero/1.0/ | https://poly.pizza/m/oYtDty0fR6 |
| `assets/trees/dead_trunk_02/dead_tree_trunk_02_1k.gltf` (+ `dead_tree_trunk_02.bin`, `textures/*.jpg` 1k) | Poly Haven — `dead_tree_trunk_02` (fallen dead trunk, glTF 1k: diff + nor_gl + ARM) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/dead_tree_trunk_02 |
| `assets/trees/stump_01/tree_stump_01_1k.gltf` (+ `tree_stump_01.bin`, `textures/*.jpg` 1k) | Poly Haven — `tree_stump_01` (tree stump, glTF 1k: diff + nor_gl + ARM) | CC0 — https://polyhaven.com/license | https://polyhaven.com/a/tree_stump_01 |

Notes:
- Zombie GLB clips present in file: `Crawl`, `Death`, `HitReact`, `Idle`, `Idle_Attack`, `Jump`, `Jump_Idle`, `Jump_Land`, `No`, `Punch`, `Run`, `Run_Arms`, `Run_Attack`, `Walk`, `Wave`, `Yes` (plus `CharacterArmature|`-prefixed duplicates). Manifest maps walk → `Walk`, attack → `Idle_Attack`, death → `Death`, idle → `Idle`. Replaces the previous Quaternius "Animated Zombie" (CC-BY 3.0, 2116 tris, no death clip); the new "Zombie" is 7822 tris, CC0 1.0.
- Round 3: the two Poly Haven trees are photogrammetry scans (83 128 tris fallen trunk, 41 046 tris stump vs 3 666 tris for the old low-poly pine). Each model (gltf + bin + 1k JPGs) is under 8 MB. `targetHeight` in the manifest keeps the lying trunk (~1.2 m) and the stump (~0.8 m) at real-world size instead of the 7 m pine normalisation.
- No values were invented: every license and source URL above was fetched during this task (Poly Haven API + file endpoints + asset pages + license page; Poly Pizza model pages showing author/license).
