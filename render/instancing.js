// ==========================================================
// WORLD INSTANCING
//
// The forest used to be ~480 separate meshes (one tree group per
// pine, one mesh per bush and rock). Each of those is a draw call
// in the main pass, in the moon shadow pass and in the GTAO depth
// pass, which is what dragged the frame budget down.
//
// Here the same props are collapsed into one InstancedMesh per
// (geometry, material). Placement is baked into the instance
// matrix, so the meshes live at the world origin and never need
// their matrices touched again.
// ==========================================================

import * as THREE from 'three';

// A placement is { x, y, z, rotationY, scale } (scale may be a Vector3).
export function placementMatrix({ x = 0, y = 0, z = 0, rotationY = 0, scale = 1 }, target = new THREE.Matrix4()) {
    const position = new THREE.Vector3(x, y, z);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
    const vector = typeof scale === 'number'
        ? new THREE.Vector3(scale, scale, scale)
        : scale;

    return target.compose(position, quaternion, vector);
}

/**
 * Turn a template hierarchy (a GLB wrapper, a procedural tree group)
 * into InstancedMeshes: one per mesh found under `root`, each one
 * holding every placement.
 *
 * Every mesh keeps a copy of its local matrix relative to `root`
 * (that is how the GLB wrapper's normalisation scale survives), so
 * `placements` are plain world transforms.
 */
export function instanceFromObject(root, placements, {
    name = 'instanced-prop',
    castShadow = true,
    receiveShadow = true,
    castShadowFilter = null
} = {}) {
    if (!root || placements.length === 0) return [];

    root.updateMatrixWorld(true);

    // Relative to root's PARENT, so root's own transform (the GLB wrapper's
    // normalisation scale and ground offset) stays in every instance.
    const inverseRoot = root.parent
        ? new THREE.Matrix4().copy(root.parent.matrixWorld).invert()
        : new THREE.Matrix4();

    // Meshes that share a geometry and a material (the three foliage
    // tiers of the procedural pine) collapse into one batch: the
    // locals of every duplicate become extra instances.
    const groups = new Map();

    root.traverse((part) => {
        if (!part.isMesh || !part.geometry) return;

        const key = `${part.geometry.uuid}|${part.material && part.material.uuid ? part.material.uuid : 'none'}`;
        let group = groups.get(key);

        if (!group) {
            group = {
                geometry: part.geometry,
                material: part.material,
                locals: [],
                castShadow: castShadowFilter ? castShadowFilter(part) : castShadow
            };
            groups.set(key, group);
        }

        group.locals.push(new THREE.Matrix4().multiplyMatrices(inverseRoot, part.matrixWorld));
    });

    const meshes = [];
    const world = new THREE.Matrix4();
    const placement = new THREE.Matrix4();

    for (const part of groups.values()) {
        const count = placements.length * part.locals.length;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        const label = part.material && part.material.name ? part.material.name : String(meshes.length);
        mesh.name = `${name}:${label}`;

        let index = 0;
        for (const local of part.locals) {
            for (let i = 0; i < placements.length; i++) {
                placementMatrix(placements[i], placement);
                world.multiplyMatrices(placement, local);
                mesh.setMatrixAt(index++, world);
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.computeBoundingSphere();
        mesh.userData.instanced = true;

        meshes.push(mesh);
    }

    return meshes;
}


