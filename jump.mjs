// Salto FPS sencillo: físicamente coherente e independiente de los fotogramas.
export const EYE_HEIGHT = 1.6;
export const JUMP_SPEED = 6.2;
export const GRAVITY = 19;

export function initialJump() {
    return { height: 0, speed: 0, grounded: true };
}

export function beginJump(state) {
    if (!state.grounded) return state;
    return { height: 0, speed: JUMP_SPEED, grounded: false };
}

export function updateJump(state, delta) {
    if (state.grounded || delta <= 0) return state;
    const dt = Math.min(delta, 0.05);
    const height = state.height + state.speed * dt - GRAVITY * dt * dt / 2;
    if (height <= 0) return initialJump();
    return { height, speed: state.speed - GRAVITY * dt, grounded: false };
}
