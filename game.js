import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
let socket = null;
const remotePlayers = new Map();

// Skins de jugador: paleta limitada para mantener un coste gráfico bajo.
const PLAYER_SKINS = Object.freeze({
    survivor: { body: 0x36b9a0, head: 0xd5b08a, detail: 0x23564f },
    military: { body: 0x718453, head: 0xc69a75, detail: 0x374633 },
    medic:    { body: 0xdde2de, head: 0xd5b08a, detail: 0xb52e37 },
    night:    { body: 0x454c66, head: 0xb78c71, detail: 0x202539 }
});
const VALID_PLAYER_SKINS = Object.keys(PLAYER_SKINS);
let selectedPlayerSkin = 'survivor';
try {
    const savedSkin = localStorage.getItem('zombies.playerSkin');
    if (VALID_PLAYER_SKINS.includes(savedSkin)) selectedPlayerSkin = savedSkin;
} catch (_) { /* Puede estar bloqueado el almacenamiento local. */ }

function setupSkinSelector() {
    const buttons = [...document.querySelectorAll('.skin-option')];
    const select = (skin, broadcast = true) => {
        if (!VALID_PLAYER_SKINS.includes(skin)) return;
        selectedPlayerSkin = skin;
        buttons.forEach(button => {
            const active = button.dataset.skin === skin;
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', String(active));
        });
        try { localStorage.setItem('zombies.playerSkin', skin); } catch (_) {}
        if (broadcast && socket?.connected) socket.emit('player:skin', skin);
    };
    buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.skin)));
    select(selectedPlayerSkin, false);
}

function recolorRemotePlayer(model, skin) {
    const colors = PLAYER_SKINS[skin] || PLAYER_SKINS.survivor;
    if (model.userData.skin === skin) return;
    model.userData.skin = skin;
    model.userData.bodyMaterial.color.setHex(colors.body);
    model.userData.headMaterial.color.setHex(colors.head);
    model.userData.detailMaterial.color.setHex(colors.detail);
}

let networkSendTimer = 0;
import { MAGAZINE_SIZE, RELOAD_SECONDS, SHOT_INTERVAL, TYPES, difficulty, chooseType, shotDamage } from './combat.js';
import { maxActiveZombies, maxVisibleZombies, findOwnSpawn } from './zombie-performance.mjs';
import { ACHIEVEMENTS, earnedAchievements, newlyEarned, secondsToNextWave } from './achievements.mjs';
import { EYE_HEIGHT, initialJump, beginJump, updateJump } from './jump.mjs';
import { createObstacleIndex } from './spatial-index.mjs';
import { makeWeapon } from './visuals.js';
import { createPost } from './post.js';
import { loadAssets } from './render/assets.js';
import { updateRenderTime, applyAtmosphere } from './render/shaders.js';
import { setupAtmosphere } from './render/atmosphere.js';
import { getMaterials, createGroundMesh } from './render/materials.js';
import { setupLighting } from './render/lighting.js';
import { instanceFromObject } from './render/instancing.js';
import {
    prepareZombieTemplate,
    createZombieVisual,
    updateZombieVisual,
    playZombieDeath,
    fadeZombieActions,
    setZombieFade,
    disposeZombieVisual
} from './render/zombies.js';
let weapon, elapsed = 0, ammo = MAGAZINE_SIZE, reloadTimer = 0, shotTimer = 0, recoil = 0, firing = false;
let post = null;
// El primer arranque prioriza la fluidez. El jugador puede subir la calidad en el menú.
let qualityMode = 'low';
let sky = null;
let skyMaterial = null;
let assetBundle = null;
let lighting = null;
let atmosphere = null;
const _moonUv = new THREE.Vector3();
const dyingZombies = [];
let nextClientZombieSequence = 0;
let minimapAccumulator = 0;
let weatherAccumulator = 0;

try {

    const requestedQuality = new URLSearchParams(window.location.search).get('quality');
    const savedQuality = window.localStorage.getItem('zombieGraphicsQuality');
    const initialQuality = requestedQuality || savedQuality;
    if (initialQuality === 'high' || initialQuality === 'medium' || initialQuality === 'low') {
        qualityMode = initialQuality;
    }

} catch (error) {

    console.warn('No se pudo leer la calidad de la URL.');

}
let damageTimer = 0, level = 1;
const obstacles = [];
// Se crea una sola vez después de construir el mapa. Las puertas conservan sus referencias.
let obstacleIndex = null;
const doors = [];
let nearbyDoor = null;
const supplyCaches = [];
let nearbySupplyCache = null;
const worldFlickerLights = [];
const bulletBlockers = [];
let staticBulletTargets = [];
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
// HUD de progreso: sólo se actualiza por eventos o una vez por segundo.
const toast = document.getElementById('game-toast');
const countdown = document.getElementById('wave-countdown');
const achievementsPanel = document.getElementById('achievements-panel');
const achievementsList = document.getElementById('achievements-list');
const achievementsCount = document.getElementById('achievements-count');
let earnedIds = new Set();
let toastQueue = [];
let toastRemaining = 0;
let hudSecond = -1;
const ACHIEVEMENT_STORAGE_KEY = 'ultima-guardia-achievements-v1';
try {
    const saved = JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) earnedIds = new Set(saved.filter(id => ACHIEVEMENTS.some(a => a.id === id)));
} catch (_) { /* Privacidad del navegador: progreso solo durante la sesión. */ }
document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyL' && !event.repeat && achievementsPanel) {
        achievementsPanel.hidden = !achievementsPanel.hidden;
        if (!achievementsPanel.hidden) paintAchievements();
    }
});
function paintAchievements() {
    if (!achievementsList) return;
    achievementsList.replaceChildren(...ACHIEVEMENTS.map(a => {
        const li = document.createElement('li');
        const unlocked = earnedIds.has(a.id);
        li.textContent = `${unlocked ? '✓' : '○'} ${a.title} — ${a.detail}`;
        li.className = unlocked ? 'achievement-earned' : 'achievement-locked';
        return li;
    }));
    achievementsCount.textContent = `${earnedIds.size}/${ACHIEVEMENTS.length}`;
}
function queueToast(message) { toastQueue.push(message); }
function refreshToast(delta) {
    if (toastRemaining > 0) toastRemaining -= delta;
    if (toastRemaining <= 0 && toastQueue.length) {
        toast.textContent = toastQueue.shift();
        toast.classList.remove('hidden');
        toastRemaining = 3;
    } else if (toastRemaining <= 0) toast.classList.add('hidden');
}
function checkAchievements() {
    const stats = { kills: score, wave: level, seconds: elapsed };
    const newIds = newlyEarned(stats, earnedIds);
    for (const id of newIds) {
        earnedIds.add(id);
        const a = ACHIEVEMENTS.find(item => item.id === id);
        queueToast(`🏆 Logro desbloqueado: ${a.title}`);
    }
    if (newIds.length > 0) {
        try { localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify([...earnedIds])); } catch (_) {}
        paintAchievements();
    }
}
function refreshHealth() {
    if (healthVal) healthVal.textContent = health;
    if (healthFill) {
        healthFill.style.width = `${health}%`;
        healthFill.style.background = health <= 30 ? '#e5594e' : '';
    }
    healthBlock?.classList.toggle('health-critical', health <= 30);
}

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

    paintAmmoPips();

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
let jumpState = initialJump();
let direction = new THREE.Vector3();
let prevTime = performance.now();

let health = 100;
let score = 0;
let gameActive = false;
let paused = false;
let pointerLockUnavailable = false;
let startRequested = false;
let zombies = [];
const pendingServerZombies = new Map();
// Sistema de partículas de sangre
const bloodParticles = [];
const reusableBloodParticles = [];
const MAX_REUSABLE_BLOOD = 80;

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

    socket = io({ auth: { mapId: selectedMap } });

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
const healthBlock = document.querySelector('.health-block');
const hitMarker = document.getElementById('hit-marker');
const ammoPips = document.getElementById('ammo-pips');

// Marcas de munición del HUD (solo presentación).
function paintAmmoPips() {
    if (!ammoPips) return;

    const max = (WEAPONS[currentWeapon] && WEAPONS[currentWeapon].maxAmmo) || ammo || 0;

    if (ammoPips.children.length !== max) {
        ammoPips.replaceChildren(
            ...Array.from({ length: max }, () => document.createElement('span'))
        );
    }

    Array.from(ammoPips.children).forEach((pip, index) => {
        pip.classList.toggle('on', index < ammo);
    });

    ammoPips.classList.toggle(
        'low',
        ammo > 0 && ammo <= Math.max(1, Math.ceil(max * 0.25))
    );
}

// Elementos del minimapa
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapContext = minimapCanvas.getContext('2d');
const minimapDirection = new THREE.Vector3();
function updateMinimap() {

    const ctx = minimapContext;

    const width = minimapCanvas.width;
    const height = minimapCanvas.height;

    const centerX = width / 2;
    const centerY = height / 2;

    const scale = 2;

    // Fondo
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0a0d10';
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

        ctx.fillStyle = '#35b8aa';

        ctx.fillRect(x - 3, y - 3, 6, 6);
    });

    // Dibujar cajas de suministros disponibles.
    supplyCaches.forEach(cache => {
        if (cache.used) return;
        const x = centerX + (cache.x - camera.position.x) * scale;
        const y = centerY + (cache.z - camera.position.z) * scale;
        if (x < 0 || x > width || y < 0 || y > height) return;
        ctx.fillStyle = '#e7c46b';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.restore();
    });

    // Dibujar jugador
    ctx.fillStyle = '#ece6d6';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Dirección del jugador
    const direction = minimapDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);

    ctx.strokeStyle = '#ece6d6';
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

            ? 'Calles con faroles, vehículos abandonados, puertas y suministros ocultos.'

            : 'Campamento, fogata, senderos, puertas y cajas de suministros.';
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
async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d10);
    scene.fog = new THREE.FogExp2(
        0x0a0f0e,
        0.012
    );

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = EYE_HEIGHT; // Altura de los ojos al estar en el suelo

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sceneContainer.appendChild(renderer.domElement);

    // Recursos reales: HDRI, PBR, zombi animado y árboles. Cualquier
    // clave null del manifiesto (o una descarga que falla) deja el
    // aspecto procedural actual para esa pieza.
    assetBundle = await loadAssets(renderer).catch((error) => {
        console.warn('[render] assets unavailable, using the procedural look:', error);
        return null;
    });

    if (assetBundle && assetBundle.environment) {
        // Entorno para los reflejos, pero la noche sigue siendo noche:
        // el HDRI apenas aporta un relleno frío, no ilumina el bosque.
        scene.environment = assetBundle.environment;
        scene.environmentIntensity = 0.12;
    }

    if (assetBundle && assetBundle.zombie) {
        prepareZombieTemplate(assetBundle.zombie);
    }
    controls = new PointerLockControls(camera, document.body);

    // Eventos UI
    startButton.addEventListener('click', showTutorial);
    // Selección de armas desde el menú principal
document.querySelectorAll('.weapon-option').forEach(button => {

    button.addEventListener('click', () => {

        cambiarArma(button.dataset.weapon);

    });

});
    resumeButton.addEventListener('click', requestPointerLock);
    setupTutorial();
    // Activar selector de escenarios y personajes
setupMapSelector();
setupSkinSelector();
setupGraphicsSelector();

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
            case 'KeyQ':
                cycleQuality();
                break;
            case 'Space':
                if (gameActive && !paused && (controls.isLocked || pointerLockUnavailable)) {
                    event.preventDefault();
                    if (!event.repeat) jumpState = beginJump(jumpState);
                }
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
    setupSky();
weapon = makeWeapon(camera, currentWeapon);

// Construir el escenario seleccionado
if (selectedMap === 'village') {

    setupVillageMap();

} else {

    setupEnvironment();

}
// Índice de colisiones: árboles, rocas, paredes y puertas; conserva las geometrías.
obstacleIndex = createObstacleIndex(obstacles);
staticBulletTargets = [...new Set([
    ...bulletBlockers, ...obstacles.map(o => o.mesh).filter(Boolean)
])];
paintAchievements();

// Mantener el sistema climático si ya lo agregaste
// setupWeather();

// La niebla de suelo se aplica a todos los materiales del mundo ya
// construido: casas, barriles, terreno y vegetación comparten banda.
applyAtmosphere(scene);

// Post-proceso: oclusión ambiental, bloom, grade y antialiasing.
post = createPost(renderer, scene, camera);
post.setQuality(qualityMode);
applyGraphicsQuality();

// Atmósfera profunda: niebla de suelo espesa, tarjetas de niebla
// a la deriva y fustes de luna entre los árboles.
atmosphere = setupAtmosphere(scene);

// Ganchos para comprobaciones automáticas del render.
window.__game = {
    scene,
    renderer,
    camera,
    post,
    assets: assetBundle,
    lighting,
    // Estado vivo para las comprobaciones de combate/muerte.
    zombies: () => zombies,
    dyingZombies: () => dyingZombies,
    killZombie
};

// El canvas ya no se redimensiona desde el bucle de animación.
window.addEventListener('resize', () => {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    if (post) {

        post.setQuality(qualityMode);

    } else {

        renderer.setSize(window.innerWidth, window.innerHeight);

    }

});

animate();
}

// Tutorial antes de comenzar; no se cargan recursos 3D adicionales.
const tutorialDialog = document.getElementById('tutorial');
const tutorialSteps = [...document.querySelectorAll('[data-tutorial-step]')];
const tutorialProgress = document.getElementById('tutorial-progress');
const tutorialNext = document.getElementById('tutorial-next');
const tutorialSkip = document.getElementById('tutorial-skip');
let tutorialStep = 0;

function paintTutorialStep() {
    tutorialSteps.forEach((element, index) => { element.hidden = index !== tutorialStep; });
    tutorialProgress.textContent = `Paso ${tutorialStep + 1} de ${tutorialSteps.length}`;
    tutorialNext.textContent = tutorialStep === tutorialSteps.length - 1 ? 'Comenzar partida' : 'Siguiente →';
}

function showTutorial() {
    tutorialStep = 0;
    paintTutorialStep();
    tutorialDialog.hidden = false;
    startScreen.inert = true;
    tutorialNext.focus();
}

function finishTutorial() {
    tutorialDialog.hidden = true;
    startScreen.inert = false;
    requestPointerLock();
}

function setupTutorial() {
    tutorialNext.addEventListener('click', () => {
        if (tutorialStep < tutorialSteps.length - 1) {
            tutorialStep += 1;
            paintTutorialStep();
        } else {
            finishTutorial();
        }
    });
    tutorialSkip.addEventListener('click', finishTutorial);
    document.addEventListener('keydown', event => {
        if (event.code === 'Escape' && !tutorialDialog.hidden) {
            event.preventDefault();
            tutorialDialog.hidden = true;
            startScreen.inert = false;
            startButton.focus();
        }
    });
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
    paintAmmoPips();
    refreshHealth();
    paintAchievements();
    if (!gameActive) {
        jumpState = initialJump();
        camera.position.y = EYE_HEIGHT;
    }
    gameActive = true;
    paused = false;
    hudSecond = -1;
    clearInput();
    if (zombies.length === 0) {
        spawnZombie();
        spawnZombie();
    }
}

function setupLights() {
    lighting = setupLighting(scene, camera);
}

// =================================
// CIELO: DEGRADADO, ESTRELLAS, LUNA Y NUBES
// =================================

function setupSky() {

    skyMaterial = new THREE.ShaderMaterial({

        side: THREE.BackSide,
        depthWrite: false,
        fog: false,

        uniforms: {

            uTime: { value: 0 },

            uHorizon: { value: new THREE.Color(0x141a1d) },

            uZenith: { value: new THREE.Color(0x04070d) },

            uDusk: { value: new THREE.Color(0x3a1f22) },

            uMoonDir: { value: new THREE.Vector3(0.42, 0.48, 0.55).normalize() }

        },

        vertexShader: /* glsl */`
            varying vec3 vDir;

            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,

        fragmentShader: /* glsl */`
            uniform float uTime;
            uniform vec3 uHorizon;
            uniform vec3 uZenith;
            uniform vec3 uDusk;
            uniform vec3 uMoonDir;

            varying vec3 vDir;

            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);

                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));

                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float value = 0.0;
                float amplitude = 0.5;

                for (int i = 0; i < 4; i++) {
                    value += amplitude * noise(p);
                    p = p * 2.03 + 11.7;
                    amplitude *= 0.5;
                }

                return value;
            }

            void main() {
                vec3 dir = normalize(vDir);
                float height = clamp(dir.y, -0.2, 1.0);

                // Anochecer: zenit casi negro, horizonte sucio y cálido.
                vec3 color = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, height));
                color += uDusk * pow(1.0 - clamp(height, 0.0, 1.0), 7.0) * 0.55;

                // Estrellas: puntos redondos con parpadeo lento.
                vec2 starSpace = vec2(atan(dir.z, dir.x) * 80.0, dir.y * 160.0);
                vec2 starCell = floor(starSpace);
                vec2 starLocal = fract(starSpace) - 0.5;
                float starSeed = hash21(starCell);
                float starMask = smoothstep(0.42, 0.04, length(starLocal));
                float star = step(0.993, starSeed) * starMask * smoothstep(0.02, 0.3, dir.y);
                float twinkle = 0.6 + 0.4 * sin(uTime * 1.7 + starSeed * 90.0);
                color += vec3(0.82, 0.88, 1.0) * star * twinkle * 0.7;

                // Luna: disco duro y halo frío.
                float moonDot = dot(dir, uMoonDir);
                color += vec3(0.95, 0.97, 1.0) * smoothstep(0.9992, 0.9997, moonDot) * 2.0;
                color += vec3(0.32, 0.44, 0.66) * pow(max(moonDot, 0.0), 120.0) * 0.55;

                // Nubes fbm a la deriva.
                vec2 cloudUv = dir.xz / max(dir.y + 0.28, 0.12);
                float clouds = smoothstep(0.5, 0.92, fbm(cloudUv * 1.35 + vec2(uTime * 0.008, uTime * 0.004)));
                clouds *= smoothstep(0.0, 0.3, dir.y);

                vec3 cloudColor = vec3(0.045, 0.062, 0.085) + uDusk * 0.12;
                cloudColor += vec3(0.28, 0.33, 0.42) * pow(max(moonDot, 0.0), 24.0);

                color = mix(color, cloudColor, clouds * 0.85);

                // Calima del horizonte: mismo valor lineal que la niebla
                // (0x0a0f0e) para que el suelo se funda sin costura.
                color = mix(vec3(0.0031, 0.0048, 0.0042), color, smoothstep(-0.04, 0.42, dir.y));

                gl_FragColor = vec4(color, 1.0);
            }
        `

    });

    sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 24), skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;

    scene.add(sky);
}

// =================================
// CALIDAD GRÁFICA (Q)
// =================================

function applyGraphicsQuality() {
    if (post) post.setQuality(qualityMode);
    renderer.shadowMap.enabled = qualityMode !== 'low';
    if (lighting) {
        if (lighting.flashlight) lighting.flashlight.castShadow = qualityMode !== 'low';
        if (lighting.moon) lighting.moon.castShadow = qualityMode === 'high';
    }
    document.querySelectorAll('.graphics-option').forEach((button) => {
        const selected = button.dataset.quality === qualityMode;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    try { localStorage.setItem('zombieGraphicsQuality', qualityMode); } catch (_) { /* almacenamiento opcional */ }
}

function setupGraphicsSelector() {
    document.querySelectorAll('.graphics-option').forEach((button) => {
        button.addEventListener('click', () => {
            qualityMode = button.dataset.quality;
            applyGraphicsQuality();
        });
    });
    applyGraphicsQuality();
}

function cycleQuality() {
    const order = ['high', 'medium', 'low'];
    qualityMode = order[(order.indexOf(qualityMode) + 1) % order.length];
    applyGraphicsQuality();
    if (gameError) {
        const labels = { high: 'Cinemático', medium: 'Equilibrado', low: 'Rendimiento' };
        gameError.textContent = `Calidad gráfica: ${labels[qualityMode]}`;
        gameError.classList.remove('hidden');
        window.setTimeout(() => gameError.classList.add('hidden'), 1400);
    }
}

// =================================
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
    // Terreno del bosque (material PBR del manifiesto o el procedural).
    const ground = createGroundMesh(assetBundle);
    scene.add(ground);

    const MAT = getMaterials(assetBundle);

    // =================================
    // BOSQUE INSTANCIADO
    //
    // Los props se colocan primero como matrices y despues se
    // agrupan en un InstancedMesh por geometria/material: el bosque
    // entero son unos pocos draw calls en vez de ~480 mallas.
    // =================================

    const treePlacements = [];
    const reservedForestZones = [
        { x: 0, z: -34, radius: 8.5 },
        { x: -39, z: 35, radius: 4.5 }
    ];
    const isReservedForestPosition = (x, z) => reservedForestZones.some(zone =>
        Math.hypot(x - zone.x, z - zone.z) < zone.radius
    );

    for (let i = 0; i < 130; i++) {

        const x = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 100;

        if (Math.hypot(x, z) < 7 || isReservedForestPosition(x, z)) continue;

        treePlacements.push({
            x,
            y: 0,
            z,
            rotationY: Math.random() * Math.PI * 2,
            scale: 0.85 + Math.random() * 0.35
        });

        // La colision no necesita la malla: el rayo de los disparos
        // golpea el InstancedMesh completo (anadido a bulletBlockers).
        obstacles.push({ x, z, radius: 0.45 });
    }

    const treeMeshes = buildTreeBatches(treePlacements, MAT);

    for (const mesh of treeMeshes) {

        mesh.userData.blocksBullets = true;
        bulletBlockers.push(mesh);
        scene.add(mesh);

    }

    // =================================
    // VEGETACION ADICIONAL DEL BOSQUE
    // =================================

    const bushPlacements = [];

    for (let i = 0; i < 110; i++) {

        const x = (Math.random() - 0.5) * 90;
        const z = (Math.random() - 0.5) * 90;

        if (Math.hypot(x, z) < 9 || isReservedForestPosition(x, z)) continue;

        bushPlacements.push({
            x,
            y: 0.35,
            z,
            rotationY: Math.random() * Math.PI * 2,
            scale: new THREE.Vector3(
                1 + Math.random() * 0.6,
                0.7 + Math.random() * 0.4,
                1 + Math.random() * 0.6
            )
        });

    }

    const bushTemplate = new THREE.Group();

    const bushMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.48, 0),
        MAT.bush
    );

    bushMesh.name = 'bush-foliage';
    bushTemplate.add(bushMesh);

    for (const mesh of instanceFromObject(bushTemplate, bushPlacements, {
        name: 'bush',
        castShadowFilter: () => false
    })) {

        scene.add(mesh);

    }

    // Rocas: una sola dodecaedro unitario, el tamano va en la matriz.
    const rockTemplate = new THREE.Group();

    const rockMesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 0),
        MAT.rock
    );

    rockMesh.name = 'rock';
    rockTemplate.add(rockMesh);

    const rockPlacements = [];

    for (let i = 0; i < 50; i++) {

        const x = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 100;

        if (Math.hypot(x, z) < 5 || isReservedForestPosition(x, z)) continue;

        const radius = Math.random() * 0.5 + 0.2;

        rockPlacements.push({
            x,
            y: 0.1,
            z,
            rotationY: Math.random() * Math.PI * 2,
            scale: new THREE.Vector3(radius, radius * 0.5, radius)
        });

        obstacles.push({ x, z, radius: radius + 0.15 });
    }

    for (const mesh of instanceFromObject(rockTemplate, rockPlacements, { name: 'rock' })) {

        mesh.userData.blocksBullets = true;
        bulletBlockers.push(mesh);
        scene.add(mesh);

    }

    // Casas del bosque
    createHouse(-15, -15);
    createHouse(18, -20);
    createHouse(-20, 22);
    createHouse(25, 20);
    // Nuevas casas del bosque
    createHouse(-34, 0);
    createHouse(34, 0);

    // Punto de interés: campamento de exploradores con fogata y refugio.
    createForestCampsite(0, -34);
    createSupplyCache(3.2, -31.2, 'Suministros del campamento');
    createSupplyCache(-39, 35, 'Reserva del sendero');
}

/**
 * Un lote por arbol del manifiesto (o el pino procedural de siempre
 * cuando no hay GLB). Las hojas no proyectan sombra: son la parte
 * cara del pase de sombras y a esta hora leen como silueta.
 */
function buildTreeBatches(placements, MAT) {

    if (placements.length === 0) return [];

    // GLB: un lote por plantilla, repartiendo las posiciones al azar.
    if (assetBundle && assetBundle.trees && assetBundle.trees.length > 0) {

        const buckets = assetBundle.trees.map(() => []);
        const meshes = [];

        // Template 0 (the pine) fills the forest. The photo-scanned extras
        // (40k-80k triangles each) are capped at a few accents per template;
        // spreading them evenly dropped the game to 9 FPS.
        const SCAN_CAP = 5;

        for (const placement of placements) {

            const extra = 1 + Math.floor(Math.random() * Math.max(1, assetBundle.trees.length - 1));
            const useExtra = assetBundle.trees.length > 1 && Math.random() < 0.12 && buckets[extra].length < SCAN_CAP;
            buckets[useExtra ? extra : 0].push(placement);

        }

        assetBundle.trees.forEach((template, index) => {

            const batch = instanceFromObject(template, buckets[index], {
                name: `pine-${index}`,
                castShadowFilter: (part) => !isFoliage(part)
            });

            meshes.push(...batch);

        });

        return meshes;

    }

    // Procedural: tronco + tres pisos de copa, instanciados igual.
    const template = new THREE.Group();

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.32, 5, 10),
        MAT.bark
    );

    trunk.name = 'pine-trunk';
    trunk.position.y = 2.5;
    template.add(trunk);

    const coneGeometry = new THREE.ConeGeometry(1.8, 3.8, 12);

    for (let tier = 0; tier < 3; tier++) {

        const crown = new THREE.Mesh(coneGeometry, MAT.foliage);

        crown.name = 'pine-foliage';
        crown.position.y = 4.3 + tier * 1.2;
        crown.scale.setScalar(1 - tier * 0.2);
        template.add(crown);

    }

    return instanceFromObject(template, placements, {
        name: 'pine',
        castShadowFilter: (part) => !isFoliage(part)
    });

}

function isFoliage(part) {

    const materialName = part.material && part.material.name ? part.material.name : '';
    const meshName = part.name || '';

    return /green|leaf|leaves|foliage|needle|pine-crown/i.test(`${materialName} ${meshName}`);

}

function setupVillageMap() {
    const ground = createGroundMesh(assetBundle, { y: -0.02 });
    scene.add(ground);

    // Carretera central con marcas discontinuas instanciadas.
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 120),
        new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.98 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);

    const laneMarks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.12, 0.025, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xb5a77a, roughness: 0.9 }),
        18
    );
    const markTransform = new THREE.Object3D();
    for (let i = 0; i < 18; i++) {
        markTransform.position.set(0, 0.035, -53 + i * 6.2);
        markTransform.updateMatrix();
        laneMarks.setMatrixAt(i, markTransform.matrix);
    }
    laneMarks.instanceMatrix.needsUpdate = true;
    laneMarks.castShadow = false;
    laneMarks.receiveShadow = false;
    scene.add(laneMarks);

    // Casas y sus puertas interactivas.
    [[-12, -12], [12, -12], [-12, 12], [12, 12], [-30, 26], [30, -26]]
        .forEach(([x, z]) => createHouse(x, z));

    // Contenedores: cada objeto se crea una sola vez (antes se repetían
    // barriles, barricadas y cajas dentro del bucle de contenedores).
    const containerGeometry = new THREE.BoxGeometry(2.5, 2, 5);
    const containerMaterial = new THREE.MeshStandardMaterial({ color: 0x465b50, roughness: 0.9 });
    const containerPositions = [[-7, -5], [7, 5], [-7, 25], [7, -25]];
    for (const [x, z] of containerPositions) {
        const container = new THREE.Mesh(containerGeometry, containerMaterial);
        container.position.set(x, 1, z);
        container.castShadow = true;
        container.receiveShadow = true;
        scene.add(container);
        obstacles.push({ x, z, halfWidth: 1.25, halfDepth: 2.5 });
        bulletBlockers.push(container);
    }

    // Barriles de la zona industrial.
    const barrelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.9, 10);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4932, roughness: 0.95 });
    const barrelPositions = [[-20, 0], [20, 0], [-5, 22], [5, -22], [-35, -12], [35, 12], [-5, 40], [5, -40]];
    for (const [x, z] of barrelPositions) {
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.position.set(x, 0.45, z);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        scene.add(barrel);
        obstacles.push({ x, z, radius: 0.48 });
        bulletBlockers.push(barrel);
    }

    // Barricadas que crean rutas alternativas entre las casas.
    const barrierGeometry = new THREE.BoxGeometry(3.2, 0.85, 0.4);
    const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x70523b, roughness: 1 });
    const barrierPositions = [[-5, -30], [5, 30], [-24, -15], [24, 15]];
    for (const [x, z] of barrierPositions) {
        const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
        barrier.position.set(x, 0.425, z);
        barrier.castShadow = true;
        barrier.receiveShadow = true;
        scene.add(barrier);
        obstacles.push({ x, z, halfWidth: 1.6, halfDepth: 0.2 });
        bulletBlockers.push(barrier);
    }

    // Cajas decorativas del almacén.
    const crateGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x66503a, roughness: 1 });
    const cratePositions = [[-22, -28], [22, 28], [-38, 0], [38, 0]];
    for (const [x, z] of cratePositions) {
        const crate = new THREE.Mesh(crateGeometry, crateMaterial);
        crate.position.set(x, 0.6, z);
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);
        obstacles.push({ x, z, halfWidth: 0.65, halfDepth: 0.65 });
        bulletBlockers.push(crate);
    }

    createVillageStreetLights();
    createWreckedCar(22, 35);
    createSupplyCache(-14, 42, 'Suministros del extremo norte');
    createSupplyCache(14, -42, 'Suministros del extremo sur');

    scene.background = new THREE.Color(0x080d10);
    scene.fog = new THREE.FogExp2(0x0a0f0e, 0.012);
}

// Geometrías y materiales compartidos para mantener bajo el coste del escenario.
const cacheBodyGeometry = new THREE.BoxGeometry(1.15, 0.72, 0.82);
const cacheLidGeometry = new THREE.BoxGeometry(1.2, 0.18, 0.88);
const cacheBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x344b42, roughness: 0.9 });
const cacheLidMaterial = new THREE.MeshStandardMaterial({ color: 0x52664d, roughness: 0.86 });
const cacheGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fe6c7,
    emissive: 0x286d54,
    emissiveIntensity: 0.9,
    roughness: 0.5
});

function createSupplyCache(x, z, label) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(cacheBodyGeometry, cacheBodyMaterial);
    body.position.y = 0.38;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.74, -0.4);
    const lid = new THREE.Mesh(cacheLidGeometry, cacheLidMaterial);
    lid.position.set(0, 0.09, 0.4);
    lid.castShadow = true;
    lid.receiveShadow = true;
    lidPivot.add(lid);
    group.add(lidPivot);

    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.035), cacheGlowMaterial);
    glow.position.set(0, 0.43, 0.425);
    group.add(glow);

    group.position.set(x, 0, z);
    scene.add(group);
    supplyCaches.push({ x, z, label, group, lidPivot, glow, used: false });
    obstacles.push({ x, z, radius: 0.72 });
    bulletBlockers.push(group);
}

function createForestCampsite(x, z) {
    const camp = new THREE.Group();
    const canvasMaterial = new THREE.MeshStandardMaterial({ color: 0x52614b, roughness: 1, side: THREE.DoubleSide });
    const darkCanvas = new THREE.MeshStandardMaterial({ color: 0x222d2a, roughness: 1, side: THREE.DoubleSide });
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.35, 4), canvasMaterial);
    tent.position.set(-2.8, 1.18, 0);
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;
    tent.receiveShadow = true;
    camp.add(tent);

    const entrance = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.15), darkCanvas);
    entrance.position.set(-2.8, 0.62, 1.38);
    camp.add(entrance);

    const logGeometry = new THREE.CylinderGeometry(0.2, 0.23, 2.3, 7);
    const logMaterial = new THREE.MeshStandardMaterial({ color: 0x59402c, roughness: 1 });
    for (const [lx, lz, rotation] of [[1.1, 1.4, 0.18], [1.1, 1.4, -0.18]]) {
        const log = new THREE.Mesh(logGeometry, logMaterial);
        log.position.set(lx, 0.2, lz);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = rotation;
        log.castShadow = true;
        camp.add(log);
    }

    const stoneGeometry = new THREE.DodecahedronGeometry(0.22, 0);
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x515653, roughness: 1 });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
        stone.position.set(2.2 + Math.cos(angle) * 0.72, 0.13, 0.7 + Math.sin(angle) * 0.72);
        stone.scale.set(1, 0.7, 1);
        camp.add(stone);
    }

    const flameOuter = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 1.05, 6),
        new THREE.MeshBasicMaterial({ color: 0xff7a32 })
    );
    flameOuter.position.set(2.2, 0.55, 0.7);
    camp.add(flameOuter);
    const flameInner = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.65, 5),
        new THREE.MeshBasicMaterial({ color: 0xffd27a })
    );
    flameInner.position.set(2.2, 0.42, 0.7);
    camp.add(flameInner);

    // Un único punto de luz cálida para dar identidad al campamento.
    const fireLight = new THREE.PointLight(0xffa35b, 2.0, 13, 2);
    fireLight.position.set(2.2, 1.0, 0.7);
    camp.add(fireLight);
    worldFlickerLights.push({ light: fireLight, base: 2.0, speed: 7.5, phase: 0.8 });

    const signPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 2.0, 6),
        logMaterial
    );
    signPost.position.set(-5.2, 1, 1.4);
    camp.add(signPost);
    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.55, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x59402c, roughness: 1 })
    );
    sign.position.set(-5.2, 1.75, 1.4);
    camp.add(sign);

    camp.position.set(x, 0, z);
    scene.add(camp);
}

function createVillageStreetLights() {
    const positions = [[-7.2, -38], [7.2, -38], [-7.2, 38], [7.2, 38]];
    const postGeometry = new THREE.CylinderGeometry(0.075, 0.12, 4.4, 7);
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x303a3b, metalness: 0.42, roughness: 0.68 });
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, positions.length);
    const armGeometry = new THREE.BoxGeometry(0.82, 0.09, 0.1);
    const arms = new THREE.InstancedMesh(armGeometry, postMaterial, positions.length);
    const bulbGeometry = new THREE.SphereGeometry(0.17, 8, 6);
    const bulbMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdf9a,
        emissive: 0x9d6a24,
        emissiveIntensity: 1.1,
        roughness: 0.45
    });
    const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, positions.length);
    const transform = new THREE.Object3D();

    positions.forEach(([x, z], index) => {
        transform.position.set(x, 2.2, z);
        transform.updateMatrix();
        posts.setMatrixAt(index, transform.matrix);

        transform.position.set(x + (x < 0 ? 0.34 : -0.34), 4.32, z);
        transform.rotation.z = x < 0 ? -0.08 : 0.08;
        transform.updateMatrix();
        arms.setMatrixAt(index, transform.matrix);

        transform.position.set(x + (x < 0 ? 0.68 : -0.68), 4.2, z);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        bulbs.setMatrixAt(index, transform.matrix);
    });

    posts.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    posts.castShadow = false;
    arms.castShadow = false;
    bulbs.castShadow = false;
    scene.add(posts, arms, bulbs);

    // Solo dos luces reales; las otras luminarias son materiales emisivos.
    for (const [x, z] of [[-7.2, -38], [7.2, 38]]) {
        const light = new THREE.PointLight(0xffc77d, 1.25, 12, 2);
        light.position.set(x, 3.9, z);
        scene.add(light);
        worldFlickerLights.push({ light, base: 1.25, speed: 1.6, phase: x * 0.1 });
    }
}

function createWreckedCar(x, z) {
    const car = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5553, roughness: 0.88, metalness: 0.16 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x263a40, roughness: 0.32, metalness: 0.12 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1b, roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.82, 1.75), bodyMaterial);
    body.position.y = 0.72;
    body.castShadow = true;
    body.receiveShadow = true;
    car.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.88, 1.48), glassMaterial);
    cabin.position.set(-0.25, 1.48, 0);
    cabin.castShadow = true;
    car.add(cabin);

    const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
    for (const wx of [-1.25, 1.25]) {
        for (const wz of [-0.9, 0.9]) {
            const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
            wheel.position.set(wx, 0.42, wz);
            wheel.rotation.x = Math.PI / 2;
            car.add(wheel);
        }
    }

    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd89a,
        emissive: 0x9c5f22,
        emissiveIntensity: 0.7
    });
    for (const side of [-0.52, 0.52]) {
        const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), headlightMaterial);
        headlight.position.set(1.92, 0.82, side);
        car.add(headlight);
    }

    car.position.set(x, 0, z);
    car.rotation.y = Math.PI / 2;
    scene.add(car);
    // El coche es un único obstáculo rectangular aproximado.
    obstacles.push({ x, z, halfWidth: 1.0, halfDepth: 2.05 });
    bulletBlockers.push(car);
}

// Interacciones del escenario: puertas y cajas de suministros.
const doorPrompt = document.createElement('div');
doorPrompt.className = 'door-prompt';
doorPrompt.style.display = 'none';
document.body.appendChild(doorPrompt);

let lastDoorPrompt = '';
function updateDoorInteraction() {
    if (!gameActive || paused) {
        nearbyDoor = null;
        nearbySupplyCache = null;
        doorPrompt.style.display = 'none';
        return;
    }

    nearbyDoor = null;
    nearbySupplyCache = null;
    let closestDistance = 2.8;

    for (const door of doors) {
        const distance = Math.hypot(camera.position.x - door.x, camera.position.z - door.z);
        if (distance < closestDistance) {
            closestDistance = distance;
            nearbyDoor = door;
            nearbySupplyCache = null;
        }
    }

    for (const cache of supplyCaches) {
        if (cache.used) continue;
        const distance = Math.hypot(camera.position.x - cache.x, camera.position.z - cache.z);
        if (distance < closestDistance) {
            closestDistance = distance;
            nearbySupplyCache = cache;
            nearbyDoor = null;
        }
    }

    let prompt = '';
    if (nearbySupplyCache) {
        prompt = 'Presiona <span class="door-key">E</span> para abrir suministros';
    } else if (nearbyDoor) {
        prompt = nearbyDoor.open
            ? 'Presiona <span class="door-key">E</span> para cerrar'
            : 'Presiona <span class="door-key">E</span> para abrir';
    }

    if (prompt) {
        if (prompt !== lastDoorPrompt) {
            doorPrompt.innerHTML = prompt;
            lastDoorPrompt = prompt;
        }
        if (doorPrompt.style.display !== 'block') doorPrompt.style.display = 'block';
    } else {
        if (doorPrompt.style.display !== 'none') doorPrompt.style.display = 'none';
        lastDoorPrompt = '';
    }
}

function openSupplyCache(cache) {
    if (!cache || cache.used) return;
    cache.used = true;
    cache.lidPivot.rotation.x = -1.05;
    cache.glow.visible = false;

    const previousHealth = health;
    health = Math.min(100, health + 25);
    const recoveredHealth = health - previousHealth;
    ammo = WEAPONS[currentWeapon].maxAmmo;
    weaponAmmo[currentWeapon] = ammo;
    if (ammoVal) ammoVal.textContent = String(ammo);
    paintAmmoPips();
    refreshHealth();
    queueToast(`Suministros: +${recoveredHealth} salud · cargador completo`);
    nearbySupplyCache = null;
    lastDoorPrompt = '';
    doorPrompt.style.display = 'none';
}

window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyE' || event.repeat || !gameActive || paused) return;

    if (nearbySupplyCache) {
        event.preventDefault();
        openSupplyCache(nearbySupplyCache);
        return;
    }

    if (!nearbyDoor) return;
    event.preventDefault();
    nearbyDoor.open = !nearbyDoor.open;
    nearbyDoor.pivot.rotation.y = nearbyDoor.open ? -Math.PI / 2 : 0;
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
    const colors = PLAYER_SKINS[player.skin] || PLAYER_SKINS.survivor;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.8 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: colors.head, roughness: 0.9 });
    const detailMaterial = new THREE.MeshStandardMaterial({ color: colors.detail, roughness: 0.85 });
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.0, 0.38),
        bodyMaterial
    );
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Cabeza.
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 10),
        headMaterial
    );
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);

    // Insignia de uniforme: comparte una geometría pequeña por jugador.
    const detail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), detailMaterial);
    detail.position.set(0, 1.19, 0.2);
    group.add(detail);
    group.userData.bodyMaterial = bodyMaterial;
    group.userData.headMaterial = headMaterial;
    group.userData.detailMaterial = detailMaterial;
    group.userData.skin = player.skin in PLAYER_SKINS ? player.skin : 'survivor';

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

    recolorRemotePlayer(model, player.skin);
    model.position.set(player.x, 0, player.z);
    model.rotation.y = player.rotationY || 0;
}

function publishUnregisteredLocalZombies() {
    if (!socket || !socket.connected) return;
    for (const zombie of zombies) {
        if (!zombie.localOwner || zombie.id || zombie.networkPending) continue;
        zombie.networkPending = true;
        socket.emit('zombie:create', {
            x: zombie.mesh.position.x,
            z: zombie.mesh.position.z,
            type: zombie.type,
            health: zombie.health,
            maxHealth: zombie.maxHealth,
            skin: zombie.skinId,
            clientSpawnId: zombie.clientSpawnId
        });
    }
}

function setupMultiplayer() {
    socket.on('connect', () => {
        console.log('Multijugador conectado:', socket.id, 'mapa:', selectedMap);
        socket.emit('player:skin', selectedPlayerSkin);

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
        // Los zombis locales permanecen en escena y se registran al reconectar.
        for (const zombie of zombies) {
            if (zombie.localOwner && !zombie.id) zombie.networkPending = false;
        }
        const status = document.getElementById('multiplayer-status');
        if (status) {
            status.textContent = 'MULTIJUGADOR · DESCONECTADO';
            status.classList.remove('is-connected');
            status.classList.add('is-disconnected');
        }
    });

    socket.on('players:initial', (players) => {
        players.forEach(player => {
            if (player.id !== socket.id) updateRemotePlayer(player);
        });
    });

    socket.on('player:joined', (player) => updateRemotePlayer(player));
    socket.on('player:moved', (player) => updateRemotePlayer(player));

    socket.on('player:skin', (player) => {
        const model = remotePlayers.get(player.id);
        if (model) recolorRemotePlayer(model, player.skin);
    });

    socket.on('player:left', (playerId) => {
        const model = remotePlayers.get(playerId);
        if (!model) return;
        scene.remove(model);
        model.traverse(object => {
            if (!object.isMesh) return;
            object.geometry.dispose();
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
            else object.material.dispose();
        });
        remotePlayers.delete(playerId);
    });

    socket.on('zombies:initial', (serverZombies = []) => {
        const serverIds = new Set(serverZombies.map(zombie => zombie.id));
        pendingServerZombies.clear();
        // Si el servidor limpió un registro vencido durante una desconexión larga,
        // se vuelve a registrar la copia local en lugar de dejarla desincronizada.
        for (const zombie of [...zombies]) {
            if (zombie.localOwner && zombie.id && !serverIds.has(zombie.id)) {
                zombie.id = null;
                zombie.networkPending = false;
            } else if (!zombie.localOwner && zombie.id && !serverIds.has(zombie.id)) {
                killZombie(zombie, { countScore: false, sync: false });
            }
        }
        serverZombies.forEach(addServerZombie);
        publishUnregisteredLocalZombies();
    });

    socket.on('zombie:created', (zombie) => addServerZombie(zombie));

    socket.on('zombie:rejected', ({ clientSpawnId } = {}) => {
        const local = zombies.find(item => item.localOwner && item.clientSpawnId === clientSpawnId);
        if (local) local.networkPending = false;
    });

    socket.on('zombie:updated', ({ id, health: serverHealth } = {}) => {
        if (!Number.isFinite(serverHealth)) return;
        const zombie = zombies.find(item => item.id === id);
        if (zombie) zombie.health = Math.min(zombie.health, serverHealth);
        const pending = pendingServerZombies.get(id);
        if (pending) pending.health = Math.min(pending.health, serverHealth);
    });

    socket.on('zombie:removed', (id) => {
        pendingServerZombies.delete(id);
        const zombie = zombies.find(item => item.id === id);
        if (zombie) killZombie(zombie, { countScore: false, sync: false });
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

                refreshHealth();

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
    // Limitar enemigos visibles evita caída progresiva de FPS.
    if (zombies.length >= maxActiveZombies(qualityMode)) return;

    const settings = difficulty(elapsed);

    const type = chooseType(settings.level, Math.random());

    const stats = TYPES[type];

    if (!stats) return;

    const skinId = chooseZombieSkin();

    // Cuerpo: GLB animado por esqueleto si el manifiesto lo trae,
    // si no el cuerpo procedural de siempre.
    const visual = createZombieVisual({
        stats,
        skinId,
        eyeColor: getZombieEyeColor(skinId)
    });

    const group = visual.group;
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
        damage: stats.damage, type, limbs: visual.limbs, phase: Math.random() * Math.PI * 2,
        attackCooldown: 0,
        mixer: visual.mixer,
        actions: visual.actions,
        currentAction: visual.currentAction,
        isSkinned: visual.isSkinned,
        localOwner: true,
        networkPending: false,
        clientSpawnId: ++nextClientZombieSequence
    };
    group.traverse((part) => { part.userData.zombie = zombieData; });

    scene.add(group);
    zombies.push(zombieData);
    publishUnregisteredLocalZombies();
}
function addServerZombie(data) {
    if (!data || !data.id || zombies.some(z => z.id === data.id) || pendingServerZombies.has(data.id)) return;

    // El servidor confirma el ID de un zombi local sin crear otra malla.
    if (socket && data.ownerId === socket.id) {
        const owned = findOwnSpawn(zombies, data, socket.id);
        if (owned) {
            owned.id = data.id;
            owned.networkPending = false;
        } else {
            socket.emit('zombie:remove', data.id);
        }
        return;
    }

    // Si la escena alcanzó su límite visual, se conserva el evento en cola.
    // Así el zombi no se pierde definitivamente: entra cuando haya un espacio.
    if (zombies.length >= maxVisibleZombies(qualityMode)) {
        pendingServerZombies.set(data.id, data);
        return;
    }

    const stats = TYPES[data.type];
    if (!stats) return;
    const skinId = ZOMBIE_SKINS.includes(data.skin) ? data.skin : 'classic';
    const visual = createZombieVisual({ stats, skinId, eyeColor: getZombieEyeColor(skinId) });
    const group = visual.group;
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
        skinId,
        limbs: visual.limbs,
        phase: Math.random() * Math.PI * 2,
        attackCooldown: 0,
        mixer: visual.mixer,
        actions: visual.actions,
        currentAction: visual.currentAction,
        isSkinned: visual.isSkinned,
        localOwner: false,
        networkPending: false
    };

    group.traverse(part => { part.userData.zombie = zombieData; });
    scene.add(group);
    zombies.push(zombieData);
}

function drainPendingServerZombies() {
    while (pendingServerZombies.size > 0 && zombies.length < maxVisibleZombies(qualityMode)) {
        const [id, data] = pendingServerZombies.entries().next().value;
        pendingServerZombies.delete(id);
        addServerZombie(data);
    }
}


// Crear partículas de sangre
function spawnBloodParticles(position, count = 5) {

    for (let i = 0; i < count; i++) {

        // Reutilizar las mismas mallas y vectores evita basura en cada disparo.
        const particle = reusableBloodParticles.pop() || {
            mesh: new THREE.Mesh(bloodParticleGeometry, bloodParticleMaterial),
            velocity: new THREE.Vector3(),
            life: 0
        };
        particle.mesh.position.copy(position);
        particle.velocity.set(
            (Math.random() - 0.5) * 2,
            Math.random() * 1.8 + 0.3,
            (Math.random() - 0.5) * 2
        );
        particle.life = 0.45 + Math.random() * 0.2;
        scene.add(particle.mesh);
        bloodParticles.push(particle);
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
            if (reusableBloodParticles.length < MAX_REUSABLE_BLOOD) reusableBloodParticles.push(particle);
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
  


    ammo--;
    ammoVal.textContent = ammo;
    paintAmmoPips();

    // Cada arma tiene su propia cadencia de disparo.
    shotTimer = weaponStats.fireRate;
    recoil = 1;

    // Fogonazo: la luz sube de golpe y decae rápido en updateCombat.
    if (weapon && weapon.light) {

        // Fogonazo corto y fuerte: el bloom (umbral 1.15) lo recoge.
        weapon.light.intensity = 46;

        // Quads cruzados con giro/escala aleatorios (~55 ms de vida);
        // el fallback conserva el viejo comportamiento visible.
        if (weapon.triggerFlash) weapon.triggerFlash();
        else weapon.flash.visible = true;

    }

    if (post) {

        post.gradeUniforms.uFlash.value = 0.75;

    }

    weaponStatus.textContent =
        ammo <= 3
            ? 'R · RECARGAR'
            : weaponStats.name;

    scene.updateMatrixWorld(true);

    // Obstáculos estáticos ya están precalculados; solo añadimos zombis vivos.
    const targets = [...zombies.map((zombie) => zombie.mesh), ...staticBulletTargets];

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

const appliedDamage = weaponStats.damage * damageMultiplier;
        zombie.health -= appliedDamage;
        if (zombie.id && socket && socket.connected && zombie.health > 0) {
            socket.emit('zombie:damage', { id: zombie.id, damage: appliedDamage });
        }

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

            killZombie(zombie);
        }
    }

    if (hitSomething) {
        hitMarker.classList.remove('visible');
        void hitMarker.offsetWidth;
        hitMarker.classList.add('visible');
    }
}



/**
 * Retire a zombie: play its death clip when the GLB has one,
 * otherwise fade the current clip out and let the body tip over and
 * sink. Shared by the raycast hit and the debug hook.
 */
function killZombie(zombie, { countScore = true, sync = true } = {}) {

    if (!zombie || !zombies.includes(zombie)) return;
    if (sync && zombie.id && socket && socket.connected) {
        socket.emit('zombie:remove', zombie.id);
    }

    const hasDeathClip = playZombieDeath(zombie);

    if (!hasDeathClip) fadeZombieActions(zombie, 0.22);

    dyingZombies.push({
        zombie,
        timer: 3.0,
        age: 0,
        fall: !hasDeathClip,
        fallDir: Math.random() < 0.5 ? 1 : -1
    });

    zombies = zombies.filter((current) => current !== zombie);
    drainPendingServerZombies();

    if (countScore) {
        score += 1;
        if (scoreVal) scoreVal.innerText = String(score).padStart(2, '0');
        checkAchievements();
    }
}

// Buscar únicamente obstáculos próximos; mismas formas y distancias de colisión.
const zombieDirection = new THREE.Vector3();
const zombieMoveDirection = new THREE.Vector3();
function isZombieRouteBlocked(zombie, dx, dz, radius) {
    const x = zombie.mesh.position.x + dx * 0.8;
    const z = zombie.mesh.position.z + dz * 0.8;
    const candidates = obstacleIndex ? obstacleIndex.query(x, z, radius + 0.15) : null;
    const count = candidates ? candidates.length : obstacles.length;
    for (let i = 0; i < count; i++) {
        const o = obstacles[candidates ? candidates[i] : i];
        if (o.active === false) continue;
        if (typeof o.radius === 'number') {
            const ox = x - o.x, oz = z - o.z;
            const limit = radius + o.radius + 0.15;
            if (ox * ox + oz * oz < limit * limit) return true;
        } else if (typeof o.halfWidth === 'number') {
            if (Math.abs(x - o.x) < o.halfWidth + radius + 0.15 &&
                Math.abs(z - o.z) < o.halfDepth + radius + 0.15) return true;
        }
    }
    return false;
}

let zombieAiAccumulator = 0;
const ZOMBIE_AI_INTERVAL = 1 / 20;
function updateZombies(delta) {
    zombieAiAccumulator = Math.min(0.12, zombieAiAccumulator + delta);
    if (zombieAiAccumulator >= ZOMBIE_AI_INTERVAL) {
        const aiStep = zombieAiAccumulator;
        zombieAiAccumulator = 0;
        updateZombieAI(aiStep);
    }
    // Movimiento y animación a los FPS reales; solo las decisiones de ruta van a 20 Hz.
    for (const zombie of zombies) {
        const speed = zombie.currentMoveSpeed || 0;
        const moveDir = zombie.aiMoveDirection;
        const stopDistance = TYPES[zombie.type].scale;
        const dx = camera.position.x - zombie.mesh.position.x;
        const dz = camera.position.z - zombie.mesh.position.z;
        if (moveDir && dx * dx + dz * dz > stopDistance * stopDistance) {
            zombie.mesh.position.addScaledVector(moveDir, speed * delta);
        }
        resolveObstacles(zombie.mesh.position, 0.32 * TYPES[zombie.type].scale);
        zombie.phase += delta * speed * 4;
        zombie.mesh.position.y = Math.abs(Math.sin(zombie.phase * 2)) * 0.025;
        zombie.mesh.lookAt(camera.position.x, 0, camera.position.z);
        zombie.mesh.rotation.z = Math.sin(zombie.phase * 0.5) * 0.025;
        updateZombieVisual(zombie, delta, {
            walking: Boolean(zombie.wasWalking),
            attacking: Boolean(zombie.wasAttacking),
            speed
        });
    }
}

function updateZombieAI(delta) {
    // Los vectores reutilizables no se comparten con animaciones asíncronas.
    for (const z of zombies) {
        if (!gameActive) break;

        // 1. Detectar al jugador sin crear vectores nuevos en cada fotograma.
        const dir = zombieDirection.set(
            camera.position.x - z.mesh.position.x, 0,
            camera.position.z - z.mesh.position.z
        );
        const distance = dir.length();
        if (distance > 0.001) dir.multiplyScalar(1 / distance);

        // 2. Buscar una ruta que evite árboles y rocas
        const radius = 0.32 * TYPES[z.type].scale;
        // Velocidad reducida de los zombis
const moveSpeed = z.speed * 2.1;
       
        const moveDir = zombieMoveDirection.copy(dir);
        if (isZombieRouteBlocked(z, dir.x, dir.z, radius)) {
            const leftX = -dir.z;
            const leftZ = dir.x;
            const rightX = dir.z;
            const rightZ = -dir.x;
            if (!isZombieRouteBlocked(z, leftX, leftZ, radius)) {
                moveDir.set(leftX, 0, leftZ);
            } else if (!isZombieRouteBlocked(z, rightX, rightZ, radius)) {
                moveDir.set(rightX, 0, rightZ);
            }
        }

        // Guardar la dirección: el movimiento se interpola cada fotograma.
        if (!z.aiMoveDirection) z.aiMoveDirection = new THREE.Vector3();
        z.aiMoveDirection.copy(moveDir);

// Detectar si el zombi está cerca del jugador
const closeToPlayer =
    distance < 1.8 * TYPES[z.type].scale;

// Detectar si está caminando
const walking =
    distance > 1.05 * TYPES[z.type].scale;

z.wasWalking = walking;
z.wasAttacking = closeToPlayer;
z.currentMoveSpeed = moveSpeed;

        // Ataques y decisiones de IA se comprueban a 20 Hz.
        z.attackCooldown -= delta;

        const attackDistance = 1.2 * TYPES[z.type].scale;

        if (distance < attackDistance && z.attackCooldown <= 0) {
            health = Math.max(0, health - z.damage);

            z.attackCooldown = 1.0;
            damageTimer = 0.4;

            // La sangre del post-proceso sube en los bordes de la pantalla.
            if (post) {

                post.gradeUniforms.uDamage.value = Math.min(
                    1,
                    0.55 + z.damage * 0.06
                );

            }

            refreshHealth();

            if (health <= 0) {
                endGame();
            }
        }
    }
}


function endGame() {
    gameActive = false;
    paused = false;
    jumpState = initialJump();
    camera.position.y = EYE_HEIGHT;
    controls.unlock();
    finalScore.innerText = score;
    document.getElementById('final-wave').textContent = String(level).padStart(2, '0');
    document.getElementById('final-achievements').textContent = `${earnedIds.size}/${ACHIEVEMENTS.length}`;
    gameOverScreen.classList.remove('hidden');
    if (achievementsPanel) achievementsPanel.hidden = true;
    hud.classList.add('hidden');
    crosshair.classList.add('hidden');
    pauseScreen.classList.add('hidden');
}


function resolveObstacles(position, radius) {
    // Margen extra: también incluye los obstáculos próximos si una pared desplaza al jugador.
    const candidates = obstacleIndex ? obstacleIndex.query(position.x, position.z, radius + 3.5) : null;
    const count = candidates ? candidates.length : obstacles.length;
    for (let i = 0; i < count; i++) {
        const obstacle = obstacles[candidates ? candidates[i] : i];
        if (obstacle.active === false) continue;

        // Colisión circular: árboles y rocas
        if (typeof obstacle.radius === "number") {
            const dx = position.x - obstacle.x;
            const dz = position.z - obstacle.z;
            const distanceSquared = dx * dx + dz * dz;
            const limit = radius + obstacle.radius;

            if (distanceSquared < limit * limit) {
                const distance = Math.sqrt(distanceSquared);
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
            const distanceSquared = dx * dx + dz * dz;

            if (distanceSquared < radius * radius) {
                const distance = Math.sqrt(distanceSquared);
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
    const second = Math.floor(elapsed);
    if (second !== hudSecond) {
        hudSecond = second;
        if (countdown) countdown.textContent = `Siguiente oleada: ${secondsToNextWave(elapsed)} s`;
        checkAchievements();
    }
    refreshToast(delta);
    if (settings.level !== level) {
        level = settings.level;
        waveVal.textContent = String(level).padStart(2, '0');
        queueToast(`⚠ Oleada ${level}: aumentan los enemigos`);
        checkAchievements();
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
        paintAmmoPips();
    }
}

    if (firing) shoot();
    recoil = Math.max(0, recoil - delta * 12);
    const moving = moveForward || moveBackward || moveLeft || moveRight;
    const bob = moving && !reducedMotion ? Math.sin(elapsed * 11) * 0.009 : 0;
    // Pose base del arma en pantalla (debe coincidir con la de
    // visuals.js): el bucle solo anade bob, retroceso y recarga.
    weapon.gun.position.set(0.19, -0.3 + bob - (reloadTimer > 0 ? Math.sin(reloadTimer / RELOAD_SECONDS * Math.PI) * 0.22 : 0), -0.52 + recoil * 0.045);
    weapon.gun.rotation.x = recoil * 0.045 - (reloadTimer > 0 ? 0.35 : 0);
    weapon.light.intensity *= 0.78;

    // El fogonazo de quads vive ~55 ms desde el disparo; la luz
    // puntual sigue decayendo por su cuenta para el bloom.
    if (weapon.flash.visible && performance.now() > (weapon.flash.userData.until || 0)) {
        weapon.flash.visible = false;
    }

    if (weapon.light.intensity < 0.4) {

        weapon.light.intensity = 0;

    }

    damageTimer = Math.max(0, damageTimer - delta);
    damageOverlay.style.opacity = damageTimer / 0.4;
    spawnTimer += delta;
    if (spawnTimer >= settings.interval) { spawnZombie(); spawnTimer = 0; }
}

let fpsFrames = 0;
let fpsLastUpdate = performance.now();
const fpsElement = document.getElementById('fps-indicator');
function animate() {
    requestAnimationFrame(animate);
    fpsFrames += 1;
    const fpsNow = performance.now();
    if (fpsElement && fpsNow - fpsLastUpdate >= 1000) {
        const fps = Math.round(fpsFrames * 1000 / (fpsNow - fpsLastUpdate));
        fpsElement.textContent = `FPS ${fps}`;
        fpsElement.style.color = fps < 30 ? '#ffc7a2' : '#b7e0ce';
        fpsFrames = 0;
        fpsLastUpdate = fpsNow;
    }

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

        // Sólo se actualiza cuando la partida está activa: la pausa congela el salto.
        jumpState = updateJump(jumpState, delta);
        camera.position.y = EYE_HEIGHT + jumpState.height;
        resolveObstacles(camera.position, 0.38);
    }

    prevTime = time;

   
    // Actualizar el juego
    if (gameActive && !paused) {
        updateZombies(delta);
        updateCombat(delta);
        sendPlayerPosition(delta);
    }

    // Cadáveres que todavía están terminando su animación de muerte.
    updateDyingZombies(delta);

    // Reloj compartido por los shaders (viento y niebla) y luces.
    updateRenderTime(time * 0.001);

    if (lighting) lighting.update(delta);
    for (const entry of worldFlickerLights) {
        entry.light.intensity = entry.base * (0.9 + 0.1 * Math.sin(time * 0.001 * entry.speed + entry.phase));
    }

    // Capas de atmósfera (niebla a la deriva, fustes de luna).
    if (atmosphere) atmosphere.update(delta);

    // La pasada god-ray necesita la luna en UV de pantalla; si queda
    // detrás de la cámara, el aporte se apaga.
    if (post && post.setMoonUv && lighting && lighting.moon) {
        _moonUv.copy(lighting.moon.position).project(camera);
        const moonVisible = _moonUv.z < 1 &&
            _moonUv.x > -0.3 && _moonUv.x < 1.3 &&
            _moonUv.y > -0.3 && _moonUv.y < 1.3;
        post.setMoonUv(_moonUv.x * 0.5 + 0.5, _moonUv.y * 0.5 + 0.5, moonVisible);
    }

    // CORRECCIÓN: detectar puertas cercanas
    updateDoorInteraction();


    // Clima a 30 Hz y minimapa a 6 Hz: mismo funcionamiento con menos trabajo.
    if (gameActive && !paused) {
        weatherAccumulator += delta;
        if (weatherAccumulator >= 1 / 30) {
            updateWeather(Math.min(weatherAccumulator, 0.1));
            weatherAccumulator = 0;
        }
        minimapAccumulator += delta;
        if (minimapAccumulator >= 1 / 6) {
            updateMinimap();
            minimapAccumulator = 0;
        }
    }

    // El cielo sigue a la cámara y sus nubes avanzan con el tiempo real.
    if (sky) {

        sky.position.copy(camera.position);

        if (skyMaterial) {

            skyMaterial.uniforms.uTime.value = time * 0.001;

        }

    }

    // Dibujar escena 3D con post-proceso
    if (post) {

        post.render(delta);

    } else {

        renderer.render(scene, camera);

    }

}


// Cadáveres: o el clip de muerte sigue reproduciéndose, o el cuerpo
// se voltea (0.5 s), cae, se hunde y se desvanece. La malla se retira
// al final y se liberan sus materiales clonados.
const DEATH_FALL_SECONDS = 0.5;

function updateDyingZombies(delta) {

    for (let i = dyingZombies.length - 1; i >= 0; i--) {

        const entry = dyingZombies[i];
        const zombie = entry.zombie;
        const mesh = zombie.mesh;

        entry.timer -= delta;
        entry.age += delta;

        if (zombie.mixer) zombie.mixer.update(delta);

        if (entry.fall && mesh) {

            // El grupo rota sobre los pies: el cuerpo se vuelca de
            // lado y la cabeza termina contra el suelo.
            const fall = Math.min(1, entry.age / DEATH_FALL_SECONDS);
            const eased = 1 - Math.pow(1 - fall, 3);

            mesh.rotation.x = -Math.PI * 0.5 * eased * entry.fallDir;

            const sinkStart = DEATH_FALL_SECONDS + 0.45;
            const sink = Math.max(0, Math.min(1, (entry.age - sinkStart) / 1.1));

            mesh.position.y = -0.05 * eased - 0.9 * sink * sink;

            if (sink > 0.1) {
                setZombieFade(zombie, 1 - Math.min(1, (sink - 0.1) / 0.9));
            }

        }

        if (entry.timer <= 0 || !mesh || !mesh.parent) {

            if (mesh) scene.remove(mesh);
            disposeZombieVisual(zombie);
            dyingZombies.splice(i, 1);

        }

    }
}


try {
    init().catch((error) => {
        console.error('No se pudo iniciar la escena 3D:', error);
        gameError.textContent = 'No se pudo iniciar WebGL. Actualiza el navegador y comprueba que la aceleración por hardware esté activada.';
        gameError.classList.remove('hidden');
    });
} catch (error) {
    console.error('No se pudo iniciar la escena 3D:', error);
    gameError.textContent = 'No se pudo iniciar WebGL. Actualiza el navegador y comprueba que la aceleración por hardware esté activada.';
    gameError.classList.remove('hidden');
}
