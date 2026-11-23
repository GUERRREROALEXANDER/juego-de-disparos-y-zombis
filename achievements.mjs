// Reglas puras, independientes del renderizado y de la red.
export const ACHIEVEMENTS = Object.freeze([
    { id: 'first', title: 'Primer superviviente', detail: 'Elimina 1 zombi', kind: 'kills', goal: 1 },
    { id: 'hunter', title: 'Cazador', detail: 'Elimina 10 zombis', kind: 'kills', goal: 10 },
    { id: 'veteran', title: 'Veterano', detail: 'Elimina 25 zombis', kind: 'kills', goal: 25 },
    { id: 'wave3', title: 'Resistente', detail: 'Alcanza la oleada 3', kind: 'wave', goal: 3 },
    { id: 'wave5', title: 'Inquebrantable', detail: 'Alcanza la oleada 5', kind: 'wave', goal: 5 },
    { id: 'survival', title: 'Dos minutos', detail: 'Sobrevive 120 segundos', kind: 'seconds', goal: 120 }
]);
export function earnedAchievements({ kills = 0, wave = 1, seconds = 0 } = {}) {
    const values = { kills, wave, seconds };
    return ACHIEVEMENTS.filter(a => Number.isFinite(values[a.kind]) && values[a.kind] >= a.goal).map(a => a.id);
}
export function newlyEarned(stats, previousIds) {
    const previous = new Set(previousIds);
    return earnedAchievements(stats).filter(id => !previous.has(id));
}
export function secondsToNextWave(seconds, waveLength = 35) {
    return Math.max(0, waveLength - (Math.max(0, Math.floor(seconds)) % waveLength));
}
