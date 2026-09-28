import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { MAGAZINE_SIZE, RELOAD_SECONDS, SHOT_INTERVAL, TYPES, difficulty, chooseType, shotDamage } from './combat.js';
import { makeWeapon, groundTexture, decorateZombie, disposeEnemy } from './visuals.js';
let weapon, elapsed = 0, ammo = MAGAZINE_SIZE, reloadTimer = 0, shotTimer = 0, recoil = 0, firing = false;
let damageTimer = 0, level = 1;
const obstacles = [];
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
    if (!gameActive || paused || reloadTimer > 0 || ammo === MAGAZINE_SIZE) return;
    reloadTimer = RELOAD_SECONDS;
    weaponStatus.textContent = 'RECARGANDO…';
}
// --- Configuración y Variables Globales ---
let scene, camera, renderer, controls;
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
let spawnTimer = 0;
const raycaster = new THREE.Raycaster();
const cameraRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const sceneContainer = document.getElementById('scene-container');

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
const gameError = document.getElementById('game-error');

// --- Inicialización ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07100d);
    scene.fog = new THREE.FogExp2(0x07100d, 0.022);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Altura ojos humana

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sceneContainer.appendChild(renderer.domElement);

    controls = new PointerLockControls(camera, document.body);

    // Eventos UI
    startButton.addEventListener('click', requestPointerLock);
    resumeButton.addEventListener('click', requestPointerLock);

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
            case 'KeyR': reload(); break;
            case 'KeyW': moveForward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyD': moveRight = true; break;
        }
    };
    const onKeyUp = (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyD': moveRight = false; break;
        }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
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

    // Disparo
    document.addEventListener('mousedown', (event) => {
        if (event.button === 0 && gameActive && !paused && (controls.isLocked || pointerLockUnavailable)) {
            firing = true;
            shoot();
        }
    });

    document.addEventListener('mouseup', () => { firing = false; });
    window.addEventListener('blur', () => {
        clearInput();
        if (!gameActive) return;
        if (controls.isLocked) controls.unlock();
        paused = true;
        pauseScreen.classList.remove('hidden');
        hud.classList.add('hidden');
        crosshair.classList.add('hidden');
    });
    setupLights();
    weapon = makeWeapon(camera);
    setupEnvironment();
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
    startRequested = false;
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    crosshair.classList.remove('hidden');
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

    // Linterna del jugador
    const flashlight = new THREE.SpotLight(0xe5edc9, 95, 34, Math.PI / 5, 0.55, 1.2);
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);
}

function setupEnvironment() {
    // Terreno (Suelo)
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x8c9980, map: groundTexture(), roughness: 0.93 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Bosque (Árboles y Rocas)
    for (let i = 0; i < 90; i++) {
        createTree(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100
        );
    }
    for (let i = 0; i < 30; i++) {
        createRock(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100
        );
    }
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
function spawnZombie() {
    const settings = difficulty(elapsed);
    if (!gameActive || zombies.length >= settings.cap) return;
    const type = chooseType(settings.level, Math.random());
    const stats = TYPES[type];

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
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe55b43 });
    for (const eyeX of [-0.08, 0.08]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(eyeX, 1.73, 0.205);
        group.add(eye);
    }

    const limbs = decorateZombie(group, headMat, bodyMat);
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
}

function shoot() {
    if (shotTimer > 0 || reloadTimer > 0 || !gameActive || paused) return;
    if (ammo <= 0) { reload(); return; }
    ammo--; ammoVal.textContent = ammo;
    shotTimer = SHOT_INTERVAL; recoil = 1;
    weaponStatus.textContent = ammo <= 6 ? 'R · RECARGAR' : 'FUSIL · AUTOMÁTICO';
    scene.updateMatrixWorld(true);
    const directionToTarget = new THREE.Vector3();
    camera.getWorldDirection(directionToTarget);
    raycaster.set(camera.position, directionToTarget);
    raycaster.far = 55;

    crosshair.classList.add('firing');
    window.setTimeout(() => crosshair.classList.remove('firing'), 90);

    const targets = [...zombies.flatMap((zombie) => zombie.mesh.children), ...obstacles.map(o => o.mesh)];
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;

    let zombie = hit.object.userData.zombie;
    let target = hit.object;
    while (!zombie && target.parent) {
        target = target.parent;
        zombie = target.userData.zombie;
    }
    if (!zombie) return;

    zombie.health -= shotDamage(Boolean(hit.object.userData.headshot));
    threatNote.textContent = TYPES[zombie.type].name + ' · ' + Math.max(0, zombie.health) + '/' + zombie.maxHealth;
    hitMarker.style.color = hit.object.userData.headshot ? '#ffc581' : '';
    hitMarker.classList.remove('visible');
    void hitMarker.offsetWidth;
    hitMarker.classList.add('visible');
    if (zombie.health <= 0) {
        scene.remove(zombie.mesh);
        disposeEnemy(zombie.mesh);
        zombies = zombies.filter((current) => current !== zombie);
        score += 1;
        scoreVal.innerText = String(score).padStart(2, '0');
    }
}

function updateZombies(delta) {
    zombies.forEach((z) => {
        if (!gameActive) return;
        const dir = new THREE.Vector3();
        dir.subVectors(camera.position, z.mesh.position);
        dir.y = 0;
        dir.normalize();
        const distance = Math.hypot(camera.position.x - z.mesh.position.x, camera.position.z - z.mesh.position.z);
        if (distance > 0.95 * TYPES[z.type].scale) z.mesh.position.addScaledVector(dir, z.speed * delta);
        resolveObstacles(z.mesh.position, 0.32 * TYPES[z.type].scale);
        z.phase += delta * z.speed * 4;
        z.limbs.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(z.phase + i * Math.PI) * 0.4; });
        z.limbs.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(z.phase + i * Math.PI) * 0.12; });
        z.mesh.lookAt(camera.position.x, 0, camera.position.z);

        z.attackCooldown -= delta;
        const horizontalDistance = Math.hypot(
            z.mesh.position.x - camera.position.x,
            z.mesh.position.z - camera.position.z
        );
        if (horizontalDistance < 1.2 * TYPES[z.type].scale) {
            if (z.attackCooldown <= 0) {
                health = Math.max(0, health - z.damage);
                z.attackCooldown = 0.9;
                damageTimer = 0.4;
                healthVal.innerText = health;
                healthFill.style.width = `${health}%`;
                healthFill.style.background = health <= 30 ? '#e5594e' : '';
            }
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
        const dx = position.x - obstacle.x, dz = position.z - obstacle.z;
        const distance = Math.hypot(dx, dz), limit = radius + obstacle.radius;
        if (distance < limit) {
            position.x += (distance > 0.001 ? dx / distance : 1) * (limit - distance);
            position.z += (distance > 0.001 ? dz / distance : 0) * (limit - distance);
        }
    }
    position.x = THREE.MathUtils.clamp(position.x, -48, 48);
    position.z = THREE.MathUtils.clamp(position.z, -48, 48);
}
function updateCombat(delta) {
    elapsed += delta;
    const settings = difficulty(elapsed);
    if (settings.level !== level) {
        level = settings.level;
        waveVal.textContent = String(level).padStart(2, '0');
        threatNote.textContent = level === 2 ? 'Corredores detectados' : level === 3 ? 'Colosos detectados' : 'La horda se intensifica';
    }
    shotTimer = Math.max(0, shotTimer - delta);
    if (reloadTimer > 0) {
        reloadTimer = Math.max(0, reloadTimer - delta);
        if (reloadTimer === 0) { ammo = MAGAZINE_SIZE; ammoVal.textContent = ammo; weaponStatus.textContent = 'FUSIL · AUTOMÁTICO'; }
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

        if (moveForward || moveBackward) velocity.z -= direction.z * 65.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 65.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        resolveObstacles(camera.position, 0.38);
    }
    prevTime = time;

    if (gameActive && !paused && (controls.isLocked || pointerLockUnavailable)) {
        updateZombies(delta);
        if (gameActive) updateCombat(delta);
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

try {
    init();
} catch (error) {
    console.error('No se pudo iniciar la escena 3D:', error);
    gameError.textContent = 'No se pudo iniciar WebGL. Actualiza el navegador y comprueba que la aceleración por hardware esté activada.';
    gameError.classList.remove('hidden');
}
