// ==========================================================
// POST-PROCESADO CINEMATOGRÁFICO
// RenderPass -> GTAO -> Bloom -> Output -> Grade -> SMAA
// ==========================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Pasadas opcionales: si el build de three no las incluye, el juego
// sigue funcionando sin oclusión ambiental ni antialiasing temporal.
let GTAOPass = null;
let SMAAPass = null;

try {

    ({ GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'));

} catch (error) {

    console.warn('[post] GTAO no disponible, se omite la oclusión ambiental.', error);

}

try {

    ({ SMAAPass } = await import('three/addons/postprocessing/SMAAPass.js'));

} catch (error) {

    console.warn('[post] SMAA no disponible, se omite el antialiasing.', error);

}

// ==========================================================
// GRADE SHADER
// Viñeta, grano, aberración cromática, contraste, sombras frías,
// sangre en los bordes por daño y destello cálido al disparar.
// ==========================================================

const GradeShader = {

    name: 'GradeShader',

    uniforms: {

        tDiffuse: { value: null },

        uTime: { value: 0 },

        uResolution: { value: new THREE.Vector2(1, 1) },

        // Grano de película: fino, animado, más presente en las sombras.
        uVignette: { value: 0.48 },

        uGrain: { value: 0.055 },

        uAberration: { value: 0.0016 },

        uSaturation: { value: 0.92 },

        uContrast: { value: 1.08 },

        // Tinte azulado de las zonas en sombra (noche / luna).
        uShadowTint: { value: new THREE.Color(0x1a2c44) },

        // 0..1 sangre en los bordes, 0..1 destello de boca de cañón.
        uDamage: { value: 0 },

        uFlash: { value: 0 }

    },

    vertexShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            vUv = uv;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        }

    `,

    fragmentShader: /* glsl */`

        uniform sampler2D tDiffuse;

        uniform float uTime;
        uniform float uVignette;
        uniform float uGrain;
        uniform float uAberration;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uDamage;
        uniform float uFlash;

        uniform vec3 uShadowTint;
        uniform vec2 uResolution;

        varying vec2 vUv;

        float hash12(vec2 p) {

            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);

            return fract((p3.x + p3.y) * p3.z);

        }

        void main() {

            vec2 uv = vUv;
            vec2 offset = uv - 0.5;

            // 0 en el centro, 1 en las esquinas.
            float radius = length(offset) * 1.4142;

            // Aberración cromática: nula en el centro, abierta en los bordes.
            vec2 shift = offset * uAberration * (1.0 + radius * 1.8);

            vec3 color = vec3(
                texture2D(tDiffuse, uv + shift).r,
                texture2D(tDiffuse, uv).g,
                texture2D(tDiffuse, uv - shift).b
            );

            // Contraste y saturación.
            color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

            color = mix(vec3(luma), color, uSaturation);

            // Sombras azules: la noche empuja los negros hacia el frío.
            color += uShadowTint * (1.0 - smoothstep(0.0, 0.5, luma));

            // Destello cálido de la boca del arma.
            color += vec3(1.0, 0.76, 0.42) * uFlash * (0.25 + 0.35 * (1.0 - radius));

            // Daño: la sangre entra desde los bordes de la pantalla.
            float blood = smoothstep(0.45, 1.05, radius) * uDamage;
            color = mix(color, vec3(0.42, 0.015, 0.02), blood * 0.85);
            color *= 1.0 - blood * 0.3;

            // Viñeta.
            color *= 1.0 - smoothstep(0.25, 1.15, radius) * uVignette;

            // Grano de película: dos muestras por píxel de pantalla, la
            // semilla avanza con el tiempo para que no se congele.
            float grain = hash12(uv * uResolution + vec2(uTime * 41.0, uTime * 73.0)) - 0.5;
            color += grain * uGrain * (0.35 + 0.65 * (1.0 - luma));

            gl_FragColor = vec4(color, 1.0);

        }

    `

};

// ==========================================================
// GOD-RAY PASS (plano de imagen)
// Resplandor radial barato desde la posición de la luna en
// pantalla: 20 muestras hacia el disco lunar, ponderadas por
// luminancia para que solo las zonas brillantes sangren luz.
// Mezcla sutil (uStrength ~0.3): la noche sigue siendo noche.
// ==========================================================

const GodRayShader = {

    name: 'GodRayShader',

    uniforms: {

        tDiffuse: { value: null },

        uMoonUv: { value: new THREE.Vector2(0.5, 0.35) },

        uStrength: { value: 0 }

    },

    vertexShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            vUv = uv;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        }

    `,

    fragmentShader: /* glsl */`

        uniform sampler2D tDiffuse;

        uniform vec2 uMoonUv;
        uniform float uStrength;

        varying vec2 vUv;

        float godLuma(vec3 color) {
            return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        void main() {

            vec4 base = texture2D(tDiffuse, vUv);

            vec2 toMoon = uMoonUv - vUv;
            float dist = length(toMoon);

            // Fuera de un radio razonable no hay aporte.
            float mask = smoothstep(0.55, 0.05, dist);
            if (mask <= 0.001 || uStrength <= 0.001) {
                gl_FragColor = base;
                return;
            }

            vec2 step = (toMoon / max(dist, 1e-4)) * 0.012;
            vec3 acc = vec3(0.0);
            float weight = 0.0;

            // 20 muestras hacia la luna, peso decreciente.
            for (int i = 0; i < 20; i++) {
                float w = 1.0 - float(i) / 20.0;
                vec3 tap = texture2D(tDiffuse, vUv + step * float(i)).rgb;
                // Solo lo brillante (luna, halo, fogonazo) aporta rayo.
                float lum = smoothstep(0.12, 0.85, godLuma(tap));
                acc += tap * lum * w;
                weight += w;
            }

            acc /= max(weight, 1e-4);

            vec3 color = base.rgb + acc * uStrength * mask;

            gl_FragColor = vec4(color, base.a);

        }

    `

};

const QUALITY_PRESETS = {

    high: { pixelRatio: 1.25, aoScale: 0.5, smaa: true, bloom: true, godRays: true },

    medium: { pixelRatio: 0.9, aoScale: 0, smaa: true, bloom: false, godRays: false },

    low: { pixelRatio: 0.7, aoScale: 0, smaa: false, bloom: false, godRays: false }

};

const AO_PIXEL_BUDGET = 2.3e6;

export function createPost(renderer, scene, camera) {

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Buffers en coma flotante de media precisión (HDR para el bloom).
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType
    });

    const composer = new EffectComposer(renderer, renderTarget);

    // 1. Escena.
    composer.addPass(new RenderPass(scene, camera));

    // 2. Oclusión ambiental.
    let gtaoPass = null;

    if (GTAOPass) {

        try {

            gtaoPass = new GTAOPass(scene, camera, width, height, undefined, {
                radius: 1.1,
                distanceExponent: 1.0,
                thickness: 1.0,
                distanceFallOff: 1.0,
                scale: 1.0,
                samples: 8,
                screenSpaceRadius: false
            });

            gtaoPass.output = GTAOPass.OUTPUT.Default;
            gtaoPass.blendIntensity = 0.8;

            composer.addPass(gtaoPass);

        } catch (error) {

            console.warn('[post] No se pudo crear GTAOPass, se omite.', error);
            gtaoPass = null;

        }

    }

    // 3. Bloom contenido: solo las luces fuertes florecen.
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.32,
        0.4,
        1.15
    );

    composer.addPass(bloomPass);

    // 4. Tone mapping + espacio de color.
    composer.addPass(new OutputPass());

    // 5. Grade cinematográfico.
    const gradePass = new ShaderPass(GradeShader);

    gradePass.uniforms.uResolution.value.set(width, height);

    composer.addPass(gradePass);

    const gradeUniforms = gradePass.uniforms;

    // 6. Rayos de luna en espacio de pantalla (sutiles).
    const godPass = new ShaderPass(GodRayShader);

    composer.addPass(godPass);

    const godUniforms = godPass.uniforms;

    // 7. Antialiasing de bordes (LDR).
    let smaaPass = null;

    if (SMAAPass) {

        try {

            smaaPass = new SMAAPass();

            composer.addPass(smaaPass);

        } catch (error) {

            console.warn('[post] No se pudo crear SMAAPass, se omite.', error);
            smaaPass = null;

        }

    }

    let quality = 'high';

    function setQuality(mode = quality) {

        if (!QUALITY_PRESETS[mode]) mode = 'high';

        quality = mode;

        const preset = QUALITY_PRESETS[mode];

        const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);

        const cssWidth = Math.max(1, window.innerWidth);
        const cssHeight = Math.max(1, window.innerHeight);

        renderer.setPixelRatio(ratio);
        renderer.setSize(cssWidth, cssHeight);

        composer.setSize(cssWidth, cssHeight);
        composer.setPixelRatio(ratio);

        gradeUniforms.uResolution.value.set(cssWidth * ratio, cssHeight * ratio);

        // La AO a media resolución cuesta una cuarta parte y apenas se nota
        // en una escena nocturna; se activa sola en pantallas grandes.
        const pixels = cssWidth * cssHeight * ratio * ratio;

        const aoScale = preset.aoScale === 1 && pixels > AO_PIXEL_BUDGET
            ? 0.5
            : preset.aoScale;

        if (gtaoPass) {

            gtaoPass.enabled = aoScale > 0;

            if (aoScale > 0) {

                gtaoPass.setSize(
                    Math.max(1, Math.round(cssWidth * ratio * aoScale)),
                    Math.max(1, Math.round(cssHeight * ratio * aoScale))
                );

            }

        }

        if (smaaPass) smaaPass.enabled = preset.smaa;
        // Los efectos caros se desconectan en lugar de ejecutarse invisibles.
        bloomPass.enabled = preset.bloom;
        godPass.enabled = preset.godRays;
        gradeUniforms.uGrain.value = mode === 'high' ? 0.045 : mode === 'medium' ? 0.025 : 0.01;
        gradeUniforms.uAberration.value = mode === 'high' ? 0.0013 : 0.0005;

        return quality;

    }

    function render(delta = 0) {

        const step = Math.min(delta, 0.1);

        gradeUniforms.uTime.value += step;

        gradeUniforms.uDamage.value = Math.max(
            0,
            gradeUniforms.uDamage.value - step * 0.9
        );

        gradeUniforms.uFlash.value = Math.max(
            0,
            gradeUniforms.uFlash.value - step * 4.5
        );

        // Calidad Rendimiento: dibujar una sola vez, sin pasadas de pantalla.
        // El HUD y la iluminación base continúan funcionando.
        if (quality === 'low') {
            renderer.render(scene, camera);
            return;
        }
        composer.render(step);

    }

    // Posición de la luna en UV de pantalla + visibilidad; la
    // llama game.js cada fotograma proyectando la luz lunar.
    function setMoonUv(x, y, visible) {

        godUniforms.uMoonUv.value.set(x, y);
        godUniforms.uStrength.value = visible ? 0.32 : 0;

    }

    setQuality(quality);

    return {

        composer,

        gradeUniforms,

        setQuality,

        render,

        setMoonUv,

        getQuality: () => quality,

        passes: { gtao: gtaoPass, bloom: bloomPass, grade: gradePass, god: godPass, smaa: smaaPass }

    };

}
