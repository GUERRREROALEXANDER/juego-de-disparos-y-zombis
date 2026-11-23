// ==========================================================
// WORLD MATERIALS
//
// One place where the procedural look meets the real assets.
// Each slot (ground, bark, rock, foliage, bush) drops back to
// the procedural canvas textures whenever the manifest key is
// null, so the scene looks the same before and after the asset
// lane ships something.
// ==========================================================

import * as THREE from 'three';
import { groundTexture, groundRoughnessTexture } from '../visuals.js';
import { patchMaterial } from './shaders.js';

let cached = null;

function pbrOrProcedural(set, fallback) {
    if (!set) return fallback();

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: set.map || null,
        normalMap: set.normalMap || null,
        roughnessMap: set.roughnessMap || null,
        aoMap: set.aoMap || null,
        roughness: 1,
        metalness: 0.02
    });

    // Night rule: the HDRI is a rim light, not a studio softbox.
    material.envMapIntensity = 0.12;

    if (set.normalMap) {
        material.normalScale.set(0.85, 0.85);
    }

    if (set.aoMap) material.aoMapIntensity = 0.75;

    return material;
}

export function getMaterials(bundle) {
    if (cached) return cached;

    const pbr = (bundle && bundle.pbr) || {};

    // ---- ground: PBR set, wet patches, mist added later ----
    const ground = pbrOrProcedural(pbr.ground, () => new THREE.MeshStandardMaterial({
        color: 0x8f9884,
        map: groundTexture(),
        roughnessMap: groundRoughnessTexture(),
        roughness: 0.95,
        metalness: 0.02,
        envMapIntensity: 0.14
    }));

    // La textura PBR del suelo es de dia: se atenua para que la luna
    // no convierta el claro del bosque en un prado iluminado.
    if (pbr.ground) ground.color.setHex(0xb0b4a7);

    patchMaterial(ground, { wet: true });

    // ---- bark: matte, the moss reads by silhouette, not by gloss ----
    const bark = pbrOrProcedural(pbr.bark, () => new THREE.MeshStandardMaterial({
        color: 0x2e2a23,
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.1
    }));

    // ---- rock ----
    const rock = pbrOrProcedural(pbr.rock, () => new THREE.MeshStandardMaterial({
        color: 0x2b2d2c,
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.12
    }));

    // ---- foliage: dark, desaturated, fully matte. No clearcoat, no
    // specular sheen: at night the pines are silhouettes plus the
    // moon rim and the flashlight cone.
    const foliage = new THREE.MeshStandardMaterial({
        name: 'pine-foliage',
        color: 0x1f3a28,
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.08,
        emissive: 0x000000
    });
    patchMaterial(foliage, { wind: { strength: 0.1, low: 1.2, high: 6.4 } });

    // ---- bushes: same idea, small geometry, so the mask is local ----
    const bush = new THREE.MeshStandardMaterial({
        name: 'bush-foliage',
        color: 0x1b3325,
        roughness: 0.98,
        metalness: 0,
        envMapIntensity: 0.08
    });
    patchMaterial(bush, { wind: { strength: 0.13, low: -0.5, high: 0.7 } });

    cached = { ground, bark, rock, foliage, bush };
    return cached;
}

/**
 * Ground plane (200 x 200) with the manifest textures, uv1 wired for
 * the AO map when one exists. Returns the mesh, already rotated flat.
 */
export function createGroundMesh(bundle, { y = 0, size = 200 } = {}) {
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = getMaterials(bundle).ground;

    if (material.aoMap && geometry.attributes.uv && !geometry.attributes.uv1) {
        geometry.setAttribute('uv1', geometry.attributes.uv);
    }

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = y;
    ground.receiveShadow = true;

    return ground;
}
