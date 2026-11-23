import test from 'node:test';
import assert from 'node:assert/strict';
import { maxActiveZombies, maxVisibleZombies, findOwnSpawn } from './zombie-performance.mjs';

test('el limite por calidad mantiene un número acotado de enemigos', () => {
    assert.equal(maxActiveZombies('low'), 10);
    assert.equal(maxActiveZombies('medium'), 14);
    assert.equal(maxActiveZombies('high'), 18);
});

test('la confirmación del servidor se aplica al zombi original', () => {
    const local = { clientSpawnId: 7, localOwner: true };
    const remote = { clientSpawnId: 7, localOwner: false };
    assert.equal(findOwnSpawn([remote, local], { ownerId: 'yo', clientSpawnId: 7 }, 'yo'), local);
    assert.equal(findOwnSpawn([remote, local], { ownerId: 'otro', clientSpawnId: 7 }, 'yo'), null);
});

test('se ignoran confirmaciones sin identificador valido', () => {
    assert.equal(findOwnSpawn([], { ownerId: 'yo', clientSpawnId: '7' }, 'yo'), null);
});

test('el límite visible deja espacio para enemigos de otros jugadores sin perder eventos', () => {
    assert.equal(maxVisibleZombies('low'), 18);
    assert.equal(maxVisibleZombies('medium'), 22);
    assert.equal(maxVisibleZombies('high'), 24);
    assert.ok(maxVisibleZombies('low') > maxActiveZombies('low'));
});
