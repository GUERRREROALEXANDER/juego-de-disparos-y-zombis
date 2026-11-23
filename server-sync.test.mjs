import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const nativeRequire = createRequire(import.meta.url);

function serverHarness() {
    const callbacks = {};
    const delivered = [];
    const app = { use() {}, get() {} };
    function express() { return app; }
    express.static = () => () => {};
    const server = { listen() {} };
    const io = {
        on(name, callback) { callbacks[name] = callback; },
        emit(name, data) { delivered.push({ room: '*', name, data }); },
        to(room) {
            return { emit(name, data) { delivered.push({ room, name, data }); } };
        }
    };
    const sandbox = {
        require(name) {
            if (name === 'express') return express;
            if (name === 'http') return { createServer: () => server };
            if (name === 'socket.io') return { Server: class { constructor() { return io; } } };
            return nativeRequire(name);
        },
        __dirname: '/tmp',
        process: { env: {} },
        console: { log() {} },
        Date
    };
    vm.runInNewContext(readFileSync(new URL('./server.js', import.meta.url), 'utf8'), sandbox);

    function connect(id, mapId = 'forest') {
        const socketHandlers = {};
        const sent = [];
        const joined = [];
        const socket = {
            id,
            handshake: { auth: { mapId } },
            handlers: socketHandlers,
            sent,
            joined,
            emit(name, data) { sent.push({ name, data }); },
            on(name, cb) { socketHandlers[name] = cb; },
            join(room) { joined.push(room); },
            to(room) { return { emit(name, data) { delivered.push({ room, except: id, name, data }); } }; }
        };
        callbacks.connection(socket);
        return socket;
    }
    return { connect, delivered };
}

function createZombie(socket, clientSpawnId = 42) {
    socket.handlers['zombie:create']({
        x: 2, z: 3, type: 'walker', health: 30, maxHealth: 30,
        skin: 'classic', clientSpawnId
    });
}

test('el servidor confirma el ID y propietario de un zombi creado en su mapa', () => {
    const harness = serverHarness();
    const socket = harness.connect('player-1', 'forest');
    createZombie(socket);
    const created = harness.delivered.find(event => event.name === 'zombie:created');
    assert.ok(created);
    assert.equal(created.room, 'map:forest');
    assert.equal(created.data.id, '1');
    assert.equal(created.data.ownerId, 'player-1');
    assert.equal(created.data.clientSpawnId, 42);
});

test('los mapas mantienen sus propios jugadores y zombis', () => {
    const harness = serverHarness();
    const forest = harness.connect('forest-player', 'forest');
    createZombie(forest, 1);
    const village = harness.connect('village-player', 'village');
    const initial = village.sent.find(event => event.name === 'zombies:initial');
    assert.deepEqual([...initial.data], []);
    assert.ok(forest.joined.includes('map:forest'));
    assert.ok(village.joined.includes('map:village'));
    const villageZombie = {
        x: -2, z: 5, type: 'runner', health: 20, maxHealth: 20,
        skin: 'military', clientSpawnId: 2
    };
    village.handlers['zombie:create'](villageZombie);
    assert.ok(harness.delivered.some(event => event.room === 'map:village' && event.name === 'zombie:created'));
    assert.equal(harness.delivered.filter(event => event.room === 'map:forest' && event.name === 'zombie:created').length, 1);
});

test('una desconexión breve no elimina los zombis y la reconexión los recupera', () => {
    const harness = serverHarness();
    const first = harness.connect('player-1', 'forest');
    createZombie(first, 7);
    first.handlers.disconnect();
    assert.equal(harness.delivered.filter(event => event.name === 'zombie:removed').length, 0);

    const reconnected = harness.connect('player-1-reconnected', 'forest');
    const initial = reconnected.sent.find(event => event.name === 'zombies:initial');
    assert.equal(initial.data.length, 1);
    assert.equal(initial.data[0].clientSpawnId, 7);
    assert.equal(initial.data[0].ownerDisconnectedAt > 0, true);
});

test('reintentar la creación con el mismo ID de cliente no duplica el zombi', () => {
    const harness = serverHarness();
    const socket = harness.connect('player-1', 'forest');
    createZombie(socket, 9);
    createZombie(socket, 9);
    const created = harness.delivered.filter(event => event.name === 'zombie:created');
    const confirmations = socket.sent.filter(event => event.name === 'zombie:created');
    assert.equal(created.length, 1); // solo una creación real en la sala
    assert.equal(confirmations.length, 1); // el reintento recibe la misma confirmación
    assert.equal(created[0].data.id, confirmations[0].data.id);
});

test('eliminar un enemigo solo notifica a los jugadores del mismo mapa', () => {
    const harness = serverHarness();
    const forest = harness.connect('player-1', 'forest');
    const village = harness.connect('player-2', 'village');
    createZombie(forest, 11);
    const created = harness.delivered.find(event => event.name === 'zombie:created');
    forest.handlers['zombie:remove'](created.data.id);
    assert.ok(harness.delivered.some(event => event.room === 'map:forest' && event.name === 'zombie:removed'));
    assert.equal(harness.delivered.some(event => event.room === 'map:village' && event.name === 'zombie:removed'), false);
    assert.ok(village);
});

test('el daño compartido acepta daño de arma y actualiza la vida', () => {
    const harness = serverHarness();
    const socket = harness.connect('player-1', 'forest');
    createZombie(socket, 12);
    const created = harness.delivered.find(event => event.name === 'zombie:created');
    socket.handlers['zombie:damage']({ id: created.data.id, damage: 18 });
    const updated = harness.delivered.find(event => event.name === 'zombie:updated');
    assert.equal(updated.data.health, 12);
});
