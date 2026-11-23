import * as THREE from 'three';

export function makeWeapon(camera, weaponType = 'pistol') {

    const gun = new THREE.Group();

    // ==================================
    // MATERIALES
    // ==================================

    // Ruido sutil de rugosidad: evita que el arma lea como plastico
    // pulido bajo la linterna. 128 px, coste despreciable.
    const metalNoise = (() => {

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#b4b4b4';
        ctx.fillRect(0, 0, 128, 128);

        for (let i = 0; i < 5200; i++) {
            const shade = 120 + Math.random() * 135;
            ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.25 + Math.random() * 0.5})`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        return texture;

    })();

    const metal = new THREE.MeshStandardMaterial({
        name: 'gunmetal',
        color: 0x42494f,
        metalness: 0.66,
        roughness: 0.46,
        roughnessMap: metalNoise,
        envMapIntensity: 1.35,
        emissive: 0x0c0e10,
        emissiveIntensity: 1
    });

    const steel = new THREE.MeshStandardMaterial({
        name: 'gunsteel',
        color: 0x646d75,
        metalness: 0.8,
        roughness: 0.28,
        roughnessMap: metalNoise,
        envMapIntensity: 1.4,
        emissive: 0x101214,
        emissiveIntensity: 1
    });

    // Polimero oscuro de la empunadura y el guardamanos.
    const polymer = new THREE.MeshStandardMaterial({
        name: 'polymer',
        color: 0x333c42,
        metalness: 0.05,
        roughness: 0.66,
        envMapIntensity: 0.5,
        emissive: 0x0a0c0d,
        emissiveIntensity: 1
    });

    // Guantes de trabajo, no manos desnudas.
    const glove = new THREE.MeshStandardMaterial({
        name: 'glove',
        color: 0x2c3439,
        metalness: 0.02,
        roughness: 0.85,
        envMapIntensity: 0.4,
        emissive: 0x070809,
        emissiveIntensity: 1
    });

    const glovePad = new THREE.MeshStandardMaterial({
        name: 'glove-pad',
        color: 0x3b4449,
        metalness: 0.04,
        roughness: 0.55,
        envMapIntensity: 0.5,
        emissive: 0x090b0c,
        emissiveIntensity: 1
    });

    // ==================================
    // GEOMETRIA
    // ==================================

    function roundedRect(w, h, r) {

        const x = -w / 2;
        const y = -h / 2;
        const radius = Math.min(r, Math.min(w, h) * 0.45);

        const shape = new THREE.Shape();

        shape.moveTo(x + radius, y);
        shape.lineTo(x + w - radius, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + radius);
        shape.lineTo(x + w, y + h - radius);
        shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        shape.lineTo(x + radius, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);

        return shape;

    }

    // Cuerpo extrusionado con bisel: todas las aristas del arma
    // recogen una luz, ninguna es un corte de caja perfecto.
    function extrusion(shape, depth, { bevel = 0.005, curveSteps = 8 } = {}) {

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            steps: 1,
            curveSegments: curveSteps,
            bevelEnabled: bevel > 0,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 2
        });

        geometry.translate(0, 0, -depth / 2);
        geometry.computeVertexNormals();

        return geometry;

    }

    function part(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        gun.add(mesh);
        return mesh;

    }

    function block(w, h, d, material, x, y, z, radius = 0.008, rx = 0, ry = 0, rz = 0) {

        return part(
            extrusion(roundedRect(w, h, radius), d),
            material, x, y, z, rx, ry, rz
        );

    }

    function tube(radiusTop, radiusBottom, length, material, x, y, z, segments = 14) {

        const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments);
        geometry.rotateX(Math.PI / 2);

        return part(geometry, material, x, y, z);

    }

    // Empunadura: perfil lateral extrusionado y girado para que el
    // grosor caiga en X. Angulo de agarre hacia atras.
    function grip(height, thickness, material, x, y, z, rake = 0.26) {

        const shape = new THREE.Shape();

        shape.moveTo(0.032, 0);
        shape.lineTo(0.052, 0);
        shape.lineTo(0.030, -height);
        shape.lineTo(-0.012, -height);
        shape.lineTo(-0.026, -height * 0.55);
        shape.lineTo(-0.028, 0);
        shape.closePath();

        const geometry = extrusion(shape, thickness, { bevel: 0.006 });
        geometry.rotateY(Math.PI / 2);

        return part(geometry, material, x, y, z, rake, 0, 0);

    }

    let muzzleZ = -0.8;

    // ==================================
    // PISTOLA
    // ==================================

    if (weaponType === 'pistol') {

        // Corredera con la boca biselada.
        block(0.075, 0.068, 0.44, metal, 0, 0.036, -0.05, 0.012);

        // Armazon / polimero.
        block(0.066, 0.05, 0.34, polymer, 0, -0.016, 0.0, 0.01);

        // Cubierta delantera con riel.
        block(0.058, 0.03, 0.2, metal, 0, -0.026, -0.2, 0.008);

        // Canona y corona de boca.
        tube(0.017, 0.017, 0.14, steel, 0, 0.032, -0.3);
        tube(0.021, 0.021, 0.016, steel, 0, 0.032, -0.37);

        // Empunadura de polimero y placa del cargador.
        grip(0.26, 0.07, polymer, 0, -0.03, 0.075);
        block(0.066, 0.012, 0.074, polymer, 0, -0.29, 0.1, 0.004);

        // Guardamonte: arco fino bajo el armazon.
        const guardGeometry = new THREE.TorusGeometry(0.052, 0.008, 6, 16, Math.PI * 1.15);
        part(guardGeometry, polymer, 0, -0.115, -0.055, 0, Math.PI / 2, Math.PI * 0.02);

        // Gatillo.
        block(0.014, 0.055, 0.016, steel, 0, -0.1, -0.04, 0.006, 0.18);

        // Mira trasera y punto delantero.
        block(0.05, 0.012, 0.02, steel, 0, 0.075, 0.11, 0.004);
        block(0.012, 0.016, 0.02, steel, 0.017, 0.079, 0.11, 0.003);
        block(0.012, 0.016, 0.02, steel, -0.017, 0.079, 0.11, 0.003);
        block(0.009, 0.014, 0.014, steel, 0, 0.075, -0.255, 0.003);

        // Estrias traseras de la corredera.
        for (let i = 0; i < 4; i++) {
            block(0.078, 0.03, 0.006, metal, 0, 0.036, 0.03 + i * 0.022, 0.001);
        }

        // Perno de desarme y boton del cargador.
        tube(0.008, 0.008, 0.082, steel, 0, -0.01, 0.02);
        block(0.014, 0.026, 0.02, steel, 0.038, -0.04, 0.06, 0.004);

        muzzleZ = -0.4;
    }

    // ==================================
    // ESCOPETA
    // ==================================

    else if (weaponType === 'shotgun') {

        // Cajon de mecanismos.
        block(0.082, 0.08, 0.38, metal, 0, 0, -0.02, 0.012);

        // Canona y tubo de carga.
        tube(0.021, 0.022, 0.86, steel, 0, 0.04, -0.46);
        tube(0.015, 0.016, 0.74, steel, 0, -0.055, -0.42);

        // Abrazadera del tubo.
        block(0.05, 0.032, 0.03, metal, 0, -0.01, -0.56, 0.006);

        // Guardamanos/bomba con costillas.
        block(0.084, 0.062, 0.26, polymer, 0, -0.03, -0.56, 0.014);

        for (let i = 0; i < 5; i++) {
            block(0.088, 0.05, 0.008, polymer, 0, -0.03, -0.46 - i * 0.04, 0.002);
        }

        // Culata con carrillera.
        block(0.078, 0.15, 0.34, polymer, 0, -0.03, 0.34, 0.02);

        // Empunadura de pistola.
        grip(0.24, 0.07, polymer, 0, -0.09, 0.16);

        // Punto de mira y cantonera.
        block(0.01, 0.014, 0.014, steel, 0, 0.065, -0.86, 0.003);
        block(0.08, 0.16, 0.02, polymer, 0, -0.02, 0.52, 0.012);

        // Gatillo y guardamonte.
        block(0.014, 0.05, 0.016, steel, 0, -0.075, 0.03, 0.006, 0.2);
        part(
            new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI * 1.1),
            polymer, 0, -0.088, 0.02, 0, Math.PI / 2, 0
        );

        // Ventana de expulsion.
        block(0.02, 0.03, 0.1, polymer, 0.042, 0.012, -0.06, 0.004);

        muzzleZ = -0.9;
    }

    // ==================================
    // RIFLE DE ASALTO
    // ==================================

    else if (weaponType === 'rifle') {

        // Cajon de mecanismos.
        block(0.08, 0.085, 0.42, metal, 0, 0, -0.04, 0.012);

        // Canona y bocacha.
        tube(0.015, 0.016, 0.46, steel, 0, 0.032, -0.5);
        tube(0.019, 0.019, 0.05, steel, 0, 0.032, -0.74);

        // Guardamanos con ranuras de ventilacion.
        block(0.078, 0.072, 0.36, polymer, 0, -0.004, -0.36, 0.012);

        for (let i = 0; i < 3; i++) {
            block(0.082, 0.016, 0.03, metal, 0, -0.004, -0.24 - i * 0.09, 0.004);
        }

        // Culata y carrillera.
        block(0.07, 0.11, 0.34, polymer, 0, -0.012, 0.33, 0.018);
        block(0.074, 0.05, 0.16, polymer, 0, 0.04, 0.3, 0.012);

        // Empunadura y cargador curvo.
        grip(0.25, 0.068, polymer, 0, -0.075, 0.14);
        block(0.062, 0.2, 0.13, polymer, 0, -0.15, -0.03, 0.014, 0.18);

        // Optica: tubo con monturas, mas un punto rojo tenue.
        tube(0.03, 0.03, 0.18, metal, 0, 0.105, -0.05);
        tube(0.033, 0.033, 0.02, steel, 0, 0.105, -0.145);
        block(0.03, 0.035, 0.05, metal, 0, 0.075, 0.0, 0.006);
        block(0.03, 0.035, 0.05, metal, 0, 0.075, -0.11, 0.006);

        // Palanca de montar y boton del cargador.
        block(0.02, 0.018, 0.06, steel, 0.045, 0.015, -0.02, 0.004);
        block(0.016, 0.022, 0.03, steel, 0.042, -0.03, 0.06, 0.004);

        // Gatillo y guardamonte.
        block(0.014, 0.05, 0.016, steel, 0, -0.062, 0.02, 0.006, 0.2);
        part(
            new THREE.TorusGeometry(0.048, 0.008, 6, 16, Math.PI * 1.1),
            polymer, 0, -0.072, 0.01, 0, Math.PI / 2, 0
        );

        muzzleZ = -0.8;
    }

    // ==================================
    // MANOS ENGUANTADAS
    // ==================================

    // Mano de la empunadura: palma biselada + dedos como anillos
    // alrededor del agarre (nada de cubos de piel).
    const gripY = weaponType === 'pistol' ? -0.17 : -0.14;
    const gripZ = weaponType === 'pistol' ? 0.12 : weaponType === 'shotgun' ? 0.19 : 0.17;

    block(0.05, 0.12, 0.085, glove, 0.028, gripY + 0.01, gripZ + 0.04, 0.018, 0.24, 0, -0.18);
    block(0.052, 0.045, 0.05, glovePad, 0.03, gripY + 0.05, gripZ + 0.005, 0.012, 0.2);

    for (let i = 0; i < 3; i++) {

        // Dedo que envuelve el agarre: anillo abierto en el plano XZ.
        const fingerGeometry = new THREE.TorusGeometry(0.033, 0.0115, 6, 12, Math.PI * 1.35);
        part(fingerGeometry, glove, 0.0, gripY + 0.045 - i * 0.045, gripZ + 0.015, Math.PI / 2, 0.35, 0);

    }

    // Mano de apoyo (delantera) sobre el guardamanos o bajo la mano
    // que empuna.
    const supportZ = weaponType === 'pistol' ? gripZ - 0.01 : -0.42;

    block(0.07, 0.075, 0.12, glove, -0.045, gripY - 0.01, supportZ, 0.02, 0.16, 0, 0.25);
    block(0.066, 0.05, 0.06, glovePad, -0.05, gripY + 0.03, supportZ - 0.03, 0.014, 0.14, 0, 0.2);

    for (let i = 0; i < 3; i++) {

        const fingerGeometry = new THREE.TorusGeometry(0.03, 0.011, 6, 12, Math.PI * 1.3);
        part(fingerGeometry, glove, -0.032, gripY + 0.035 - i * 0.04, supportZ + 0.005, Math.PI / 2, -0.3, 0);

    }

    // Destello del disparo: 3 quads cruzados con textura de
    // estrella/destello procedural (aditiva, ~55 ms de vida). Los
    // quads cruzados en abanico leen bien desde cualquier angulo sin
    // necesidad de billboard, y el giro/escala aleatorios por disparo
    // evitan el sello repetido del viejo disco amarillo.
    const flareTexture = (() => {

        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        const half = size / 2;

        // Halo radial calido: nucleo blanco, caida rapida.
        const radial = ctx.createRadialGradient(half, half, 0, half, half, half);
        radial.addColorStop(0, 'rgba(255,255,246,1)');
        radial.addColorStop(0.18, 'rgba(255,236,190,0.95)');
        radial.addColorStop(0.42, 'rgba(255,190,110,0.42)');
        radial.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, size, size);

        // Estrella de 4 puntas: dos barras finas (horizontal + vertical).
        ctx.globalCompositeOperation = 'lighter';
        for (const vertical of [false, true]) {
            const length = size * 0.96;
            const width = size * 0.10;
            const grad = vertical
                ? ctx.createLinearGradient(0, half - length / 2, 0, half + length / 2)
                : ctx.createLinearGradient(half - length / 2, 0, half + length / 2, 0);
            grad.addColorStop(0, 'rgba(255,220,160,0)');
            grad.addColorStop(0.5, 'rgba(255,244,220,0.9)');
            grad.addColorStop(1, 'rgba(255,220,160,0)');
            ctx.fillStyle = grad;
            if (vertical) ctx.fillRect(half - width / 2, half - length / 2, width, length);
            else ctx.fillRect(half - length / 2, half - width / 2, length, width);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;

    })();

    const flash = new THREE.Group();
    flash.position.z = muzzleZ;
    flash.visible = false;
    flash.userData.until = 0;

    {
        const flashMat = new THREE.MeshBasicMaterial({
            map: flareTexture,
            color: 0xffd9a0,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });

        // Tres quads cruzados en abanico (0 / 60 / 120 grados sobre Y):
        // siempre hay una cara recibiendo a la camara.
        const quadGeometry = new THREE.PlaneGeometry(0.42, 0.42);

        for (const angleY of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
            const quad = new THREE.Mesh(quadGeometry, flashMat);
            quad.rotation.y = angleY;
            flash.add(quad);
        }

        // Núcleo compacto y muy brillante que el bloom recoge.
        const core = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 0.2),
            new THREE.MeshBasicMaterial({
                color: 0xfff6e0,
                blending: THREE.AdditiveBlending,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        );
        flash.add(core);
    }

    gun.add(flash);

    // Giro y escala aleatorios por disparo, vida de ~55 ms.
    function triggerFlash() {
        flash.visible = true;
        flash.rotation.z = Math.random() * Math.PI * 2;
        const s = 0.85 + Math.random() * 0.45;
        flash.scale.set(s, s, s);
        flash.userData.until = performance.now() + 55;
    }

    // Luz del disparo: punto corto y cálido en la boca del cañón.
    // El brillo del fogonazo lo sube game.js al disparar y el bloom lo recoge.
    const light = new THREE.PointLight(
        0xffc16b,
        0,
        9,
        2
    );

    light.position.z = muzzleZ;

    gun.add(light);

    gun.position.set(0.19, -0.3, -0.52);
    gun.scale.setScalar(0.9);

    // La boca del arma apunta hacia el centro de la pantalla: la
    // silueta (corredera, mira, empunadura) se lee en tres cuartos
    // en vez de terminar como un rectangulo contra el borde.
    gun.rotation.y = 0.3;
    gun.rotation.x = 0.03;

    // El arma cuelga de la cámara: la niebla de suelo no la toca.
    gun.userData.noMist = true;

    camera.add(gun);

    return {
        gun,
        flash,
        light,
        triggerFlash
    };
}

export function groundTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base apagada de tierra mojada: el albedo se mantiene en un tono medio
    // (la oscuridad de la noche la ponen las luces, no la textura), así la
    // luna y la linterna todavía tienen algo que iluminar.
    ctx.fillStyle = '#5a604c'; ctx.fillRect(0, 0, 256, 256);

    // Manchas grandes de barro y hierba para romper el azulejo.
    for (let i = 0; i < 60; i++) {
        const shade = 42 + Math.random() * 30;
        ctx.fillStyle = `rgba(${shade + 4},${shade + 8},${shade},${0.18 + Math.random() * 0.28})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
    }

    // Detalle fino: gravilla, hojas y tierra.
    for (let i = 0; i < 16000; i++) {
        const shade = 40 + Math.random() * 48;
        ctx.fillStyle = `rgba(${shade + 6},${shade + 6},${shade},${0.12 + Math.random() * 0.45})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }

    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(65, 65); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Mapa de rugosidad: variación suave para que la luna no devuelva un
// plano perfectamente liso. Es una textura de 256 px, coste despreciable.
export function groundRoughnessTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 4200; i++) {
        const shade = 190 + Math.random() * 65;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.12 + Math.random() * 0.35})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 7, 1 + Math.random() * 5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(65, 65);
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

    // Piel cerosa y tela gastada: poca variación de rugosidad, un brillo
    // tenue que atrape la luz de la luna (look de noche, no de mediodía).
    skin.roughness = 0.82;
    skin.metalness = 0.04;

    clothes.roughness = 0.9;

    // Los infectados sudan un rojo enfermizo: emisión de contorno sutil.
    if (skinId === 'infected') {

        skin.emissive.setHex(0x1a0505);
        skin.emissiveIntensity = 0.3;

        clothes.emissive.setHex(0x1a0505);
        clothes.emissiveIntensity = 0.22;

    }

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
