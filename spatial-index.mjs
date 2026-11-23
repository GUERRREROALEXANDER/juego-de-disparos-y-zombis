/**
 * Índice espacial de obstáculos estáticos, con referencias a los objetos originales.
 * Preserva el orden de inserción para que las colisiones no cambien por el índice.
 * Las puertas pueden activarse/desactivarse sin reconstruir el índice.
 */
export function createObstacleIndex(obstacles, cellSize = 8) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('cellSize inválido');
    const cells = new Map();
    const key = (x, z) => x * 65536 + z;
    const toCell = value => Math.floor(value / cellSize);

    obstacles.forEach((o, i) => {
        const sx = typeof o.radius === 'number' ? o.radius : (o.halfWidth || 0);
        const sz = typeof o.radius === 'number' ? o.radius : (o.halfDepth || 0);
        for (let gx = toCell(o.x - sx); gx <= toCell(o.x + sx); gx++) {
            for (let gz = toCell(o.z - sz); gz <= toCell(o.z + sz); gz++) {
                const k = key(gx, gz);
                let cell = cells.get(k);
                if (!cell) { cell = []; cells.set(k, cell); }
                cell.push(i);
            }
        }
    });

    const seen = new Uint32Array(obstacles.length);
    let queryId = 0;
    const scratch = [];

    function query(x, z, radius = 0) {
        scratch.length = 0;
        queryId++;
        if (queryId >= 0xffffffff) { seen.fill(0); queryId = 1; }
        for (let gx = toCell(x - radius); gx <= toCell(x + radius); gx++) {
            for (let gz = toCell(z - radius); gz <= toCell(z + radius); gz++) {
                const cell = cells.get(key(gx, gz));
                if (!cell) continue;
                for (const index of cell) {
                    if (seen[index] !== queryId) {
                        seen[index] = queryId;
                        scratch.push(index);
                    }
                }
            }
        }
        scratch.sort((a, b) => a - b);
        return scratch;
    }
    return { query, size: obstacles.length };
}
