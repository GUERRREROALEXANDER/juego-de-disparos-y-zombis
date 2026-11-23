import test from 'node:test';
import assert from 'node:assert/strict';
import { createObstacleIndex } from './spatial-index.mjs';

const obstacles = [
  { x: 2, z: 3, radius: 0.5 },
  { x: 5, z: 3, halfWidth: 2, halfDepth: 1 },
  { x: -8, z: 0, radius: 4 },
  { x: 10, z: 10, radius: 0.5, active: false }
];
const grid = createObstacleIndex(obstacles, 4);
const indexAt = (x, z, radius = 0) => grid.query(x, z, radius).map(index => obstacles[index]);

test('detecta obstáculos grandes que atraviesan varias celdas', () => {
  assert.ok(indexAt(-11, 1).includes(obstacles[2]));
  assert.ok(indexAt(6, 3).includes(obstacles[1]));
});
test('no repite obstáculos y preserva orden original', () => {
  const indices = grid.query(3.8, 3.1, 1.2);
  assert.equal(new Set(indices).size, indices.length);
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});
test('los objetos se mantienen por referencia, incluidas puertas activas/inactivas', () => {
  assert.ok(indexAt(10, 10).includes(obstacles[3]));
  obstacles[3].active = true;
  assert.equal(indexAt(10, 10).find(x => x === obstacles[3]).active, true);
});
test('la consulta amplia incluye todos los obstáculos geométricamente relevantes', () => {
  for (let x = -13; x <= 13; x += 0.5) {
    for (let z = -4; z <= 13; z += 0.5) {
      const padding = 0.8;
      const relevant = obstacles.filter(o => {
        const sx = typeof o.radius === 'number' ? o.radius : o.halfWidth;
        const sz = typeof o.radius === 'number' ? o.radius : o.halfDepth;
        return Math.abs(x - o.x) <= sx + padding && Math.abs(z - o.z) <= sz + padding;
      });
      const indexed = indexAt(x, z, padding);
      for (const o of relevant) assert.ok(indexed.includes(o), `No encontrado (${x},${z})`);
    }
  }
});
