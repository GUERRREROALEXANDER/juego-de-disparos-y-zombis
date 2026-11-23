// ==========================================================
// LIGHTING
//
// Night rig: cool hemisphere fill, a single shadow-casting moon
// whose frustum follows the player, a warm rim to separate the
// silhouettes, and the flashlight as a soft-shadow spotlight on
// the camera. The muzzle light lives with the weapon (visuals.js)
// because it has to sit at the barrel.
// ==========================================================

import * as THREE from 'three';

const MOON_OFFSET = new THREE.Vector3(26, 38, 18);

export function setupLighting(scene, camera) {
    // Fill: cold and low, the night is never flat blue. Kept dim so
    // the treeline stays a silhouette and the flashlight does the work.
    const hemisphere = new THREE.HemisphereLight(0x2a3a4a, 0x0a0d0b, 0.42);
    scene.add(hemisphere);

    // Moon: the one directional light, shadow frustum tight around play.
    // 1024 instead of 2048: the props are instanced now, but the cheap
    // map keeps the shadow pass inside the frame budget.
    const moon = new THREE.DirectionalLight(0x9db8d6, 1.9);
    moon.position.copy(MOON_OFFSET);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -30;
    moon.shadow.camera.right = 30;
    moon.shadow.camera.top = 30;
    moon.shadow.camera.bottom = -30;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 120;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.025;
    moon.shadow.radius = 2.5;
    scene.add(moon);
    scene.add(moon.target);

    // Warm rim, far away: keeps the tree line from dissolving into fog.
    const rimLight = new THREE.PointLight(0xffa267, 16, 55, 2);
    rimLight.position.set(-6, 7, -14);
    scene.add(rimLight);

    // Warm key above the viewmodel: reads the top of the slide and
    // the sights. Left fill catches the flank the player actually
    // sees. Both are short-range and die before touching the world.
    const weaponFill = new THREE.PointLight(0xffc79a, 1.7, 3.0, 2);
    weaponFill.position.set(-0.28, 0.42, -0.12);
    camera.add(weaponFill);

    // Cool rim from behind the viewmodel: keeps the slide and the
    // gloved hands from melting into one black shape.
    const weaponRim = new THREE.PointLight(0xa9c6e0, 1.9, 2.6, 2);
    weaponRim.position.set(0.42, 0.02, -0.18);
    camera.add(weaponRim);

    // Flashlight: soft shadow, wide penumbra, short throw.
    const flashlight = new THREE.SpotLight(
        0xdfe9cf,
        95,
        34,
        Math.PI / 7,
        0.62,
        2
    );
    flashlight.position.set(0.05, -0.02, 0.05);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.camera.near = 0.4;
    flashlight.shadow.camera.far = 42;
    flashlight.shadow.bias = -0.0012;
    flashlight.shadow.normalBias = 0.02;
    flashlight.shadow.radius = 6;
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashlight.target);

    scene.add(camera);

    let elapsed = 0;

    function update(delta) {
        elapsed += delta;

        // The shadow map only covers what is near the player, so the
        // light rig travels with them.
        moon.position.copy(camera.position).add(MOON_OFFSET);
        moon.target.position.copy(camera.position);
        moon.target.updateMatrixWorld();

        // A tired bulb: barely there, but enough to keep it from
        // reading as a static, dead spotlight.
        flashlight.intensity = 95 * (0.965 + Math.sin(elapsed * 13.7) * 0.012 + Math.sin(elapsed * 47.3) * 0.008);
    }

    return { hemisphere, moon, rimLight, weaponFill, weaponRim, flashlight, update };
}
