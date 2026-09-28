// Reglas puras: independientes del renderizado y comprobables con node:test.
export const MAGAZINE_SIZE = 24;
export const RELOAD_SECONDS = 1.8;
export const SHOT_INTERVAL = 0.14;
export const TYPES = {
    walker: { name: 'Errante', health: 3, speed: 1.05, damage: 10, scale: 1, color: 0x536252 },
    runner: { name: 'Corredor', health: 2, speed: 2.7, damage: 8, scale: 0.88, color: 0x8b5142 },
    brute: { name: 'Coloso', health: 10, speed: 0.8, damage: 24, scale: 1.35, color: 0x434957 }
};
export function difficulty(seconds) {
    const level = 1 + Math.floor(seconds / 35);
    return { level, interval: Math.max(0.85, 4.5 - (level - 1) * 0.4), cap: Math.min(24, 7 + level * 2), multiplier: 1 + Math.min(1.5, (level - 1) * 0.1) };
}
export function chooseType(level, roll) {
    if (level >= 3 && roll < Math.min(0.3, 0.12 + level * 0.015)) return 'brute';
    if (level >= 2 && roll < 0.55) return 'runner';
    return 'walker';
}
export function shotDamage(headshot) { return headshot ? 3 : 1; }
