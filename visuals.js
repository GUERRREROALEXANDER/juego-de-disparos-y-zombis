import * as THREE from 'three';

export function makeWeapon(camera, weaponType = 'pistol') {

    const gun = new THREE.Group();

    const metal = new THREE.MeshStandardMaterial({
        color: 0x283036,
        metalness: 0.8,
        roughness: 0.32
    });

    const grip = new THREE.MeshStandardMaterial({
        color: 0x171c1b,
        roughness: 0.86
    });

    const skin = new THREE.MeshStandardMaterial({
        color: 0x9a7961,
        roughness: 0.9
    });

    function box(w, h, d, x, y, z, mat = metal) {

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            mat
        );

        mesh.position.set(x, y, z);

        gun.add(mesh);

        return mesh;
    }

    let muzzleZ = -0.8;

    // ==================================
    // PISTOLA
    // ==================================

    if (weaponType === 'pistol') {

        box(0.12, 0.14, 0.48, 0, 0, 0);

        box(0.105, 0.12, 0.32, 0, -0.01, -0.36, grip);

        box(0.08, 0.22, 0.12, 0, -0.15, 0.02, grip);

        box(0.085, 0.24, 0.14, 0, -0.18, -0.15);

        box(0.11, 0.14, 0.26, 0, -0.02, 0.3, grip);

        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.27, 12),
            metal
        );

        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.64;

        gun.add(barrel);

        muzzleZ = -0.8;
    }

    // ==================================
    // ESCOPETA
    // ==================================

    else if (weaponType === 'shotgun') {

        // Cuerpo
        box(0.15, 0.16, 0.52, 0, 0, -0.05);

        // Culata
        box(0.14, 0.18, 0.4, 0, -0.02, 0.4, grip);

        // Guardamanos
        box(0.17, 0.14, 0.32, 0, -0.02, -0.38, grip);

        // Cañón
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.027, 0.027, 0.82, 10),
            metal
        );

        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.04, -0.57);

        gun.add(barrel);

        // Tubo inferior
        const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.019, 0.019, 0.72, 10),
            grip
        );

        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, -0.09, -0.53);

        gun.add(tube);

        box(0.1, 0.23, 0.13, 0, -0.17, 0.12, grip);

        muzzleZ = -1.0;
    }

    // ==================================
    // RIFLE DE ASALTO
    // ==================================

    else if (weaponType === 'rifle') {

        // Cuerpo principal
        box(0.15, 0.17, 0.48, 0, 0, -0.05);

        // Culata
        box(0.13, 0.18, 0.35, 0, -0.01, 0.39, grip);

        // Guardamanos
        box(0.16, 0.16, 0.42, 0, 0, -0.46, grip);

        // Cañón largo
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.023, 0.023, 0.92, 10),
            metal
        );

        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.045, -0.79);

        gun.add(barrel);

        // Cargador
        box(0.11, 0.28, 0.17, 0, -0.2, -0.02, grip);

        // Mira superior
        box(0.12, 0.08, 0.17, 0, 0.15, -0.15);

        // Empuñadura
        box(0.09, 0.22, 0.13, 0, -0.18, 0.13, grip);

        // Detalle lateral
        box(0.025, 0.06, 0.25, 0.085, 0.05, -0.34);

        muzzleZ = -1.27;
    }

    // Manos
    box(0.12, 0.11, 0.18, 0.015, -0.14, 0.09, skin);

    box(0.12, 0.12, 0.20, -0.06, -0.11, -0.35, skin);

    // Destello del disparo
    const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 8, 6),
        new THREE.MeshBasicMaterial({
            color: 0xffdb83
        })
    );

    flash.position.z = muzzleZ;
    flash.scale.set(1, 1, 2.8);
    flash.visible = false;

    gun.add(flash);

    // Luz del disparo
    const light = new THREE.PointLight(
        0xffc16b,
        0,
        7
    );

    light.position.z = muzzleZ;

    gun.add(light);

    gun.position.set(0.25, -0.27, -0.52);

    camera.add(gun);

    return {
        gun,
        flash,
        light
    };
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


export function decorateZombie(group, skin, clothes, skinId = 'classic') {

    // Colores de cada apariencia
    const palettes = {
        classic: {
            skin: 0x89956b,
            clothes: 0x4b5543
        },

        military: {
            skin: 0x78805e,
            clothes: 0x35452f
        },

        infected: {
            skin: 0xb7c3a1,
            clothes: 0x3c3435
        },

        survivor: {
            skin: 0x9b755a,
            clothes: 0x62504a
        }
    };

    const palette = palettes[skinId] || palettes.classic;

    skin.color.setHex(palette.skin);
    clothes.color.setHex(palette.clothes);

    const legs = [];
    const arms = [];

    // Crear piernas y brazos
    for (const side of [-1, 1]) {

        const leg = new THREE.Group();
        leg.position.set(side * 0.16, 0.7, 0);

        const limb = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.105, 0.43, 4, 8),
            clothes
        );

        limb.position.y = -0.25;
        leg.add(limb);

        const boot = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.15, 0.33),
            new THREE.MeshStandardMaterial({ color: 0x202523 })
        );

        boot.position.set(0, -0.61, 0.06);

        leg.add(boot);
        group.add(leg);

        legs.push(leg);

        const arm = new THREE.Group();
        arm.position.set(side * 0.33, 1.3, 0);

        const sleeve = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.09, 0.34, 4, 8),
            clothes
        );

        sleeve.position.set(0, -0.2, 0.12);
        sleeve.rotation.x = -0.6;

        arm.add(sleeve);

        const hand = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.065, 0.2, 4, 8),
            skin
        );

        hand.position.set(0, -0.34, 0.34);
        hand.rotation.x = -1.1;

        arm.add(hand);
        group.add(arm);

        arms.push(arm);
    }

    // Función para agregar accesorios
    function addAccessory(geometry, material, x, y, z) {

        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, y, z);
        mesh.castShadow = true;

        group.add(mesh);

        return mesh;
    }

    // SKIN MILITAR
    if (skinId === 'military') {

        const helmetMat = new THREE.MeshStandardMaterial({
            color: 0x34452b,
            roughness: 0.85
        });

        const vestMat = new THREE.MeshStandardMaterial({
            color: 0x263322,
            roughness: 1
        });

        const helmet = addAccessory(
            new THREE.SphereGeometry(0.25, 12, 8),
            helmetMat,
            0, 1.9, 0
        );

        helmet.scale.set(1.15, 0.55, 1.05);

        addAccessory(
            new THREE.BoxGeometry(0.52, 0.05, 0.36),
            helmetMat,
            0, 1.82, 0.02
        );

        addAccessory(
            new THREE.BoxGeometry(0.64, 0.55, 0.42),
            vestMat,
            0, 1.05, 0
        );

        // Bolsillos del chaleco
        addAccessory(
            new THREE.BoxGeometry(0.17, 0.17, 0.04),
            helmetMat,
            -0.17, 1.05, 0.23
        );

        addAccessory(
            new THREE.BoxGeometry(0.17, 0.17, 0.04),
            helmetMat,
            0.17, 1.05, 0.23
        );
    }

   // SKIN INFECTADO
if (skinId === 'infected') {

    const infectedMat = new THREE.MeshStandardMaterial({
        color: 0x651c26,
        emissive: 0x390510,
        emissiveIntensity: 0.45,
        roughness: 0.9
    });

    // Tumores y heridas
    const growth1 = addAccessory(
        new THREE.SphereGeometry(0.13, 10, 8),
        infectedMat,
        0.17, 1.1, 0.20
    );

    growth1.scale.set(1.2, 1.1, 0.7);

    addAccessory(
        new THREE.SphereGeometry(0.09, 10, 8),
        infectedMat,
        -0.18, 0.85, 0.20
    );

    addAccessory(
        new THREE.SphereGeometry(0.075, 10, 8),
        infectedMat,
        0.10, 1.84, 0.18
    );

    // Venas rojizas
    const veinMat = new THREE.MeshStandardMaterial({
        color: 0x861c25,
        roughness: 1
    });

    const vein1 = addAccessory(
        new THREE.BoxGeometry(0.04, 0.4, 0.035),
        veinMat,
        -0.12, 1.15, 0.22
    );

    vein1.rotation.z = 0.25;

    const vein2 = addAccessory(
        new THREE.BoxGeometry(0.035, 0.3, 0.035),
        veinMat,
        0.19, 0.95, 0.22
    );

    vein2.rotation.z = -0.3;
}

    // SKIN SUPERVIVIENTE
    if (skinId === 'survivor') {

        const backpackMat = new THREE.MeshStandardMaterial({
            color: 0x30291f,
            roughness: 1
        });

        addAccessory(
            new THREE.BoxGeometry(0.34, 0.5, 0.22),
            backpackMat,
            0, 1.05, -0.29
        );

        const strapMat = new THREE.MeshStandardMaterial({
            color: 0x171b18
        });

        addAccessory(
            new THREE.BoxGeometry(0.06, 0.45, 0.05),
            strapMat,
            -0.16, 1.05, 0.21
        );

        addAccessory(
            new THREE.BoxGeometry(0.06, 0.45, 0.05),
            strapMat,
            0.16, 1.05, 0.21
        );
    }

   // Heridas de los zombis clásicos e infectados
if (
    skinId === 'classic' ||
    skinId === 'infected'
) {

    const wound = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.3, 0.015),

        new THREE.MeshStandardMaterial({
            color: 0x512e2b,
            roughness: 1
        })
    );

    wound.position.set(-0.13, 1.12, 0.2);
    wound.rotation.z = -0.3;

    group.add(wound);
}

   
    group.traverse(part => {

        if (part.isMesh) {
            part.castShadow = true;
        }

    });

    return { legs, arms };
}

export function disposeEnemy(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(part => { if (part.isMesh) { geometries.add(part.geometry); materials.add(part.material); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
