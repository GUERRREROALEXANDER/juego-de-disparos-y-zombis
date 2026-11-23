// ==========================================================
// ASSET LOADING
//
// Reads assets/manifest.json and loads whatever the asset lane
// actually shipped: an HDRI for the environment, PBR sets for
// ground / bark / rock, the rigged zombie GLB and optional trees.
//
// Every key may be null (or the file may be missing). Anything
// that fails to load resolves to null and the caller falls back
// to the procedural look, so the game never blocks on a download
// and never breaks on a bad manifest.
// ==========================================================

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MANIFEST_URL = 'assets/manifest.json';
const LOAD_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, fallback = null) {
    return Promise.race([
        promise.catch((error) => {
            console.warn('[assets] load failed:', error && error.message ? error.message : error);
            return fallback;
        }),
        new Promise((resolve) => {
            window.setTimeout(() => resolve(fallback), ms);
        })
    ]);
}

function tuneTexture(texture, renderer, { srgb = false, repeat = null } = {}) {
    if (!texture) return null;

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;

    if (renderer && renderer.capabilities) {
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }

    if (repeat) texture.repeat.set(repeat, repeat);

    texture.needsUpdate = true;
    return texture;
}

async function loadPbrSet(spec, renderer) {
    if (!spec) return null;

    const loader = new THREE.TextureLoader();
    const repeat = Number.isFinite(spec.repeat) ? spec.repeat : 24;

    const load = (url, srgb) => {
        if (!url) return Promise.resolve(null);
        return withTimeout(
            loader.loadAsync(url).then((texture) => tuneTexture(texture, renderer, { srgb, repeat })),
            LOAD_TIMEOUT_MS,
            null
        );
    };

    const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
        load(spec.map, true),
        load(spec.normalMap, false),
        load(spec.roughnessMap, false),
        load(spec.aoMap, false)
    ]);

    if (!map && !normalMap && !roughnessMap && !aoMap) return null;

    return { map, normalMap, roughnessMap, aoMap, repeat };
}

async function loadEnvironment(file, renderer) {
    if (!file) return null;

    const rgbe = new RGBELoader();
    rgbe.setDataType(THREE.HalfFloatType);

    const texture = await withTimeout(rgbe.loadAsync(file), LOAD_TIMEOUT_MS, null);
    if (!texture) return null;

    texture.mapping = THREE.EquirectangularReflectionMapping;

    let pmrem = null;

    try {
        pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();

        const target = pmrem.fromEquirectangular(texture);
        texture.dispose();

        return target.texture;
    } catch (error) {
        console.warn('[assets] HDRI could not be prefiltered:', error);
        return null;
    } finally {
        if (pmrem) pmrem.dispose();
    }
}

async function loadZombie(spec) {
    if (!spec || !spec.file) return null;

    const loader = new GLTFLoader();

    const gltf = await withTimeout(loader.loadAsync(spec.file), LOAD_TIMEOUT_MS, null);
    if (!gltf || !gltf.scene) return null;

    return {
        scene: gltf.scene,
        animations: gltf.animations || [],
        clips: spec.clips || {},
        license: spec.license || null
    };
}

// Leaves: keep geometry, drop a copy at the right size with its base on y = 0.
function normalizeTree(scene, targetHeight = 7) {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    const height = size.y > 0.0001 ? size.y : 1;
    const scale = targetHeight / height;

    const wrapper = new THREE.Group();
    wrapper.add(scene);

    scene.position.set(
        -(box.min.x + box.max.x) * 0.5,
        -box.min.y,
        -(box.min.z + box.max.z) * 0.5
    );
    scene.scale.setScalar(1);

    wrapper.scale.setScalar(scale);

    scene.traverse((part) => {
        if (part.isMesh) {
            part.castShadow = true;
            part.receiveShadow = true;

            // The source pine ships Phong-ish materials (metalness 0.4,
            // roughness 0.27) which read as glossy green plastic under
            // the HDRI. Force them matte and dark: at night the pines
            // must be silhouettes.
            const materials = Array.isArray(part.material) ? part.material : [part.material];

            for (const material of materials) {
                if (!material) continue;

                const isWood = /wood|bark|trunk/i.test(material.name || '');
                const isLeaf = /green|leaf|leaves|foliage|needle/i.test(material.name || '') || !isWood;

                material.metalness = 0;
                material.roughness = isLeaf ? 0.95 : 0.9;
                material.envMapIntensity = 0.06;
                if ('clearcoat' in material) material.clearcoat = 0;
                if ('sheen' in material) material.sheen = 0;

                // The Quaternius pine ships untextured Phong-ish mats, so
                // they get a flat night-green/brown. Photogrammetry scans
                // (Poly Haven trunk/stump) keep their own albedo maps.
                if (!material.map && material.color) {
                    if (isLeaf) {
                        // #1f3a28, desaturated: green without the neon.
                        material.color.setHex(0x1f3a28);
                    } else {
                        material.color.setHex(0x3a2c1e);
                    }
                }

                material.needsUpdate = true;
            }
        }
    });

    return wrapper;
}

    async function loadTrees(list) {
    if (!Array.isArray(list) || list.length === 0) return [];

    const loader = new GLTFLoader();
    const templates = [];

    for (const entry of list) {
        const file = typeof entry === 'string' ? entry : entry && entry.file;
        if (!file) continue;

        // The pines normalise to 7 m; a fallen trunk or a stump must
        // stay at real-world size, so the manifest may carry a
        // per-entry targetHeight (default 7).
        const targetHeight = entry && Number.isFinite(entry.targetHeight)
            ? entry.targetHeight
            : 7;

        const gltf = await withTimeout(loader.loadAsync(file), LOAD_TIMEOUT_MS, null);
        if (!gltf || !gltf.scene) continue;

        try {
            templates.push(normalizeTree(gltf.scene, targetHeight));
        } catch (error) {
            console.warn('[assets] tree could not be normalised:', error);
        }
    }

    return templates;
}

async function readManifest() {
    try {
        const response = await Promise.race([
            fetch(MANIFEST_URL, { cache: 'no-cache' }),
            new Promise((resolve) => {
                window.setTimeout(() => resolve(null), 6000);
            })
        ]);

        if (!response || !response.ok) {
            console.info('[assets] no manifest, using procedural materials');
            return null;
        }

        return await response.json();
    } catch (error) {
        console.info('[assets] manifest unreachable, using procedural materials');
        return null;
    }
}

/**
 * Load every asset the manifest lists. Resolves with a bundle where
 * any entry is null when its asset is absent, broken or not listed.
 */
export async function loadAssets(renderer) {
    const manifest = await readManifest();

    const bundle = {
        manifest,
        environment: null,
        pbr: { ground: null, bark: null, rock: null },
        zombie: null,
        trees: []
    };

    if (!manifest) return bundle;

    const [environment, ground, bark, rock, zombie, trees] = await Promise.all([
        withTimeout(loadEnvironment(manifest.hdri && manifest.hdri.file, renderer), LOAD_TIMEOUT_MS, null),
        loadPbrSet(manifest.pbr && manifest.pbr.ground, renderer),
        loadPbrSet(manifest.pbr && manifest.pbr.bark, renderer),
        loadPbrSet(manifest.pbr && manifest.pbr.rock, renderer),
        withTimeout(loadZombie(manifest.zombie), LOAD_TIMEOUT_MS, null),
        withTimeout(loadTrees(manifest.trees), LOAD_TIMEOUT_MS, [])
    ]);

    bundle.environment = environment;
    bundle.pbr = { ground, bark, rock };
    bundle.zombie = zombie;
    bundle.trees = Array.isArray(trees) ? trees : [];

    return bundle;
}
