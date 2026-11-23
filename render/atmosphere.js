// ==========================================================
// ATMOSPHERE — height fog support, drifting fog cards and
// moonlight shaft cards.
//
// The shader-level ground mist lives in shaders.js (patched onto
// every lit material by applyAtmosphere); here it is thickened near
// the ground, and two billboard layers sell the depth the fog
// alone cannot give:
//
//   fog cards    soft sprites drifting slowly between the trees
//   light shafts faint slanted cards parallel to the moon rays
//
// Everything is additive-or-faint and dark: the night stays night.
// ==========================================================

import * as THREE from 'three';
import { setMist } from './shaders.js';

const FOG_CARD_COUNT = 12;
const SHAFT_COUNT = 7;
const AREA = 46;

function radialPuffTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;

    const ctx = canvas.getContext('2d');
    const half = size / 2;

    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.32)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function shaftTexture() {
    const width = 64;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
        // Brightest in the upper third, fading to the ground and
        // dissolving at the very top edge.
        const v = y / (height - 1);
        const vertical = Math.sin(Math.PI * Math.min(1, (1 - v) * 1.15)) ** 1.5;

        for (let x = 0; x < width; x++) {
            const u = x / (width - 1);
            const horizontal = Math.sin(Math.PI * u) ** 2;
            const alpha = Math.max(0, Math.min(1, vertical * horizontal));

            const i = (y * width + x) * 4;
            image.data[i] = 190;
            image.data[i + 1] = 210;
            image.data[i + 2] = 232;
            image.data[i + 3] = Math.round(alpha * 255);
        }
    }

    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function scatter(count, yMin, yMax, scaleMin, scaleMax) {
    const out = [];

    for (let i = 0; i < count; i++) {
        out.push({
            x: (Math.random() * 2 - 1) * AREA,
            y: yMin + Math.random() * (yMax - yMin),
            z: (Math.random() * 2 - 1) * AREA,
            scale: scaleMin + Math.random() * (scaleMax - scaleMin),
            phase: Math.random() * Math.PI * 2,
            drift: 0.15 + Math.random() * 0.35
        });
    }

    return out;
}

/**
 * Build the billboard layers and thicken the shader mist near the
 * ground. `moonDir` is the normalised direction from the scene
 * towards the moon (defaults to the lighting rig offset).
 */
export function setupAtmosphere(scene, { moonDir = null } = {}) {
    // Height fog that hugs the ground: dense below the knees,
    // gone above the canopy, reaching full strength with distance.
    setMist({ low: 0.0, high: 2.6, density: 0.9 });

    const direction = moonDir
        ? moonDir.clone().normalize()
        : new THREE.Vector3(26, 38, 18).normalize();

    const group = new THREE.Group();
    group.name = 'atmosphere';
    scene.add(group);

    // ---- drifting fog cards between the trees ----
    const puff = radialPuffTexture();
    const cards = scatter(FOG_CARD_COUNT, 0.5, 1.8, 7, 15).map((seed) => {
        const material = new THREE.SpriteMaterial({
            map: puff,
            color: 0x5a6d82,
            transparent: true,
            opacity: 0.05 + Math.random() * 0.05,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.set(seed.x, seed.y, seed.z);
        sprite.scale.set(seed.scale, seed.scale * 0.55, 1);
        sprite.renderOrder = 5;
        sprite.userData.seed = seed;
        sprite.userData.baseOpacity = material.opacity;
        group.add(sprite);

        return sprite;
    });

    // ---- moonlight shaft cards, slanted along the moon rays ----
    const shaftTex = shaftTexture();
    const tilt = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().negate()
    );

    const shafts = scatter(SHAFT_COUNT, 0, 0, 2.2, 4.2).map((seed) => {
        const height = 16 + Math.random() * 10;
        const geometry = new THREE.PlaneGeometry(seed.scale, height);

        const material = new THREE.MeshBasicMaterial({
            map: shaftTex,
            color: 0x8fa9c8,
            transparent: true,
            opacity: 0.05 + Math.random() * 0.04,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
        });

        const shaft = new THREE.Mesh(geometry, material);
        shaft.position.set(seed.x, height * 0.42, seed.z);
        shaft.quaternion.copy(tilt);
        // Fan the cards around the shaft axis so the grove reads
        // volumetrically instead of as one flat sheet.
        shaft.rotateY(Math.random() * Math.PI);
        shaft.renderOrder = 6;
        shaft.userData.seed = seed;
        shaft.userData.baseOpacity = material.opacity;
        group.add(shaft);

        return shaft;
    });

    let time = 0;

    function update(delta) {
        time += Math.min(delta, 0.1);

        for (const sprite of cards) {
            const seed = sprite.userData.seed;

            sprite.position.x += seed.drift * delta;
            sprite.position.z += Math.sin(time * 0.22 + seed.phase) * delta * 0.35;
            sprite.position.y = seed.y + Math.sin(time * 0.3 + seed.phase) * 0.18;

            if (sprite.position.x > AREA + 8) sprite.position.x = -AREA - 8;

            sprite.material.opacity = seed
                ? sprite.userData.baseOpacity * (0.8 + 0.2 * Math.sin(time * 0.4 + seed.phase))
                : sprite.userData.baseOpacity;
        }

        for (const shaft of shafts) {
            const seed = shaft.userData.seed;
            shaft.material.opacity = shaft.userData.baseOpacity *
                (0.85 + 0.15 * Math.sin(time * 0.25 + (seed ? seed.phase : 0)));
        }
    }

    return { group, cards, shafts, update };
}
