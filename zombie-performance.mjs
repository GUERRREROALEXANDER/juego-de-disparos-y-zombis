// Límites de enemigos locales y visibles: evita sobrecarga sin descartar
// permanentemente enemigos que llegan desde otro jugador.
export const MAX_ZOMBIES_BY_QUALITY = Object.freeze({ low: 10, medium: 14, high: 18 });
export const MAX_VISIBLE_ZOMBIES_BY_QUALITY = Object.freeze({ low: 18, medium: 22, high: 24 });

export function maxActiveZombies(quality) {
    return MAX_ZOMBIES_BY_QUALITY[quality] ?? MAX_ZOMBIES_BY_QUALITY.medium;
}

export function maxVisibleZombies(quality) {
    return MAX_VISIBLE_ZOMBIES_BY_QUALITY[quality] ?? MAX_VISIBLE_ZOMBIES_BY_QUALITY.medium;
}

// Una confirmación del servidor corresponde a un enemigo ya existente del mismo cliente.
export function findOwnSpawn(zombies, event, socketId) {
    if (!event || !socketId || event.ownerId !== socketId || !Number.isSafeInteger(event.clientSpawnId)) return null;
    return zombies.find(z => z.localOwner && z.clientSpawnId === event.clientSpawnId) || null;
}
