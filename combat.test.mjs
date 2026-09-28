import test from 'node:test';
import assert from 'node:assert/strict';
import { difficulty, chooseType, TYPES, shotDamage } from './combat.js';

test('la dificultad cambia cada 35 segundos y limita densidad y velocidad', () => {
    assert.equal(difficulty(34.9).level, 1);
    assert.equal(difficulty(35).level, 2);
    assert.ok(difficulty(70).interval < difficulty(0).interval);
    assert.equal(difficulty(10000).cap, 24);
    assert.equal(difficulty(10000).interval, 0.85);
    assert.equal(difficulty(10000).multiplier, 2.5);
});
test('los tipos se desbloquean de forma progresiva', () => {
    for (const roll of [0, 0.2, 0.5, 0.99]) assert.equal(chooseType(1, roll), 'walker');
    assert.equal(chooseType(2, 0.2), 'runner');
    assert.equal(chooseType(3, 0.1), 'brute');
    assert.equal(chooseType(3, 0.9), 'walker');
    assert.ok(TYPES.runner.speed > TYPES.walker.speed);
    assert.ok(TYPES.brute.health > TYPES.walker.health);
    assert.ok(TYPES.brute.damage > TYPES.walker.damage);
});
test('apuntar a la cabeza triplica el daño', () => {
    assert.equal(shotDamage(false), 1);
    assert.equal(shotDamage(true), 3);
});
