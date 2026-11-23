const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// CORS_ORIGINS: dominios separados por coma que pueden conectarse por Socket.IO
// (por ejemplo, el juego desplegado en Vercel). Sin la variable, solo el mismo origen.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const io = new Server(server, allowedOrigins.length ? { cors: { origin: allowedOrigins } } : {});

const PORT = process.env.PORT || 3000;
const VALID_MAPS = new Set(['forest', 'village']);
const MAX_ZOMBIES_PER_MAP = 24;
const DISCONNECTED_ZOMBIE_GRACE_MS = 120_000;

function roomFor(mapId) {
    return `map:${mapId}`;
}

// Servir archivos del videojuego.
app.use(express.static(__dirname));

// API para comprobar que el servidor funciona.
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor de Supervivencia Zombi 3D funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const players = new Map();
const zombies = new Map();
let nextZombieId = 1;

function activePlayersInMap(mapId) {
    for (const player of players.values()) {
        if (player.mapId === mapId) return true;
    }
    return false;
}

function zombiesInMap(mapId) {
    return [...zombies.values()].filter(zombie => zombie.mapId === mapId);
}

// Una desconexión breve no borra enemigos. Si el mapa queda vacío, se
// conservan durante un margen para permitir la reconexión automática.
function pruneExpiredZombies(mapId, now = Date.now()) {
    if (activePlayersInMap(mapId)) return;
    for (const [id, zombie] of zombies) {
        if (zombie.mapId !== mapId || !zombie.ownerDisconnectedAt) continue;
        if (now - zombie.ownerDisconnectedAt >= DISCONNECTED_ZOMBIE_GRACE_MS) {
            zombies.delete(id);
        }
    }
}

io.on('connection', (socket) => {
    const requestedMap = socket.handshake?.auth?.mapId;
    const mapId = VALID_MAPS.has(requestedMap) ? requestedMap : 'forest';
    const room = roomFor(mapId);

    // Limpiar partidas antiguas solo si no hay jugadores activos en el mapa.
    pruneExpiredZombies(mapId);
    socket.join(room);

    const player = {
        id: socket.id,
        role: 'superviviente',
        mapId,
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        skin: 'survivor'
    };
    players.set(socket.id, player);

    socket.emit('players:initial', [...players.values()].filter(item => item.mapId === mapId));
    socket.emit('zombies:initial', zombiesInMap(mapId));
    socket.to(room).emit('player:joined', player);

    socket.on('player:skin', (skin) => {
        if (!['survivor', 'military', 'medic', 'night'].includes(skin)) return;
        player.skin = skin;
        socket.to(room).emit('player:skin', { id: socket.id, skin });
    });

    socket.on('player:move', (data) => {
        if (!data || typeof data !== 'object') return;
        const { x, y, z, rotationY } = data;
        if (![x, y, z, rotationY].every(Number.isFinite)) return;
        if (Math.abs(x) > 500 || Math.abs(y) > 100 || Math.abs(z) > 500) return;

        player.x = x;
        player.y = y;
        player.z = z;
        player.rotationY = rotationY;
        socket.to(room).emit('player:moved', player);
    });

    socket.on('zombie:create', (data) => {
        if (!data || typeof data !== 'object') return;
        const { x, z, type, health, maxHealth, skin, clientSpawnId } = data;
        const allowedSkins = ['classic', 'military', 'infected', 'survivor'];
        const skinId = allowedSkins.includes(skin) ? skin : 'classic';

        if (
            !Number.isFinite(x) || !Number.isFinite(z) ||
            Math.abs(x) > 48 || Math.abs(z) > 48 ||
            !['walker', 'runner', 'brute'].includes(type) ||
            !Number.isFinite(health) || !Number.isFinite(maxHealth) ||
            health <= 0 || maxHealth <= 0 || health > maxHealth
        ) {
            socket.emit('zombie:rejected', { clientSpawnId, reason: 'invalid-data' });
            return;
        }

        // Reintentos de red no deben crear una segunda copia del mismo enemigo.
        if (Number.isSafeInteger(clientSpawnId)) {
            const existing = zombiesInMap(mapId).find(zombie =>
                zombie.ownerId === socket.id && zombie.clientSpawnId === clientSpawnId
            );
            if (existing) {
                socket.emit('zombie:created', existing);
                return;
            }
        }

        if (zombiesInMap(mapId).length >= MAX_ZOMBIES_PER_MAP) {
            socket.emit('zombie:rejected', { clientSpawnId, reason: 'map-capacity' });
            return;
        }

        const zombie = {
            id: String(nextZombieId++),
            x,
            z,
            type,
            health,
            maxHealth,
            skin: skinId,
            mapId,
            ownerId: socket.id,
            clientSpawnId: Number.isSafeInteger(clientSpawnId) ? clientSpawnId : null,
            ownerDisconnectedAt: null
        };

        zombies.set(zombie.id, zombie);
        io.to(room).emit('zombie:created', zombie);
    });

    socket.on('zombie:remove', (id) => {
        if (typeof id !== 'string') return;
        const zombie = zombies.get(id);
        if (!zombie || zombie.mapId !== mapId) return;
        zombies.delete(id);
        io.to(room).emit('zombie:removed', id);
    });

    socket.on('zombie:damage', (data) => {
        if (!data || typeof data !== 'object') return;
        const { id, damage } = data;
        if (typeof id !== 'string' || !Number.isFinite(damage) || damage <= 0 || damage > 100) return;

        const zombie = zombies.get(id);
        if (!zombie || zombie.mapId !== mapId) return;
        zombie.health = Math.max(0, zombie.health - damage);

        if (zombie.health <= 0) {
            zombies.delete(id);
            io.to(room).emit('zombie:removed', id);
        } else {
            io.to(room).emit('zombie:updated', { id: zombie.id, health: zombie.health });
        }
    });

    socket.on('disconnect', () => {
        players.delete(socket.id);
        socket.to(room).emit('player:left', socket.id);

        const disconnectedAt = Date.now();
        for (const zombie of zombies.values()) {
            if (zombie.mapId === mapId && zombie.ownerId === socket.id) {
                zombie.ownerDisconnectedAt = disconnectedAt;
            }
        }
        // No emitir zombie:removed aquí: Socket.IO puede reconectarse
        // automáticamente y los enemigos deben sobrevivir a una caída breve.
        console.log('Jugador desconectado:', socket.id, 'mapa:', mapId);
    });
});

server.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log(`🚀 Servidor iniciado en: http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log('🎮 Servidor preparado para conexiones multijugador');
    console.log('--------------------------------------------------');
});
