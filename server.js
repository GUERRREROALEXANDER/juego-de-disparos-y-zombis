
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

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

// Página principal.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Lista temporal de jugadores conectados.
const players = new Map();

const zombies = new Map();
let nextZombieId = 1;

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    const player = {
        id: socket.id,
        role: 'superviviente',
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0
    };

    players.set(socket.id, player);

    // Enviar los jugadores existentes al recién conectado.
    socket.emit('players:initial', Array.from(players.values()));
socket.emit('zombies:initial', Array.from(zombies.values()));
    // Avisar a los demás que llegó un jugador.
    socket.broadcast.emit('player:joined', player);

    
    // Recibir y compartir movimientos.
    socket.on('player:move', (data) => {
        if (!data || typeof data !== 'object') return;

        const { x, y, z, rotationY } = data;

        if (![x, y, z, rotationY].every(Number.isFinite)) {
            return;
        }

        if (
            Math.abs(x) > 500 ||
            Math.abs(y) > 100 ||
            Math.abs(z) > 500
        ) {
            return;
        }

        player.x = x;
        player.y = y;
        player.z = z;
        player.rotationY = rotationY;

        socket.broadcast.emit('player:moved', player);
    });

    // Crear y compartir zombis.
    socket.on('zombie:create', (data) => {
        if (!data || typeof data !== 'object') return;

        const { x, z, type, health, maxHealth, skin } = data;

// Skins permitidas
const allowedSkins = [
    'classic',
    'military',
    'infected',
    'survivor'
];

// Validar apariencia
const skinId = allowedSkins.includes(skin)
    ? skin
    : 'classic';
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(z) ||
            Math.abs(x) > 48 ||
            Math.abs(z) > 48 ||
            !['walker', 'runner', 'brute'].includes(type) ||
            !Number.isFinite(health) ||
            !Number.isFinite(maxHealth) ||
            health <= 0 ||
            maxHealth <= 0 ||
            health > maxHealth ||
            zombies.size >= 24
        ) {
            return;
        }

        const zombie = {
    id: String(nextZombieId++),
    x,
    z,
    type,
    health,
    maxHealth,
    skin: skinId
};

        zombies.set(zombie.id, zombie);
        io.emit('zombie:created', zombie);
    });

   
    // Aplicar daño compartido a un zombi.
    socket.on('zombie:damage', (data) => {
        if (!data || typeof data !== 'object') return;

        const { id, damage } = data;

        if (
            typeof id !== 'string' ||
            !Number.isFinite(damage) ||
            damage <= 0 ||
            damage > 10
        ) return;

        const zombie = zombies.get(id);
        if (!zombie) return;

        zombie.health = Math.max(0, zombie.health - damage);

        if (zombie.health <= 0) {
            zombies.delete(id);
            io.emit('zombie:removed', id);
        } else {
            io.emit('zombie:updated', {
                id: zombie.id,
                health: zombie.health
            });
        }
    });

    // Eliminar al jugador cuando se desconecta.
    socket.on('disconnect', () => {
        players.delete(socket.id);
        io.emit('player:left', socket.id);

        console.log('Jugador desconectado:', socket.id);
    });
});

  

// Iniciar Express y Socket.IO en el mismo servidor.
server.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log(`🚀 Servidor iniciado en: http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log('🎮 Servidor preparado para conexiones multijugador');
    console.log('--------------------------------------------------');
});
