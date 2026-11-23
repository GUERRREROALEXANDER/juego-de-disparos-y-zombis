# BRIEF — asset lane (resources)

Goal: real, licensed 3D resources so the night-forest zombie game stops looking like flat primitives.
Work only inside this folder. You have bash + curl; no browser.

## Write ONLY
- `assets/**` (new files) and `assets/manifest.json`, `assets/CREDITS.md`.
- Do NOT touch any `.js`, `.html`, `.css`, `server.js`, `_refs/`.

## Get (download with curl, verify each file opens)
1. **HDRI, night or dusk**, 1k or 2k `.hdr` from Poly Haven (API: `https://api.polyhaven.com/assets?t=hdris`, files: `https://api.polyhaven.com/files/<id>`). CC0.
2. **3 PBR texture sets at 1k JPG**: forest ground (dirt/leaves), tree bark, rock. Poly Haven (`t=textures`) or ambientCG (`https://ambientcg.com/api/v2/full_json?type=Material`). Each set: diff/albedo + normal (GL) + roughness, AO if present.
3. **One rigged, animated zombie `.glb`** with walk + attack (or idle) + death clips. Lead: Quaternius "Animated Zombie", https://poly.pizza/m/jkrEvQZb8J, CC-BY 3.0 (a copy for comparison is in `_refs/zeroed/zombie_walker.glb`; `_refs/zeroed/ASSETS.md` shows how it is credited). Prefer an original source download; if you cannot download one, copy `_refs/zeroed/zombie_walker.glb` and credit Quaternius CC-BY 3.0 with that URL.
4. Optional: 1–3 CC0 tree/pine `.glb` models (Quaternius / Kenney / Poly Haven), each under 2 MB.

List the zombie's real clip names with: `node -e` reading the GLB JSON chunk (bytes 20.. of the file, length at bytes 12..16), print `animations[].name`.

## Fill `assets/manifest.json` (keep this shape)
```json
{
  "hdri": {"file": "assets/hdri/<id>_1k.hdr", "license": "CC0", "source": "<url>"},
  "pbr": {"ground": {"map": "...", "normalMap": "...", "roughnessMap": "...", "aoMap": null, "repeat": 24, "license": "CC0", "source": "<url>"}, "bark": {...}, "rock": {...}},
  "zombie": {"file": "assets/models/zombie.glb", "clips": {"walk": "<real name>", "attack": "<real name or null>", "death": "<real name or null>", "idle": "<real name or null>"}, "license": "...", "author": "...", "source": "<url>"},
  "trees": [{"file": "...", "license": "...", "source": "..."}] or null
}
```

## Rules
- Invent nothing: every license and source URL must be one you actually fetched. Unknown = `null` + a line in CREDITS.md saying why.
- Total `assets/` under 40 MB.
- `assets/CREDITS.md`: one row per file: file, author, license, source URL.

## Done when
`node -e "const m=require('./assets/manifest.json');const fs=require('fs');for(const p of [m.hdri?.file,m.zombie?.file,...Object.values(m.pbr).flatMap(s=>s?[s.map,s.normalMap,s.roughnessMap]:[])])if(p&&!fs.existsSync(p))throw p;console.log('OK')"` prints OK and `du -sh assets` is under 40M.
Report: the table from CREDITS.md + the zombie clip names. Stop every server you start, then DONE.
