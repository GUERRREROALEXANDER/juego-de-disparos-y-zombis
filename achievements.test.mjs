import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedAchievements, newlyEarned, secondsToNextWave } from './achievements.mjs';
test('los logros se desbloquean al alcanzar los objetivos', () => {
 assert.deepEqual(earnedAchievements({kills:0,wave:1,seconds:0}), []);
 assert.deepEqual(earnedAchievements({kills:10,wave:3,seconds:100}), ['first','hunter','wave3']);
 assert.equal(earnedAchievements({kills:25,wave:5,seconds:120}).length, 6);
});
test('un logro ya obtenido no se vuelve a notificar', () => {
 assert.deepEqual(newlyEarned({kills:10}, ['first']), ['hunter']);
 assert.deepEqual(newlyEarned({kills:10}, ['first','hunter']), []);
});
test('el contador de oleadas respeta intervalos de 35 segundos', () => {
 assert.equal(secondsToNextWave(0),35);
 assert.equal(secondsToNextWave(34),1);
 assert.equal(secondsToNextWave(35),35);
});
