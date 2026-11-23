import test from 'node:test';
import assert from 'node:assert/strict';
import { EYE_HEIGHT, initialJump, beginJump, updateJump } from './jump.mjs';

test('un salto comienza desde el suelo y no permite otro en el aire', () => {
    const first = beginJump(initialJump());
    assert.ok(first.speed > 0);
    assert.equal(first.grounded, false);
    assert.equal(beginJump(first), first);
    assert.equal(EYE_HEIGHT, 1.6);
});

test('el personaje sube y aterriza sin atravesar el suelo', () => {
    let state = beginJump(initialJump());
    let maxHeight = 0;
    for (let i = 0; i < 90; i++) {
        state = updateJump(state, 1 / 60);
        maxHeight = Math.max(maxHeight, state.height);
        assert.ok(state.height >= 0);
    }
    assert.ok(maxHeight > 0.5 && maxHeight < 1.3);
    assert.deepEqual(state, initialJump());
});

test('salto independiente de la frecuencia de actualización, dentro de tolerancia', () => {
    const simulate = delta => {
        let state = beginJump(initialJump());
        for (let t = 0; t < 0.25 - 1e-9; t += delta) state = updateJump(state, delta);
        return state.height;
    };
    assert.ok(Math.abs(simulate(1 / 60) - simulate(1 / 120)) < 0.015);
});
