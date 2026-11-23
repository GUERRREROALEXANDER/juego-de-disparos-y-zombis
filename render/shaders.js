// ==========================================================
// SHADER LAYER — shared chunks patched onto three's built-in
// materials with onBeforeCompile.
//
// Three effects, composable on the same material:
//   wind  : vertex sway on foliage, stronger the higher the vertex
//   mist  : height-based ground mist folded into the distance fog
//   wet   : roughness / albedo variation that reads as wet ground
//
// A material keeps its patch options in userData.__renderPatch so
// applyAtmosphere() can add mist later without wiping an earlier
// wind or wet patch. customProgramCacheKey() keeps each patch
// combination in its own compiled program.
// ==========================================================

import * as THREE from 'three';

// One clock for every patched material. game.js advances it each frame.
export const TIME_UNIFORM = { uRenderTime: { value: 0 } };

const MIST_UNIFORMS = {
    uMistColor: { value: new THREE.Color(0x0d1416) },
    uMistLow: { value: 0.05 },
    uMistHigh: { value: 3.4 },
    uMistStart: { value: 5.0 },
    uMistFar: { value: 58.0 },
    uMistDensity: { value: 0.62 }
};

const WET_UNIFORMS = { uWetAmount: { value: 0.6 } };

export function updateRenderTime(seconds) {
    TIME_UNIFORM.uRenderTime.value = seconds;
}

export function setMist(options = {}) {
    if (options.color !== undefined) MIST_UNIFORMS.uMistColor.value.set(options.color);
    if (options.low !== undefined) MIST_UNIFORMS.uMistLow.value = options.low;
    if (options.high !== undefined) MIST_UNIFORMS.uMistHigh.value = options.high;
    if (options.start !== undefined) MIST_UNIFORMS.uMistStart.value = options.start;
    if (options.far !== undefined) MIST_UNIFORMS.uMistFar.value = options.far;
    if (options.density !== undefined) MIST_UNIFORMS.uMistDensity.value = options.density;
}

const NOISE_GLSL = /* glsl */ `
    float renderHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float renderNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = renderHash(i);
        float b = renderHash(i + vec2(1.0, 0.0));
        float c = renderHash(i + vec2(0.0, 1.0));
        float d = renderHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float renderFbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 3; i++) {
            value += amplitude * renderNoise(p);
            p = p * 2.07 + 7.3;
            amplitude *= 0.5;
        }
        return value;
    }
`;

function cacheKey(opts) {
    return 'render-' +
        (opts.wind ? `w${opts.wind.strength ?? 0.11}` : 'w0') +
        (opts.mist ? 'm1' : 'm0') +
        (opts.wet ? 'g1' : 'g0');
}

/**
 * Apply (or extend) the render patch set on a material.
 * opts.wind: { strength, low, high } vertex sway
 * opts.mist: true                      ground mist in the fog
 * opts.wet:  true                      wet-ground roughness
 */
export function patchMaterial(material, opts = {}) {
    if (!material || !material.isMaterial) return material;

    const previous = material.userData.__renderPatch || {};
    const merged = { ...previous, ...opts };
    material.userData.__renderPatch = merged;

    material.onBeforeCompile = (shader) => {
        const patch = material.userData.__renderPatch || {};
        const needsWorld = Boolean(patch.mist || patch.wet);

        Object.assign(shader.uniforms, TIME_UNIFORM);
        if (patch.mist) Object.assign(shader.uniforms, MIST_UNIFORMS);
        if (patch.wet) Object.assign(shader.uniforms, WET_UNIFORMS);

        // ---- vertex ----
        let vertexPars = 'uniform float uRenderTime;\n';
        if (needsWorld) vertexPars += 'varying vec3 vRenderWorld;\n';

        let vertexBegin = '';

        if (patch.mist || patch.wet) {
            vertexBegin += /* glsl */ `
            {
                vec4 renderLocal = vec4(transformed, 1.0);
                #ifdef USE_BATCHING
                    renderLocal = batchingMatrix * renderLocal;
                #endif
                #ifdef USE_INSTANCING
                    renderLocal = instanceMatrix * renderLocal;
                #endif
                vRenderWorld = (modelMatrix * renderLocal).xyz;
            }
            `;
        }

        if (patch.wind) {
            const wind = patch.wind;
            const strength = Number(wind.strength ?? 0.11).toFixed(4);
            const low = Number(wind.low ?? 0.0).toFixed(3);
            const high = Number(wind.high ?? 2.8).toFixed(3);

            vertexBegin += /* glsl */ `
            {
                float windPhase = uRenderTime * 1.55
                    + (modelMatrix[3].x + modelMatrix[3].z) * 0.41;
                #ifdef USE_INSTANCING
                    // Instanced foliage shares one model matrix, so the
                    // phase comes from the instance offset instead.
                    windPhase += (instanceMatrix[3].x + instanceMatrix[3].z) * 0.41;
                #endif
                float windLift = clamp((transformed.y - (${low})) / ((${high}) - (${low})), 0.0, 1.0);
                float windWave = sin(windPhase) * 0.62 + sin(windPhase * 2.7 + 1.7) * 0.38;
                transformed.x += windWave * ${strength} * windLift;
                transformed.z += cos(windPhase * 0.83 + 0.6) * ${strength} * 0.6 * windLift;
            }
            `;
        }

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${vertexPars}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBegin}`);

        // ---- fragment ----
        let fragmentPars = 'uniform float uRenderTime;\n';
        if (needsWorld) {
            fragmentPars += 'varying vec3 vRenderWorld;\n' + NOISE_GLSL;
        }
        if (patch.mist) {
            fragmentPars += /* glsl */ `
                uniform vec3 uMistColor;
                uniform float uMistLow;
                uniform float uMistHigh;
                uniform float uMistStart;
                uniform float uMistFar;
                uniform float uMistDensity;
            `;
        }
        if (patch.wet) fragmentPars += 'uniform float uWetAmount;\n';

        let fragment = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>\n${fragmentPars}`
        );

        if (patch.wet) {
            fragment = fragment.replace('#include <roughnessmap_fragment>', /* glsl */ `
                #include <roughnessmap_fragment>
                {
                    // Puddles: broad noise, stretched along one axis so the
                    // pattern reads as run-off, not camouflage.
                    vec2 wetUv = vRenderWorld.xz * vec2(0.085, 0.052);
                    float wetNoise = renderFbm(wetUv);
                    float wetPatch = smoothstep(0.42, 0.78, wetNoise) * uWetAmount;
                    roughnessFactor = mix(roughnessFactor, 0.16, wetPatch);
                    diffuseColor.rgb *= mix(1.0, 0.62, wetPatch);
                }
            `);
        }

        if (patch.mist) {
            // Replace three's fog blend with fog + a ground-hugging mist
            // layer that thins out with height and thickens with distance.
            fragment = fragment.replace('#include <fog_fragment>', /* glsl */ `
                #ifdef USE_FOG
                    #ifdef FOG_EXP2
                        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
                    #else
                        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
                    #endif
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

                    float mistHeight = 1.0 - smoothstep(uMistLow, uMistHigh, vRenderWorld.y);
                    float mistReach = smoothstep(uMistStart, uMistFar, vFogDepth);
                    float mistDrift = 0.82 + 0.18 * sin(
                        uRenderTime * 0.35 + vRenderWorld.x * 0.13 + vRenderWorld.z * 0.09
                    );
                    float mistAmount = mistHeight * mistDrift * (0.28 + 0.72 * mistReach) * uMistDensity;
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, clamp(mistAmount, 0.0, 0.8));
                #endif
            `);
        }

        shader.fragmentShader = fragment;
    };

    material.customProgramCacheKey = () => cacheKey(material.userData.__renderPatch || {});
    material.needsUpdate = true;

    return material;
}

/**
 * Add the ground mist to every lit material already in the scene.
 * Runs once the world is built, so houses, barrels and the terrain
 * all sit in the same fog band. Basic/Shader materials are skipped.
 */
export function applyAtmosphere(root) {
    const seen = new Set();

    const flagged = (object, flag) => {
        let node = object;
        while (node) {
            if (node.userData && node.userData[flag]) return true;
            node = node.parent;
        }
        return false;
    };

    root.traverse((object) => {
        const material = object.material;
        if (!material) return;
        if (flagged(object, 'noMist')) return;

        const list = Array.isArray(material) ? material : [material];

        for (const mat of list) {
            if (seen.has(mat)) continue;
            seen.add(mat);

            const lit = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial;
            if (!lit) continue;

            patchMaterial(mat, { mist: true });
        }
    });

    return seen.size;
}

export const MIST_UNIFORM_REFS = MIST_UNIFORMS;
export const WET_UNIFORM_REFS = WET_UNIFORMS;
