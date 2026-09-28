import * as THREE from 'three';

export function makeWeapon(camera) {
    const gun = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x283036, metalness: 0.8, roughness: 0.32 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x171c1b, roughness: 0.86 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7961, roughness: 0.9 });
    function box(w, h, d, x, y, z, mat = metal) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z); gun.add(mesh); return mesh;
    }
    box(0.12, 0.14, 0.48, 0, 0, 0);
    box(0.105, 0.12, 0.32, 0, -0.01, -0.36, grip);
    box(0.08, 0.22, 0.12, 0, -0.15, 0.02, grip).rotation.x = -0.2;
    box(0.085, 0.24, 0.14, 0, -0.18, -0.15, metal).rotation.x = 0.18;
    box(0.11, 0.14, 0.26, 0, -0.02, 0.3, grip);
    for (let i = 0; i < 8; i++) box(0.135, 0.012, 0.018, 0, 0.08, 0.15 - i * 0.052);
    box(0.02, 0.08, 0.03, 0, 0.1, -0.43);
    box(0.10, 0.06, 0.025, 0, 0.105, 0.1);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.27, 12), metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.64; gun.add(barrel);
    box(0.12, 0.11, 0.18, 0.015, -0.14, 0.09, skin);
    box(0.12, 0.12, 0.20, -0.06, -0.11, -0.35, skin).rotation.z = -0.4;
    box(0.14, 0.15, 0.38, 0.04, -0.22, 0.32, grip).rotation.x = -0.3;
    box(0.14, 0.15, 0.4, -0.17, -0.23, -0.1, grip).rotation.z = -0.5;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdb83 }));
    flash.position.z = -0.8; flash.scale.set(1, 1, 2.8); flash.visible = false; gun.add(flash);
    const light = new THREE.PointLight(0xffc16b, 0, 7); light.position.z = -0.8; gun.add(light);
    gun.position.set(0.25, -0.27, -0.52); camera.add(gun);
    return { gun, flash, light };
}

export function groundTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#414638'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14000; i++) {
        const shade = 35 + Math.random() * 60;
        ctx.fillStyle = `rgba(${shade + 12},${shade + 10},${shade},${0.15 + Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(65, 65); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export function decorateZombie(group, skin, clothes) {
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.16, 0.7, 0);
        const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.43, 4, 8), clothes);
        limb.position.y = -0.25; leg.add(limb);
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.33), new THREE.MeshStandardMaterial({ color: 0x202523 }));
        boot.position.set(0, -0.61, 0.06); leg.add(boot); group.add(leg); legs.push(leg);
        const arm = new THREE.Group(); arm.position.set(side * 0.33, 1.3, 0);
        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), clothes);
        sleeve.position.set(0, -0.2, 0.12); sleeve.rotation.x = -0.6; arm.add(sleeve);
        const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), skin);
        hand.position.set(0, -0.34, 0.34); hand.rotation.x = -1.1; arm.add(hand); group.add(arm); arms.push(arm);
    }
    const wound = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.015), new THREE.MeshStandardMaterial({ color: 0x512e2b, roughness: 1 }));
    wound.position.set(-0.13, 1.12, 0.2); wound.rotation.z = -0.3; group.add(wound);
    group.traverse(part => { if (part.isMesh) part.castShadow = true; });
    return { legs, arms };
}

export function disposeEnemy(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(part => { if (part.isMesh) { geometries.add(part.geometry); materials.add(part.material); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
