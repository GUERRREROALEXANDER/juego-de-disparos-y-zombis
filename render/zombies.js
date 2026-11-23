// ==========================================================
// ZOMBIES
//
// When the manifest ships a rigged GLB, every zombie is a
// SkeletonUtils clone with its own AnimationMixer, its own
// material instances (so skins can be tinted) and an invisible
// head hitbox so the existing headshot raycast keeps working.
//
// With no GLB in the manifest, the procedural body from
// visuals.js is used unchanged.
// ==========================================================

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { decorateZombie, disposeEnemy } from '../visuals.js';

const TARGET_HEIGHT = 1.85;

const SKIN_TINT = {
    classic: 0x8b9a72,
    military: 0x6f7a5c,
    infected: 0xa9b48e,
    survivor: 0x9b755a
};

let template = null;

function findClip(animations, patterns) {
    // Patterns are in priority order: prefer /walk/ over /run/ even if
    // the exporter listed the run clip first.
    for (const pattern of patterns) {
        for (const clip of animations) {
            if (pattern.test(clip.name || '')) return clip;
        }
    }
    return null;
}

export function prepareZombieTemplate(asset) {
    if (!asset || !asset.scene) {
        template = null;
        return null;
    }

    const scene = asset.scene;
    const animations = asset.animations || [];

    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    const height = size.y > 0.0001 ? size.y : TARGET_HEIGHT;
    const scale = TARGET_HEIGHT / height;

    scene.traverse((part) => {
        if (!part.isMesh) return;
        part.castShadow = true;
        part.receiveShadow = true;
        // Skinned bounds are computed from the bind pose and would cull
        // an arm that swings out of them; a handful of zombies is cheap.
        part.frustumCulled = false;
    });

    const named = asset.clips || {};
    const byName = (name) => animations.find((clip) => clip.name === name) || null;

    const walk = (named.walk && byName(named.walk)) ||
        findClip(animations, [/walk/i, /run/i, /move/i]);
    const attack = (named.attack && byName(named.attack)) ||
        findClip(animations, [/attack/i, /punch/i, /bite/i, /hit/i]);
    const death = (named.death && byName(named.death)) ||
        findClip(animations, [/death/i, /die/i, /fall/i]);
    const idle = (named.idle && byName(named.idle)) ||
        findClip(animations, [/idle/i, /breath/i, /stand/i]);

    template = {
        scene,
        scale,
        baseY: -box.min.y * scale,
        clips: { walk, attack, death, idle }
    };

    return template;
}

function tintMaterials(root, skinId) {
    const tint = new THREE.Color(SKIN_TINT[skinId] || SKIN_TINT.classic);
    const materials = new Set();

    root.traverse((part) => {
        if (!part.isMesh || !part.material) return;

        const list = Array.isArray(part.material) ? part.material : [part.material];
        const owned = list.map((material) => {
            if (!material) return material;
            if (materials.has(material)) return material;

            const copy = material.clone();
            copy.userData.__zombieMaterial = true;

            if (copy.color) copy.color.lerp(tint, 0.22);

            if (skinId === 'infected' && copy.emissive) {
                copy.emissive.setHex(0x1a0505);
                copy.emissiveIntensity = 0.28;
            }

            copy.envMapIntensity = 0.65;
            materials.add(copy);
            return copy;
        });

        part.material = Array.isArray(part.material) ? owned : owned[0];
    });
}

function createFromTemplate({ skinId, stats }) {
    const root = cloneSkinned(template.scene);
    root.scale.setScalar(template.scale);
    root.position.y = template.baseY;

    // Las cotas de las mallas animadas pueden quedarse en la pose inicial.
    // Así no desaparecen al moverse las extremidades o cruzar el encuadre.
    root.traverse((part) => {
        if (part.isSkinnedMesh) part.frustumCulled = false;
    });
    tintMaterials(root, skinId);

    const group = new THREE.Group();
    group.add(root);

    // Invisible head hitbox: the raycast checks userData.headshot, and
    // a material with visible = false renders nothing but still casts.
    const headbox = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    headbox.position.set(0, 1.63, 0);
    headbox.userData.headshot = true;
    headbox.userData.__zombieHitbox = true;
    group.add(headbox);

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};

    for (const key of ['walk', 'attack', 'death', 'idle']) {
        const clip = template.clips[key];
        if (!clip) continue;
        actions[key] = mixer.clipAction(clip);
    }

    if (actions.attack) {
        actions.attack.setLoop(THREE.LoopRepeat, Infinity);
    }

    const first = actions.walk || actions.idle || actions.attack;
    let currentAction = null;

    if (first) {
        first.reset();
        first.setEffectiveWeight(1);
        first.play();
        currentAction = first === actions.walk ? 'walk' : first === actions.idle ? 'idle' : 'attack';
    }

    return {
        group,
        limbs: { legs: [], arms: [] },
        mixer,
        actions,
        currentAction,
        isSkinned: true,
        eyeColor: stats.color
    };
}

function createProcedural({ skinId, stats, eyeColor }) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: stats.color, roughness: 1 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x89956b, roughness: 1 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.9, 0.38), bodyMat);
    body.position.y = 1;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), headMat);
    head.position.y = 1.7;
    head.scale.set(0.88, 1.16, 0.9);
    head.userData.headshot = true;
    group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });

    for (const eyeX of [-0.08, 0.08]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(eyeX, 1.73, 0.205);
        group.add(eye);
    }

    const limbs = decorateZombie(group, headMat, bodyMat, skinId);

    return {
        group,
        limbs,
        mixer: null,
        actions: {},
        currentAction: null,
        isSkinned: false,
        eyeColor
    };
}

export function createZombieVisual({ stats, skinId = 'classic', eyeColor = 0xe55b43 }) {
    if (template) {
        try {
            return createFromTemplate({ skinId, stats });
        } catch (error) {
            console.warn('[zombies] GLB clone failed, using procedural body:', error);
        }
    }

    return createProcedural({ skinId, stats, eyeColor });
}

function fadeTo(zombie, key, fade = 0.22) {
    const next = zombie.actions && zombie.actions[key];
    if (!next || zombie.currentAction === key) return;

    const previous = zombie.actions[zombie.currentAction];

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();

    if (previous && previous !== next) {
        previous.crossFadeTo(next, fade, false);
    }

    zombie.currentAction = key;
}

/**
 * Drive one zombie for a frame: skeleton state when the GLB is in
 * play, the old sinusoidal limbs when it is not.
 */
export function updateZombieVisual(zombie, delta, { walking, attacking, speed }) {
    if (zombie.mixer) {
        let state;

        if (attacking && zombie.actions.attack) state = 'attack';
        else if (walking && zombie.actions.walk) state = 'walk';
        else if (zombie.actions.idle) state = 'idle';
        else state = zombie.currentAction || 'walk';

        fadeTo(zombie, state);

        if (zombie.actions.walk) {
            zombie.actions.walk.timeScale = THREE.MathUtils.clamp((speed || 2) / 2.2, 0.55, 2.2);
        }

        zombie.mixer.update(delta);
        return;
    }

    const limbs = zombie.limbs;
    if (!limbs) return;

    if (limbs.legs) {
        limbs.legs.forEach((leg, i) => {
            const step = Math.sin(zombie.phase + i * Math.PI);
            leg.rotation.x = walking ? step * 0.48 : 0.04;
        });
    }

    if (limbs.arms) {
        limbs.arms.forEach((arm, i) => {
            const swing = Math.sin(zombie.phase + i * Math.PI) * 0.14;
            arm.rotation.x = attacking ? -0.5 + swing * 0.3 : swing;
        });
    }
}

/**
 * Start the death clip. Returns false when there is nothing to play
 * (no mixer, no clip), so the caller can remove the mesh right away.
 */
export function playZombieDeath(zombie) {
    if (!zombie.mixer || !zombie.actions || !zombie.actions.death) return false;

    const death = zombie.actions.death;

    for (const key of Object.keys(zombie.actions)) {
        if (key === 'death') continue;
        const action = zombie.actions[key];
        if (action.isRunning()) action.fadeOut(0.18);
    }

    death.reset();
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.setEffectiveWeight(1);
    death.fadeIn(0.12);
    death.play();

    zombie.currentAction = 'death';
    return true;
}

/**
 * Fade out whatever the zombie is doing, so the body can fall
 * without the walk cycle fighting the death pose.
 */
export function fadeZombieActions(zombie, duration = 0.22) {
    if (!zombie || !zombie.actions) return;

    for (const key of Object.keys(zombie.actions)) {
        const action = zombie.actions[key];
        if (action && action.isRunning()) action.fadeOut(duration);
    }

    zombie.currentAction = null;
}

/**
 * Fade a corpse out on the way into the ground. The invisible head
 * hitbox is skipped so a dead body never stops blocking a shot.
 */
export function setZombieFade(zombie, opacity) {
    if (!zombie || !zombie.mesh) return;

    // Los materiales de un cadáver no cambian mientras se hunde.
    // Guardarlos evita recorrer todo el esqueleto en cada fotograma.
    if (!zombie.fadeMaterials) {
        const materials = new Set();
        zombie.mesh.traverse((part) => {
            if (!part.isMesh || !part.material) return;
            const list = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of list) {
                if (material) materials.add(material);
            }
        });
        zombie.fadeMaterials = [...materials];
    }

    const value = Math.max(0, Math.min(1, opacity));

    for (const material of zombie.fadeMaterials) {
        if (material.visible === false) continue;

        if (!material.userData.__deathFade) {
            material.userData.__deathFade = true;
            material.transparent = true;
            material.depthWrite = false;
            material.needsUpdate = true;
        }

        material.opacity = value;
    }
}

/**
 * Free a zombie. Cloned materials belong to the instance; geometry
 * stays shared between clones and must not be disposed.
 */
export function disposeZombieVisual(zombie) {
    if (!zombie) return;
    zombie.fadeMaterials = null;

    if (zombie.mixer) {
        zombie.mixer.stopAllAction();
        zombie.mixer.uncacheRoot(zombie.mesh);
    }

    if (!zombie.isSkinned) {
        disposeEnemy(zombie.mesh);
        return;
    }

    const materials = new Set();

    zombie.mesh.traverse((part) => {
        if (!part.isMesh || !part.material) return;
        const list = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of list) {
            if (material && material.userData && material.userData.__zombieMaterial) {
                materials.add(material);
            }
        }
    });

    materials.forEach((material) => material.dispose());
}

export function hasZombieTemplate() {
    return Boolean(template);
}
