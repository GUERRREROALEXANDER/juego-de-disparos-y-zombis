// Build estatico para Vercel: copia el cliente del juego y Three.js a dist/.
// Vercel no ejecuta server.js (Socket.IO), asi que el juego corre en modo un jugador.
import fs from 'node:fs';

const out = 'dist';
const SKIP_FILES = new Set(['server.js', 'vercel-build.mjs']);
const CLIENT_DIRS = ['render', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

// Modulos y estilos de la raiz (sin tests ni archivos del servidor).
for (const f of fs.readdirSync('.')) {
    const isModule = /\.(m?js)$/.test(f) && !/\.test\.m?js$/.test(f) && !SKIP_FILES.has(f);
    if (isModule || f.endsWith('.css')) fs.cpSync(f, `${out}/${f}`);
}

for (const dir of CLIENT_DIRS) {
    if (fs.existsSync(dir)) fs.cpSync(dir, `${out}/${dir}`, { recursive: true });
}

fs.cpSync('node_modules/three/build', `${out}/vendor/three/build`, { recursive: true });
fs.cpSync('node_modules/three/examples/jsm', `${out}/vendor/three/examples/jsm`, { recursive: true });

let html = fs.readFileSync('index.html', 'utf8');
html = html.replaceAll('/node_modules/three/', '/vendor/three/');
html = html.replace(/\s*<script src="\/socket\.io\/socket\.io\.js"><\/script>/, '');
fs.writeFileSync(`${out}/index.html`, html);

console.log('Build listo en dist/:', fs.readdirSync(out).join(', '));
