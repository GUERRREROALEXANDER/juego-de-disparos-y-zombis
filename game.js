import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
let socket = null;
const remotePlayers = new Map();
let networkSendTimer = 0;
import { MAGAZINE_SIZE, RELOAD_SECONDS, SHOT_INTERVAL, TYPES, difficulty, chooseType, shotDamage } from './combat.js';
import { makeWeapon, groundTexture, decorateZombie, disposeEnemy } from './visuals.js';
let weapon, elapsed = 0, ammo = MAGAZINE_SIZE, reloadTimer = 0, shotTimer = 0, recoil = 0, firing = false;
let damageTimer = 0, level = 1;
const obstacles = [];
const doors = [];
let nearbyDoor = null;
const bulletBlockers = [];
// Sistema de botiquines
const medkits = [];
let medkitSpawnTimer = 0;
const MEDKIT_HEAL = 35;
const MEDKIT_DISTANCE = 1.5;
const sceneContainer = document.getElementById('scene-container');
const ammoVal = document.getElementById('ammo-val');
const waveVal = document.getElementById('wave-val');
const weaponStatus = document.getElementById('weapon-status');
const damageOverlay = document.getElementById('damage-overlay');
const threatNote = document.getElementById('threat-note');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function clearInput() {
    moveForward = moveBackward = moveLeft = moveRight = firing = false;
    velocity.set(0, 0, 0);
}

function reload() {
    if (
        !gameActive ||
        paused ||
        reloadTimer > 0 ||
        ammo >= WEAPONS[currentWeapon].maxAmmo
    ) return;

    reloadTimer = RELOAD_SECONDS;
    weaponStatus.textContent = 'RECARGANDO…';
}


function cambiarArma(nombre) {

    if (!WEAPONS[nombre] || reloadTimer > 0) return;

    if (nombre === currentWeapon) return;

    // Guardar munición del arma anterior
    weaponAmmo[currentWeapon] = ammo;

    // Cambiar arma
    currentWeapon = nombre;

    // Recuperar munición correspondiente
    ammo = weaponAmmo[currentWeapon];

    shotTimer = 0;

    // Retirar modelo anterior
    if (weapon && weapon.gun) {

        camera.remove(weapon.gun);

        const geometries = new Set();
        const materials = new Set();

        weapon.gun.traverse(object => {

            if (!object.isMesh) return;

            geometries.add(object.geometry);

            if (Array.isArray(object.material)) {

                object.material.forEach(material => {
                    materials.add(material);
                });

            } else {

                materials.add(object.material);

            }

        });

        geometries.forEach(geometry => geometry.dispose());

        materials.forEach(material => material.dispose());
    }

    // Crear modelo de la nueva arma
    weapon = makeWeapon(camera, currentWeapon);

    // Actualizar interfaz
    ammoVal.textContent = ammo;

    weaponStatus.textContent = WEAPONS[currentWeapon].name;

    const ammoCap = document.querySelector('.ammo-cap');

    if (ammoCap) {
        ammoCap.textContent = ` / ${WEAPONS[currentWeapon].maxAmmo}`;
    }

    // Actualizar menú visual
    document.querySelectorAll('.weapon-option').forEach(button => {

        const selected = button.dataset.weapon === currentWeapon;

        button.classList.toggle('is-selected', selected);

        button.setAttribute('aria-pressed', String(selected));

    });
}

// --- Configuración y Variables Globales ---
let scene, camera, renderer, controls;
// ==================================
// SISTEMA DE SELECCIÓN DE MAPAS
// ==================================

let selectedMap = 'forest';

const MAP_STORAGE_KEY = 'ultima-guardia-map';

// Recuperar el último mapa seleccionado
try {

    const savedMap = sessionStorage.getItem(MAP_STORAGE_KEY);

    if (savedMap === 'forest' || savedMap === 'village') {
        selectedMap = savedMap;
    }

} catch (error) {

    console.warn('No se pudo recuperar el mapa guardado.');

}
// SISTEMA CLIMÁTICO
let rainLines = null;
let lightningLight = null;

const RAIN_COUNT = 350;

let lightningTimer = 8;
let lightningFlashTimer = 0;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let prevTime = performance.now();

let health = 100;
let score = 0;
let gameActive = false;
let paused = false;
let pointerLockUnavailable = false;
let startRequested = false;
let zombies = [];
// Sistema de partículas de sangre
const bloodParticles = [];

const bloodParticleGeometry = new THREE.SphereGeometry(
    0.035, 5, 4
);

const bloodParticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x9b1720
});
let spawnTimer = 0;
const raycaster = new THREE.Raycaster();
const cameraRotation = new THREE.Euler(0, 0, 0, 'YXZ');

let currentWeapon = "pistol";

const WEAPONS = {

    pistol: {
        name: "PISTOLA",
        damage: 25,
        fireRate: 0.3,
        pellets: 1,
        spread: 0,
        maxAmmo: 12
    },

    shotgun: {
        name: "ESCOPETA",
        damage: 12,
        fireRate: 0.8,
        pellets: 8,
        spread: 0.12,
        maxAmmo: 8
    },

    rifle: {
        name: "RIFLE DE ASALTO",
        damage: 18,
        fireRate: 0.13,
        pellets: 1,
        spread: 0.025,
        maxAmmo: 30
    }

};

const weaponAmmo = {
    pistol: 12,
    shotgun: 8,
    rifle: 30
};

ammo = weaponAmmo.pistol;

// --- Multijugador ---
// Conexión con el servidor multijugador

function connectMultiplayer() {
    if (typeof io === 'undefined') {
        console.error('Socket.IO no está cargado.');
        return;
    }

    if (socket) return;

    socket = io();

    setupMultiplayer();
}

// Elementos UI
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');
const healthVal = document.getElementById('health-val');
const scoreVal = document.getElementById('score-val');
const finalScore = document.getElementById('final-score');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const pauseScreen = document.getElementById('pause-screen');
const resumeButton = document.getElementById('resume-button');
const crosshair = document.getElementById('crosshair');
const healthFill = document.getElementById('health-fill');
const hitMarker = document.getElementById('hit-marker');
// Elementos del minimapa
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapContext = minimapCanvas.getContext('2d');
function updateMinimap() {

    const ctx = minimapContext;

    const width = minimapCanvas.width;
    const height = minimapCanvas.height;

    const centerX = width / 2;
    const centerY = height / 2;

    const scale = 2;

    // Fondo
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#17231d';
    ctx.fillRect(0, 0, width, height);

    // Dibujar zombis
    zombies.forEach(zombie => {

        const x = centerX +
            (zombie.mesh.position.x - camera.position.x) * scale;

        const y = centerY +
            (zombie.mesh.position.z - camera.position.z) * scale;

        if (x < 0 || x > width || y < 0 || y > height) return;

        ctx.fillStyle = '#ff3939';

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Dibujar botiquines
    medkits.forEach(medkit => {

        const x = centerX +
            (medkit.position.x - camera.position.x) * scale;

        const y = centerY +
            (medkit.position.z - camera.position.z) * scale;

        if (x < 0 || x > width || y < 0 || y > height) return;

        ctx.fillStyle = '#35ff85';

        ctx.fillRect(x - 3, y - 3, 6, 6);
    });

    // Dibujar jugador en verde
ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Dirección del jugador
    const direction = new THREE.Vector3(0, 0, -1);

    direction.applyQuaternion(camera.quaternion);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(centerX, centerY);

    ctx.lineTo(
        centerX + direction.x * 15,
        centerY + direction.z * 15
    );

    ctx.stroke();
}
const gameError = document.getElementById('game-error');

// --- Inicialización ---
// Configurar selector de mapas
function setupMapSelector() {

    const mapButtons = document.querySelectorAll('.map-option');

    mapButtons.forEach(button => {

        // Marcar el mapa seleccionado
        const active = button.dataset.map === selectedMap;

        button.classList.toggle('is-selected', active);

        button.setAttribute(
            'aria-pressed',
            String(active)
        );

        // Evento de selección
        button.addEventListener('click', () => {

            const mapId = button.dataset.map;

            if (
                mapId !== 'forest' &&
                mapId !== 'village'
            ) return;

            if (mapId === selectedMap) return;

            try {

                sessionStorage.setItem(
                    MAP_STORAGE_KEY,
                    mapId
                );

            } catch (error) {

                console.warn('No se pudo guardar el mapa.');

            }

            // Recargar para construir el escenario elegido
            window.location.reload();

        });

    });

    updateMapMenuLabels();
}


// Actualizar nombres y descripciones
function updateMapMenuLabels() {

    const description = document.getElementById('map-description');

    const minimapTitle = document.getElementById('map-title');

    const isVillage = selectedMap === 'village';

    if (description) {

        description.textContent = isVillage

            ? 'Explora las calles de un pueblo abandonado.'

            : 'Sobrevive en un bosque lleno de zombis.';
    }

    if (minimapTitle) {

        minimapTitle.textContent = isVillage

            ? 'MAPA · PUEBLO'

            : 'MAPA · BOSQUE';
    }

    const hudMapName = document.getElementById('hud-map-name');

    if (hudMapName) {

        hudMapName.textContent = isVillage

            ? 'PUEBLO ABANDONADO · 02:17 AM'

            : 'BOSQUE NOCTURNO · 02:17 AM';
    }
}
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07100d);
   scene.fog = new THREE.FogExp2(
    0x07100d,
    0.019
);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Altura ojos humana

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

renderer.shadowMap.enabled = true;

renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sceneContainer.appendChild(renderer.domElement);

    controls = new PointerLockControls(camera, document.body);

    // Eventos UI
    startButton.addEventListener('click', requestPointerLock);
    // Selección de armas desde el menú principal
document.querySelectorAll('.weapon-option').forEach(button => {

    button.addEventListener('click', () => {

        cambiarArma(button.dataset.weapon);

    });

});
    resumeButton.addEventListener('click', requestPointerLock);
    // Activar selector de escenarios
setupMapSelector();

    controls.addEventListener('lock', activateGame);

    controls.addEventListener('unlock', () => {
        if (!gameActive) return;
        paused = true;
        clearInput();
        pauseScreen.classList.remove('hidden');
        hud.classList.add('hidden');
        crosshair.classList.add('hidden');
    });

    restartButton.addEventListener('click', () => {
        location.reload();
    });

    
    // Teclado
    const onKeyDown = (event) => {
        if (event.code === 'Escape' && pointerLockUnavailable && gameActive) {
            event.preventDefault();
            paused = !paused;
            clearInput();
            pauseScreen.classList.toggle('hidden', !paused);
            hud.classList.toggle('hidden', paused);
            crosshair.classList.toggle('hidden', paused);
            return;
        }

        switch (event.code) {
            case 'Digit1':
            case 'Numpad1':
                cambiarArma('pistol');
                break;
            case 'Digit2':
            case 'Numpad2':
                cambiarArma('shotgun');
                break;
                case 'Digit3':
case 'Numpad3':
    cambiarArma('rifle');
    break;
            case 'KeyR':
                reload();
                break;
            case 'KeyW':
                moveForward = true;
                break;
            case 'KeyA':
                moveLeft = true;
                break;
            case 'KeyS':
                moveBackward = true;
                break;
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);

    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyD': moveRight = false; break;
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (!pointerLockUnavailable || !gameActive || paused || controls.isLocked) return;
        cameraRotation.setFromQuaternion(camera.quaternion);
        cameraRotation.y -= event.movementX * 0.002;
        cameraRotation.x -= event.movementY * 0.002;
        cameraRotation.x = THREE.MathUtils.clamp(cameraRotation.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
        camera.quaternion.setFromEuler(cameraRotation);
    });
    document.addEventListener('pointerlockerror', () => {
        if (!startRequested) return;
        startRequested = false;
        pointerLockUnavailable = true;
        activateGame();
        gameError.textContent = 'Modo ratón libre: mueve el cursor para mirar y apuntar.';
        gameError.classList.remove('hidden');
        window.setTimeout(() => gameError.classList.add('hidden'), 4500);
    });

  // ==================================
// SISTEMA DE DISPARO CORREGIDO
// ==================================

// ===================================
// SISTEMA DE DISPARO ESTABLE
// ===================================

function handleShootDown(event) {

    // Solo clic izquierdo
    if (event.button !== 0) return;

    // Comprobar estado de la partida
    if (!gameActive || paused) return;

    event.preventDefault();

    console.log('DISPARO DETECTADO');

    firing = true;

    shoot();
}

// Detectar el clic antes que otros elementos
window.addEventListener(
    'mousedown',
    handleShootDown,
    true
);

// Detener disparo al soltar el clic
window.addEventListener('mouseup', () => {

    firing = false;

}, true);

// Controlar cuando se pierde el foco del navegador
window.addEventListener('blur', () => {

    clearInput();

});
    setupLights();

weapon = makeWeapon(camera, currentWeapon);

// Construir el escenario seleccionado
if (selectedMap === 'village') {

    setupVillageMap();

} else {

    setupEnvironment();

}

// Mantener el sistema climático si ya lo agregaste
// setupWeather();

animate();
}

function requestPointerLock() {
    if (pointerLockUnavailable) {
        activateGame();
    } else if (!document.pointerLockElement && controls.domElement.requestPointerLock) {
        startRequested = true;
        controls.lock();
    }
}

function activateGame() {
    connectMultiplayer();
    startRequested = false;
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    crosshair.classList.remove('hidden');
    console.log('Mira:', crosshair.className);
console.log('Visible:', getComputedStyle(crosshair).display);
    gameActive = true;
    paused = false;
    clearInput();
    if (zombies.length === 0) {
        spawnZombie();
        spawnZombie();
    }
}

function setupLights() {
    const ambientLight = new THREE.HemisphereLight(0x9db8a5, 0x29392d, 1.35);
    scene.add(ambientLight);

    const moonlight = new THREE.DirectionalLight(0xa2c2d0, 2.1);
    moonlight.position.set(10, 20, 10);
    moonlight.castShadow = true;
    moonlight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonlight.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 0.5, far: 100 });
    moonlight.shadow.bias = -0.001;
    scene.add(moonlight);
// Linterna con iluminación equilibrada
const flashlight = new THREE.SpotLight(
    0xe5edc9,
    9,
    22,
    Math.PI / 8,
    0.8,
    2
);

flashlight.castShadow = false;
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);
}// =================================
// SISTEMA DE LLUVIA
// =================================

function setupWeather() {

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(
        RAIN_COUNT * 2 * 3
    );

    // Crear gotas de lluvia
    for (let i = 0; i < RAIN_COUNT; i++) {

        const index = i * 6;

        const x = (Math.random() - 0.5) * 36;
        const y = Math.random() * 18 + 2;
        const z = (Math.random() - 0.5) * 36;

        // Inicio de la gota
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        // Final de la gota
        positions[index + 3] = x;
        positions[index + 4] = y - 0.5;
        positions[index + 5] = z;
    }

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
    );

    geometry.attributes.position.setUsage(
        THREE.DynamicDrawUsage
    );

    const material = new THREE.LineBasicMaterial({
        color: 0x9bbbd0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });

    rainLines = new THREE.LineSegments(
        geometry,
        material
    );

    rainLines.frustumCulled = false;

    scene.add(rainLines);

    // Luz de los relámpagos
    lightningLight = new THREE.PointLight(
        0xddeeff,
        0,
        70,
        2
    );

    scene.add(lightningLight);
}


// =================================
// ACTUALIZAR LLUVIA Y RELÁMPAGOS
// =================================

function updateWeather(delta) {

    if (!rainLines || !camera) return;

    // Mantener la lluvia alrededor del jugador
    rainLines.position.set(
        camera.position.x,
        camera.position.y - 2,
        camera.position.z
    );

    const positions =
        rainLines.geometry.attributes.position.array;

    // Movimiento de las gotas
    for (let i = 0; i < RAIN_COUNT; i++) {

        const index = i * 6;

        positions[index + 1] -= delta * 20;
        positions[index + 4] -= delta * 20;

        // Reiniciar la gota cuando toca el suelo
        if (positions[index + 1] < 0) {

            const x = (Math.random() - 0.5) * 36;
            const y = 16 + Math.random() * 4;
            const z = (Math.random() - 0.5) * 36;

            positions[index] = x;
            positions[index + 1] = y;
            positions[index + 2] = z;

            positions[index + 3] = x;
            positions[index + 4] = y - 0.5;
            positions[index + 5] = z;
        }
    }

    rainLines.geometry.attributes.position.needsUpdate = true;

    // =================================
    // RELÁMPAGOS ALEATORIOS
    // =================================

    lightningTimer -= delta;

    // Generar relámpago
    if (
        lightningTimer <= 0 &&
        lightningFlashTimer <= 0
    ) {

        lightningFlashTimer = 0.16;

        lightningTimer = 9 + Math.random() * 11;
    }

    // Iluminar temporalmente el escenario
    lightningLight.position.set(
        camera.position.x + 8,
        18,
        camera.position.z - 12
    );

    if (lightningFlashTimer > 0) {

        lightningFlashTimer -= delta;

        lightningLight.intensity =
            lightningFlashTimer > 0 ? 18 : 0;

    } else {

        lightningLight.intensity = 0;
    }
}


function setupEnvironment() {
    // Terreno del bosque
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x8c9980,
        map: groundTexture(),
        roughness: 0.93
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Árboles y rocas
    for (let i = 0; i < 130; i++) {
        createTree(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100
        );
        // =================================
// VEGETACION ADICIONAL DEL BOSQUE
// =================================

const bushGeometry = new THREE.IcosahedronGeometry(0.48, 0);

const bushMaterial = new THREE.MeshStandardMaterial({
    color: 0x29452e,
    roughness: 1
});

for (let i = 0; i < 28; i++) {

    const x = (Math.random() - 0.5) * 90;
    const z = (Math.random() - 0.5) * 90;

    if (Math.hypot(x, z) < 9) continue;

    const bush = new THREE.Mesh(
        bushGeometry,
        bushMaterial
    );

    bush.position.set(x, 0.35, z);

    bush.scale.set(
        1 + Math.random() * 0.6,
        0.7 + Math.random() * 0.4,
        1 + Math.random() * 0.6
    );

    scene.add(bush);
}
    }

    for (let i = 0; i < 50; i++) {
        createRock(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100
        );
    }

    // Casas del bosque
    createHouse(-15, -15);
    createHouse(18, -20);
    createHouse(-20, 22);
    createHouse(25, 20);
    // Nuevas casas del bosque
createHouse(-34, 0);
createHouse(34, 0);
}

function setupVillageMap() {
    // Terreno del pueblo
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({
            color: 0x77766b,
            roughness: 1
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Carretera
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 120),
        new THREE.MeshStandardMaterial({
            color: 0x303030,
            roughness: 1
        })
    );

    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);

    // Casas
    createHouse(-12, -12);
    createHouse(12, -12);
    createHouse(-12, 12);
    createHouse(12, 12);
    // Casas adicionales del pueblo
createHouse(-30, 26);
createHouse(30, -26);


    // Contenedores
    const containerMaterial = new THREE.MeshStandardMaterial({
        color: 0x465b50,
        roughness: 0.9
        
    });

    const containerPositions = [
        [-7, -5],
        [7, 5],
        [-7, 25],
        [7, -25]
    ];

    for (const [x, z] of containerPositions) {
        // =================================
// BARRILES ABANDONADOS
// =================================

const barrelGeometry = new THREE.CylinderGeometry(
    0.38,
    0.38,
    0.9,
    10
);

const barrelMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4932,
    roughness: 0.95
});

const barrelPositions = [
    [-20, 0],
    [20, 0],
    [-5, 22],
    [5, -22],
    [-35, -12],
    [35, 12],
    [-5, 40],
    [5, -40]
];

for (const [x, z] of barrelPositions) {

    const barrel = new THREE.Mesh(
        barrelGeometry,
        barrelMaterial
    );

    barrel.position.set(x, 0.45, z);

    barrel.castShadow = true;
    barrel.receiveShadow = true;

    scene.add(barrel);

    // Colisiones
    obstacles.push({
        x,
        z,
        radius: 0.48
    });

    bulletBlockers.push(barrel);
}// =================================
// BARRICADAS DEL PUEBLO
// =================================

const barrierGeometry = new THREE.BoxGeometry(
    3.2,
    0.85,
    0.4
);

const barrierMaterial = new THREE.MeshStandardMaterial({
    color: 0x70523b,
    roughness: 1
});

const barrierPositions = [
    [-5, -30],
    [5, 30],
    [-24, -15],
    [24, 15]
];

for (const [x, z] of barrierPositions) {

    const barrier = new THREE.Mesh(
        barrierGeometry,
        barrierMaterial
    );

    barrier.position.set(x, 0.425, z);

    barrier.castShadow = true;
    barrier.receiveShadow = true;

    scene.add(barrier);

    obstacles.push({
        x,
        z,
        halfWidth: 1.6,
        halfDepth: 0.2
    });

    bulletBlockers.push(barrier);
}// =================================
// CAJAS DE SUMINISTROS
// =================================

const crateGeometry = new THREE.BoxGeometry(
    1.2,
    1.2,
    1.2
);

const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x66503a,
    roughness: 1
});

const cratePositions = [
    [-22, -28],
    [22, 28],
    [-38, 0],
    [38, 0]
];

for (const [x, z] of cratePositions) {

    const crate = new THREE.Mesh(
        crateGeometry,
        crateMaterial
    );

    crate.position.set(x, 0.6, z);

    crate.castShadow = true;
    crate.receiveShadow = true;

    scene.add(crate);

    obstacles.push({
        x,
        z,
        halfWidth: 0.65,
        halfDepth: 0.65
    });

    bulletBlockers.push(crate);
}
        const container = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 2, 5),
            containerMaterial
        );

        container.position.set(x, 1, z);
        container.castShadow = true;
        container.receiveShadow = true;
        scene.add(container);
        

        obstacles.push({
            x,
            z,
            halfWidth: 1.25,
            halfDepth: 2.5
        });

        bulletBlockers.push(container);
    }

    scene.background = new THREE.Color(0x777b78);
    scene.fog = new THREE.FogExp2(0x777b78, 0.018);
    
}

// Mensaje para abrir y cerrar la puerta
const doorPrompt = document.createElement("div");

doorPrompt.style.position = "fixed";
doorPrompt.style.bottom = "18%";
doorPrompt.style.left = "50%";
doorPrompt.style.transform = "translateX(-50%)";
doorPrompt.style.padding = "12px 18px";
doorPrompt.style.background = "rgba(0,0,0,0.8)";
doorPrompt.style.color = "white";
doorPrompt.style.font = "18px Arial";
doorPrompt.style.borderRadius = "8px";
doorPrompt.style.display = "none";
doorPrompt.style.zIndex = "1000";
doorPrompt.style.pointerEvents = "none";

document.body.appendChild(doorPrompt);

// Detectar la puerta más cercana
function updateDoorInteraction() {
        if (!gameActive || paused) {
        nearbyDoor = null;
        doorPrompt.style.display = "none";
        return;
    }
    nearbyDoor = null;
    let closestDistance = 2.5;

    for (const door of doors) {
        const distance = Math.hypot(
            camera.position.x - door.x,
            camera.position.z - door.z
        );

        if (distance < closestDistance) {
            closestDistance = distance;
            nearbyDoor = door;
        }
    }

    if (nearbyDoor) {
        doorPrompt.textContent = nearbyDoor.open
            ? "Presiona E para cerrar"
            : "Presiona E para abrir";

        doorPrompt.style.display = "block";
    } else {
        doorPrompt.style.display = "none";
    }
}

// Abrir y cerrar con E
window.addEventListener("keydown", (event) => {
    if (
        event.code !== "KeyE" ||
        event.repeat ||
        !nearbyDoor ||
        !gameActive ||
        paused
    ) {
        return;
    }

    nearbyDoor.open = !nearbyDoor.open;

    nearbyDoor.pivot.rotation.y =
        nearbyDoor.open ? -Math.PI / 2 : 0;

    nearbyDoor.collider.active = !nearbyDoor.open;
});


function createHouse(x, z) {
    const house = new THREE.Group();

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x75624a
    });

    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x49352d
    });

    // Pared trasera
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(6, 3, 0.3),
        wallMaterial
    );
    backWall.position.set(0, 1.5, -3);
    house.add(backWall);
    bulletBlockers.push(backWall);

   // Pared izquierda
const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 3, 6),
    wallMaterial
);

// Posicionar correctamente la pared
leftWall.position.set(-3, 1.5, 0);

house.add(leftWall);
bulletBlockers.push(leftWall);
    // Pared derecha
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 3, 6),
        wallMaterial
        
    );
    rightWall.position.set(3, 1.5, 0);
    house.add(rightWall);
bulletBlockers.push(rightWall);
    // Pared frontal izquierda: deja espacio para entrar
    const frontLeft = new THREE.Mesh(
        new THREE.BoxGeometry(2.45, 3, 0.3),
        wallMaterial
        
    );
    frontLeft.position.set(-1.775, 1.5, 3);
    house.add(frontLeft);
bulletBlockers.push(frontLeft);
    // Pared frontal derecha
    const frontRight = new THREE.Mesh(
        new THREE.BoxGeometry(2.45, 3, 0.3),
        wallMaterial
    );
    frontRight.position.set(1.775, 1.5, 3);
    house.add(frontRight);
bulletBlockers.push(frontRight);
    // Techo
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(5, 2.5, 4),
        roofMaterial
    );
    roof.position.y = 4.25;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);

    // Suelo interior
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(5.7, 0.1, 5.7),
        new THREE.MeshStandardMaterial({ color: 0x51483a })
    );
    floor.position.y = 0.05;
    house.add(floor);

    // Colocar la casa en el mundo
    house.position.set(x, 0, z);
    scene.add(house);

    // Colisiones rectangulares de las paredes
    // Pared trasera
    obstacles.push({
        x,
        z: z - 3,
        halfWidth: 3,
        halfDepth: 0.15
    });

    // Pared lateral izquierda
    obstacles.push({
        x: x - 3,
        z,
        halfWidth: 0.15,
        halfDepth: 3
    });

    // Pared lateral derecha
    obstacles.push({
        x: x + 3,
        z,
        halfWidth: 0.15,
        halfDepth: 3
    });

    // Frente izquierdo: conserva libre la entrada central
    obstacles.push({
        x: x - 1.775,
        z: z + 3,
        halfWidth: 1.225,
        halfDepth: 0.15
    });

    // Frente derecho
    obstacles.push({
        x: x + 1.775,
        z: z + 3,
        halfWidth: 1.225,
        halfDepth: 0.15
    });
// ===== PUERTA INTERACTIVA =====

const doorPivot = new THREE.Group();

// Posición de la bisagra, en la entrada de la casa
doorPivot.position.set(x - 0.55, 0, z + 3);

const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a3520,
    roughness: 0.85
});

const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.5, 0.15),
    doorMaterial
);

doorMesh.position.set(0.55, 1.25, 0);
doorPivot.add(doorMesh);
bulletBlockers.push(doorMesh);

scene.add(doorPivot);

// Colisión de la puerta cerrada
const doorCollider = {
    x: x,
    z: z + 3,
    halfWidth: 0.5,
    halfDepth: 0.15,
    active: true
};

obstacles.push(doorCollider);

doors.push({
    pivot: doorPivot,
    collider: doorCollider,
    open: false,
    x: x,
    z: z + 3
});
}




function createRemotePlayer(player) {
    const group = new THREE.Group();

    // Cuerpo del jugador remoto.
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.0, 0.38),
        new THREE.MeshStandardMaterial({
            color: 0x36b9a0,
            roughness: 0.8
        })
    );
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Cabeza.
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 10),
        new THREE.MeshStandardMaterial({
            color: 0xd5b08a
        })
    );
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);

    // Marcador sobre la cabeza para identificar al jugador.
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x55ff88 })
    );
    marker.position.y = 2.15;
    group.add(marker);

    group.position.set(player.x, 0, player.z);
    group.rotation.y = player.rotationY || 0;
    group.userData.playerId = player.id;

    scene.add(group);
    remotePlayers.set(player.id, group);

    return group;
}

function updateRemotePlayer(player) {
    if (!player || player.id === socket.id) return;

    let model = remotePlayers.get(player.id);

    if (!model) {
        model = createRemotePlayer(player);
    }

    model.position.set(player.x, 0, player.z);
    model.rotation.y = player.rotationY || 0;
}

function setupMultiplayer() {
   socket.on('connect', () => {
    console.log('Multijugador conectado:', socket.id);

    const status = document.getElementById('multiplayer-status');

    if (status) {
        status.textContent = 'MULTIJUGADOR · CONECTADO';
        status.classList.add('is-connected');
        status.classList.remove('is-disconnected');
    }
});

    socket.on('connect_error', (error) => {
    console.error('Error de conexión multijugador:', error.message);

    const status = document.getElementById('multiplayer-status');

    if (status) {
        status.textContent = 'MULTIJUGADOR · SIN CONEXIÓN';
        status.classList.remove('is-connected');
        status.classList.add('is-disconnected');
    }
});
socket.on('disconnect', () => {
    const status = document.getElementById('multiplayer-status');

    if (status) {
        status.textContent = 'MULTIJUGADOR · DESCONECTADO';
        status.classList.remove('is-connected');
        status.classList.add('is-disconnected');
    }
});
    socket.on('players:initial', (players) => {
        players.forEach((player) => {
            if (player.id !== socket.id) {
                updateRemotePlayer(player);
            }
        });
    });

    socket.on('player:joined', (player) => {
        updateRemotePlayer(player);
        console.log('Se unió un jugador:', player.id);
    });

    socket.on('player:moved', (player) => {
        updateRemotePlayer(player);
    });

    socket.on('player:left', (playerId) => {
        const model = remotePlayers.get(playerId);

        if (model) {
            scene.remove(model);
            remotePlayers.delete(playerId);
        }

        console.log('Jugador desconectado:', playerId);
 
   });
socket.on('zombies:initial', (serverZombies) => {
    serverZombies.forEach(addServerZombie);
});

socket.on('zombie:created', (zombie) => {
    addServerZombie(zombie);
});
}


function sendPlayerPosition(delta) {
if (!socket || !socket.connected || !gameActive || paused) return;

    networkSendTimer += delta;

    // Enviar unas 20 actualizaciones por segundo.
    if (networkSendTimer < 0.05) return;

    networkSendTimer = 0;

    socket.emit('player:move', {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        rotationY: camera.rotation.y
    });
}

function createTree(x, z) {
    if (Math.hypot(x, z) < 7) return;
    const group = new THREE.Group();
    
    // Tronco
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 5, 10);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x604b35, roughness: 1 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    group.add(trunk);

    // Hojas (Estilo low-poly)
    const leavesGeo = new THREE.ConeGeometry(1.8, 3.8, 12);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x31593b, roughness: 1 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 4.3;
    leaves.castShadow = true;
    group.add(leaves);
    for (let tier = 1; tier < 3; tier++) {
        const crown = leaves.clone(); crown.scale.setScalar(1 - tier * 0.2); crown.position.y += tier * 1.2; group.add(crown);
    }
    group.rotation.y = Math.random() * Math.PI;
    obstacles.push({ x, z, radius: 0.4, mesh: trunk });

    group.position.set(x, 0, z);
    scene.add(group);
}

function createRock(x, z) {
    if (Math.hypot(x, z) < 5) return;
    const rockGeo = new THREE.DodecahedronGeometry(Math.random() * 0.5 + 0.2);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, 0.1, z);
    rock.scale.y = 0.5;
    rock.castShadow = true;
    scene.add(rock);
    obstacles.push({ x, z, radius: rockGeo.parameters.radius + 0.15, mesh: rock });
}

// --- Lógica de Zombis ---
// Crear botiquín de recuperación
function createMedkit() {

    const medkit = new THREE.Group();

    // Caja blanca
    const boxGeometry = new THREE.BoxGeometry(0.7, 0.45, 0.6);

    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x222222
    });

    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.y = 0.3;

    medkit.add(box);

    // Cruz roja horizontal
    const crossMaterial = new THREE.MeshBasicMaterial({
        color: 0xff2222
    });

    const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.12, 0.08),
        crossMaterial
    );

    horizontal.position.set(0, 0.3, 0.31);

    medkit.add(horizontal);

    // Cruz roja vertical
    const vertical = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.3, 0.08),
        crossMaterial
    );

    vertical.position.set(0, 0.3, 0.31);

    medkit.add(vertical);

    // Posición aleatoria
    medkit.position.set(
        (Math.random() - 0.5) * 65,
        0,
        (Math.random() - 0.5) * 65
    );

    scene.add(medkit);

    medkits.push(medkit);
}
function updateMedkits(delta) {

    medkitSpawnTimer += delta;

    // Aparecer un botiquín cada 20 segundos
    if (medkitSpawnTimer >= 20 && medkits.length < 5) {

        createMedkit();

        medkitSpawnTimer = 0;
    }

    for (let i = medkits.length - 1; i >= 0; i--) {

        const medkit = medkits[i];

        // Movimiento flotante
        medkit.position.y =
            0.1 + Math.sin(elapsed * 3 + i) * 0.08;

        const distance = camera.position.distanceTo(
            medkit.position
        );

        // Recoger botiquín
        if (distance < MEDKIT_DISTANCE) {

            if (health < 100) {

                health = Math.min(
                    100,
                    health + MEDKIT_HEAL
                );

                healthVal.textContent = health;

                healthFill.style.width = `${health}%`;

                scene.remove(medkit);

                medkits.splice(i, 1);
            }
        }
    }
}
// Apariencias disponibles
const ZOMBIE_SKINS = [
    'classic',
    'military',
    'infected',
    'survivor'
];

let nextSkinIndex = 0;

// Seleccionar la siguiente apariencia
function chooseZombieSkin() {

    const skin = ZOMBIE_SKINS[nextSkinIndex];

    nextSkinIndex++;

    if (nextSkinIndex >= ZOMBIE_SKINS.length) {
        nextSkinIndex = 0;
    }

    return skin;
}

// Color de ojos según la apariencia
function getZombieEyeColor(skinId) {

    const colors = {
        classic: 0xe55b43,
        military: 0xd6a34a,
        infected: 0xff1717,
        survivor: 0xc98a42
    };

    return colors[skinId] || colors.classic;
}
function spawnZombie() {

    const settings = difficulty(elapsed);

    const type = chooseType(settings.level, Math.random());

    const stats = TYPES[type];

    if (!stats) return;

    const skinId = chooseZombieSkin();

    const group = new THREE.Group();
    
    // Cuerpo
    const bodyGeo = new THREE.BoxGeometry(0.58, 0.9, 0.38);
    const bodyMat = new THREE.MeshStandardMaterial({ color: stats.color, roughness: 1 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    group.add(body);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.23, 16, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x89956b, roughness: 1 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.scale.set(0.88, 1.16, 0.9);
    head.userData.headshot = true;
    group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({
    color: getZombieEyeColor(skinId)
});
    for (const eyeX of [-0.08, 0.08]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(eyeX, 1.73, 0.205);
        group.add(eye);
    }

    const limbs = decorateZombie(
    group,
    headMat,
    bodyMat,
    skinId
);
    group.scale.setScalar(stats.scale);
    // Posición aleatoria lejos del jugador
    const dist = 13 + Math.random() * 9;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    const offset = zombies.length === 0 ? 0 : (Math.random() - 0.5) * 14;
    group.position.set(
        camera.position.x + forward.x * dist + side.x * offset,
        0,
        camera.position.z + forward.z * dist + side.z * offset
    );

    group.position.x = THREE.MathUtils.clamp(group.position.x, -46, 46);
    group.position.z = THREE.MathUtils.clamp(group.position.z, -46, 46);
    const zombieData = {
        skinId,
        mesh: group,
        health: Math.ceil(stats.health * settings.multiplier),
        maxHealth: Math.ceil(stats.health * settings.multiplier),
        speed: stats.speed * Math.min(1.7, settings.multiplier),
        damage: stats.damage, type, limbs, phase: Math.random() * Math.PI * 2,
        attackCooldown: 0
    };
    group.traverse((part) => { part.userData.zombie = zombieData; });

    scene.add(group);
    zombies.push(zombieData);
        if (socket && socket.connected) {
        socket.emit('zombie:create', {
    x: group.position.x,
    z: group.position.z,
    type: zombieData.type,
    health: zombieData.health,
    maxHealth: zombieData.maxHealth,
    skin: zombieData.skinId
});
    
    }
}
function addServerZombie(data) {
    if (!data || zombies.some(z => z.id === data.id)) return;

    const stats = TYPES[data.type];
    if (!stats) return;
    const skinId = ZOMBIE_SKINS.includes(data.skin)
    ? data.skin
    : 'classic';

    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: stats.color,
        roughness: 1
    });
    const headMat = new THREE.MeshStandardMaterial({
        color: 0x89956b,
        roughness: 1
    });

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.9, 0.38),
        bodyMat
    );
    body.position.y = 1;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 16, 12),
        headMat
    );
    head.position.y = 1.7;
    head.scale.set(0.88, 1.16, 0.9);
    head.userData.headshot = true;
    group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({
    color: getZombieEyeColor(skinId)
});

    for (const eyeX of [-0.08, 0.08]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(eyeX, 1.73, 0.205);
        group.add(eye);
    }

    const limbs = decorateZombie(group, headMat, bodyMat);
    group.scale.setScalar(stats.scale);
    group.position.set(data.x, 0, data.z);

    const zombieData = {
        id: data.id,
        mesh: group,
        health: data.health,
        maxHealth: data.maxHealth,
        speed: stats.speed,
        damage: stats.damage,
        type: data.type,
        limbs,
        phase: Math.random() * Math.PI * 2,
        attackCooldown: 0
    };

    group.traverse(part => {
        part.userData.zombie = zombieData;
    });

    scene.add(group);
    zombies.push(zombieData);
}

// Crear partículas de sangre
function spawnBloodParticles(position, count = 5) {

    for (let i = 0; i < count; i++) {

        const particle = new THREE.Mesh(
            bloodParticleGeometry,
            bloodParticleMaterial
        );

        particle.position.copy(position);

        scene.add(particle);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 1.8 + 0.3,
            (Math.random() - 0.5) * 2
        );

        bloodParticles.push({
            mesh: particle,
            velocity: velocity,
            life: 0.45 + Math.random() * 0.2
        });
    }
}

// Actualizar movimiento de las partículas
function updateBloodParticles(delta) {

    for (let i = bloodParticles.length - 1; i >= 0; i--) {

        const particle = bloodParticles[i];

        particle.life -= delta;

        particle.mesh.position.addScaledVector(
            particle.velocity,
            delta
        );

        particle.velocity.y -= 4 * delta;

        if (particle.life <= 0) {

            scene.remove(particle.mesh);

            bloodParticles.splice(i, 1);
        }
    }
}
function shoot() {
    if (shotTimer > 0 || reloadTimer > 0 || !gameActive || paused) return;

    if (ammo <= 0) {
        reload();
        return;
    }

    const weaponStats = WEAPONS[currentWeapon];

if (!weaponStats) {
    console.error('No se encontró el arma:', currentWeapon);
    return;
}

if (!weapon || !weapon.gun) {
    console.error('El modelo del arma no está disponible');
    return;
}
  

console.log('Disparando:', currentWeapon);

    ammo--;
    ammoVal.textContent = ammo;
    console.log(
    'Arma:', currentWeapon,
    '| Munición restante:', ammo
);

    // Cada arma tiene su propia cadencia de disparo.
    shotTimer = weaponStats.fireRate;
    recoil = 1;

    weaponStatus.textContent =
        ammo <= 3
            ? 'R · RECARGAR'
            : weaponStats.name;

    scene.updateMatrixWorld(true);

    const targets = [
        ...zombies.map((zombie) => zombie.mesh),
        ...bulletBlockers,
        ...obstacles.map((obstacle) => obstacle.mesh).filter(Boolean)
    ];

    const baseDirection = new THREE.Vector3();
    camera.getWorldDirection(baseDirection);

    const right = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(camera.quaternion);

    const up = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(camera.quaternion);

    let hitSomething = false;

    crosshair.classList.add('firing');
    window.setTimeout(() => {
        crosshair.classList.remove('firing');
    }, 90);

    // La pistola dispara un rayo; la escopeta dispara ocho perdigones.
    for (let i = 0; i < weaponStats.pellets; i++) {
        const direction = baseDirection.clone();

        if (weaponStats.spread > 0) {
            direction.addScaledVector(
                right,
                (Math.random() * 2 - 1) * weaponStats.spread
            );

            direction.addScaledVector(
                up,
                (Math.random() * 2 - 1) * weaponStats.spread
            );

            direction.normalize();
        }

        raycaster.set(camera.position, direction);
        raycaster.far = 55;

        const hit = raycaster.intersectObjects(targets, true)[0];
        // Efecto visual de impacto
if (hit) {

    const impactLight = new THREE.PointLight(
        0xffaa33,
        5,
        3
    );

    impactLight.position.copy(hit.point);

    scene.add(impactLight);

    setTimeout(() => {

        scene.remove(impactLight);

    }, 100);
}

        // Si el perdigón no golpea nada, pasa al siguiente.
        if (!hit) continue;

        let zombie = hit.object.userData.zombie;
        let target = hit.object;

        while (!zombie && target.parent) {
            target = target.parent;
            zombie = target.userData.zombie;
        }

        // Las paredes y los contenedores bloquean los disparos.
        if (!zombie || zombie.health <= 0) continue;
        // Efecto de sangre al impactar
spawnBloodParticles(
    hit.point,
    currentWeapon === 'shotgun' ? 3 : 5
);

        const headshot = Boolean(hit.object.userData.headshot);

        // Calcular daño según el impacto
const damageMultiplier = shotDamage(headshot);

zombie.health -= weaponStats.damage * damageMultiplier;

        hitSomething = true;

        // Actualizar información del enemigo
if (threatNote) {

    threatNote.textContent =
        TYPES[zombie.type].name + ' · ' +
        Math.max(0, zombie.health) + '/' +
        zombie.maxHealth;

}

        hitMarker.style.color = headshot ? '#ffc581' : '';

        if (zombie.health <= 0) {
            // Explosión adicional de partículas al eliminar un zombi
spawnBloodParticles(hit.point, 12);
            scene.remove(zombie.mesh);
            disposeEnemy(zombie.mesh);

            zombies = zombies.filter(
                (current) => current !== zombie
            );

            score += 1;
            scoreVal.innerText = String(score).padStart(2, '0');
        }
    }

    if (hitSomething) {
        hitMarker.classList.remove('visible');
        void hitMarker.offsetWidth;
        hitMarker.classList.add('visible');
    }
}



function updateZombies(delta) {
    zombies.forEach((z) => {
        if (!gameActive) return;

        // 1. Detectar al jugador
        const dir = new THREE.Vector3(
            camera.position.x - z.mesh.position.x,
            0,
            camera.position.z - z.mesh.position.z
        );

        const distance = dir.length();
        if (distance > 0.001) dir.normalize();

        // 2. Buscar una ruta que evite árboles y rocas
        const radius = 0.32 * TYPES[z.type].scale;
        // Velocidad reducida de los zombis
const moveSpeed = z.speed * 2.1;
       
function isBlocked(dx, dz) {
    const nextX = z.mesh.position.x + dx * 0.8;
    const nextZ = z.mesh.position.z + dz * 0.8;

    return obstacles.some((o) => {
        if (o.active === false) return false;

        // Árboles y rocas: obstáculos circulares
        if (typeof o.radius === "number") {
            return Math.hypot(
                nextX - o.x,
                nextZ - o.z
            ) < radius + o.radius + 0.15;
        }

        // Casas: obstáculos rectangulares
        if (typeof o.halfWidth === "number") {
            return (
                Math.abs(nextX - o.x) < o.halfWidth + radius + 0.15 &&
                Math.abs(nextZ - o.z) < o.halfDepth + radius + 0.15
            );
        }

        return false;
    });
}


        let moveDir = dir.clone();

        if (isBlocked(dir.x, dir.z)) {
            const left = new THREE.Vector3(-dir.z, 0, dir.x);
            const right = new THREE.Vector3(dir.z, 0, -dir.x);

            if (!isBlocked(left.x, left.z)) {
                moveDir.copy(left);
            } else if (!isBlocked(right.x, right.z)) {
                moveDir.copy(right);
            } else {
                // Si ambos lados están bloqueados, intenta avanzar
                moveDir.copy(dir);
            }
        }

        // 3. Avanzar hacia el jugador
        const stopDistance = 1.0 * TYPES[z.type].scale;

        if (distance > stopDistance) {
            z.mesh.position.addScaledVector(
                moveDir,
                moveSpeed * delta
            );
        }

        resolveObstacles(z.mesh.position, radius);

       // 4. ANIMACIONES MEJORADAS DE LOS ZOMBIS

z.phase += delta * moveSpeed * 4;

// Detectar si el zombi está cerca del jugador
const closeToPlayer =
    distance < 1.8 * TYPES[z.type].scale;

// Detectar si está caminando
const walking =
    distance > 1.05 * TYPES[z.type].scale;

// Animación de las piernas
z.limbs.legs.forEach((leg, i) => {

    const step = Math.sin(
        z.phase + i * Math.PI
    );

    if (walking) {
        leg.rotation.x = step * 0.48;
    } else {
        leg.rotation.x = 0.04;
    }

});

// Animación de los brazos
z.limbs.arms.forEach((arm, i) => {

    const swing = Math.sin(
        z.phase + i * Math.PI
    ) * 0.14;

    if (closeToPlayer) {

        // Posición de ataque
        arm.rotation.x = -0.5 + swing * 0.3;

    } else {

        // Movimiento normal al caminar
        arm.rotation.x = swing;

    }

});

// Movimiento vertical del cuerpo
z.mesh.position.y =
    Math.abs(Math.sin(z.phase * 2)) * 0.025;

// Mirar hacia el jugador
z.mesh.lookAt(
    camera.position.x,
    0,
    camera.position.z
);

// Pequeño balanceo del cuerpo
z.mesh.rotation.z =
    Math.sin(z.phase * 0.5) * 0.025;
        // 6. Atacar cuando está cerca
        z.attackCooldown -= delta;

        const attackDistance = 1.2 * TYPES[z.type].scale;

        if (distance < attackDistance && z.attackCooldown <= 0) {
            health = Math.max(0, health - z.damage);

            z.attackCooldown = 1.0;
            damageTimer = 0.4;

            healthVal.innerText = health;
            healthFill.style.width = `${health}%`;

            healthFill.style.background =
                health <= 30 ? '#e5594e' : '';

            if (health <= 0) {
                endGame();
            }
        }
    });
}


function endGame() {
    gameActive = false;
    paused = false;
    controls.unlock();
    finalScore.innerText = score;
    gameOverScreen.classList.remove('hidden');
    hud.classList.add('hidden');
    crosshair.classList.add('hidden');
    pauseScreen.classList.add('hidden');
}


function resolveObstacles(position, radius) {
    for (const obstacle of obstacles) {
        if (obstacle.active === false) continue;

        // Colisión circular: árboles y rocas
        if (typeof obstacle.radius === "number") {
            const dx = position.x - obstacle.x;
            const dz = position.z - obstacle.z;
            const distance = Math.hypot(dx, dz);
            const limit = radius + obstacle.radius;

            if (distance < limit) {
                const nx = distance > 0.001 ? dx / distance : 1;
                const nz = distance > 0.001 ? dz / distance : 0;

                position.x += nx * (limit - distance);
                position.z += nz * (limit - distance);
            }
        }

        // Colisión rectangular: paredes de las casas
        else if (obstacle.halfWidth !== undefined) {
            const closestX = THREE.MathUtils.clamp(
                position.x,
                obstacle.x - obstacle.halfWidth,
                obstacle.x + obstacle.halfWidth
            );

            const closestZ = THREE.MathUtils.clamp(
                position.z,
                obstacle.z - obstacle.halfDepth,
                obstacle.z + obstacle.halfDepth
            );

            const dx = position.x - closestX;
            const dz = position.z - closestZ;
            const distance = Math.hypot(dx, dz);

            if (distance < radius) {
                if (distance > 0.001) {
                    position.x += (dx / distance) * (radius - distance);
                    position.z += (dz / distance) * (radius - distance);
                } else {
                    // Si está dentro del rectángulo, salir por el lado más cercano
                    const left = Math.abs(position.x - (obstacle.x - obstacle.halfWidth));
                    const right = Math.abs((obstacle.x + obstacle.halfWidth) - position.x);
                    const back = Math.abs(position.z - (obstacle.z - obstacle.halfDepth));
                    const front = Math.abs((obstacle.z + obstacle.halfDepth) - position.z);
                    const min = Math.min(left, right, back, front);

                    if (min === left) position.x = obstacle.x - obstacle.halfWidth - radius;
                    else if (min === right) position.x = obstacle.x + obstacle.halfWidth + radius;
                    else if (min === back) position.z = obstacle.z - obstacle.halfDepth - radius;
                    else position.z = obstacle.z + obstacle.halfDepth + radius;
                }
            }
        }
    }

    position.x = THREE.MathUtils.clamp(position.x, -48, 48);
    position.z = THREE.MathUtils.clamp(position.z, -48, 48);
}

function updateCombat(delta) {
    elapsed += delta;
    updateMedkits(delta);
    const settings = difficulty(elapsed);
    if (settings.level !== level) {
        level = settings.level;
        waveVal.textContent = String(level).padStart(2, '0');
       if (threatNote) {

    threatNote.textContent =
        level === 2
            ? 'Corredores detectados'
            : level === 3
                ? 'Colosos detectados'
                : 'La horda se intensifica';

}
    }
    shotTimer = Math.max(0, shotTimer - delta);
   
if (reloadTimer > 0) {
    reloadTimer = Math.max(0, reloadTimer - delta);

    if (reloadTimer === 0) {
        ammo = WEAPONS[currentWeapon].maxAmmo;
        weaponAmmo[currentWeapon] = ammo;
        ammoVal.textContent = ammo;
        weaponStatus.textContent = WEAPONS[currentWeapon].name;
    }
}

    if (firing) shoot();
    recoil = Math.max(0, recoil - delta * 12);
    const moving = moveForward || moveBackward || moveLeft || moveRight;
    const bob = moving && !reducedMotion ? Math.sin(elapsed * 11) * 0.009 : 0;
    weapon.gun.position.set(0.25, -0.27 + bob - (reloadTimer > 0 ? Math.sin(reloadTimer / RELOAD_SECONDS * Math.PI) * 0.22 : 0), -0.52 + recoil * 0.045);
    weapon.gun.rotation.x = recoil * 0.045 - (reloadTimer > 0 ? 0.35 : 0);
    weapon.flash.visible = recoil > 0.55; weapon.light.intensity = recoil > 0.55 ? 10 : 0;
    damageTimer = Math.max(0, damageTimer - delta);
    damageOverlay.style.opacity = damageTimer / 0.4;
    spawnTimer += delta;
    if (spawnTimer >= settings.interval) { spawnZombie(); spawnTimer = 0; }
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.05);

    if ((controls.isLocked || pointerLockUnavailable) && gameActive && !paused) {

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) {
            velocity.z -= direction.z * 65.0 * delta;
        }

        if (moveLeft || moveRight) {
            velocity.x -= direction.x * 65.0 * delta;
        }

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        resolveObstacles(camera.position, 0.38);
    }

    prevTime = time;

   
    // Actualizar el juego
    if (gameActive && !paused) {
        updateZombies(delta);
        updateCombat(delta);
        sendPlayerPosition(delta);
    }

    // CORRECCIÓN: detectar puertas cercanas
    updateDoorInteraction();


    // Actualizar clima
    updateWeather(delta);

    // CORRECCIÓN: actualizar el minimapa
    updateMinimap();

    // Dibujar escena 3D
    renderer.render(scene, camera);
    
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

}


try {
    init();
} catch (error) {
    console.error('No se pudo iniciar la escena 3D:', error);
    gameError.textContent = 'No se pudo iniciar WebGL. Actualiza el navegador y comprueba que la aceleración por hardware esté activada.';
    gameError.classList.remove('hidden');
}
