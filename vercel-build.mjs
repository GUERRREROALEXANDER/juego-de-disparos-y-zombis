// Build estatico para Vercel: copia el juego y Three.js a dist/.
// Vercel no ejecuta server.js (Socket.IO), asi que el juego corre en modo un jugador.
import fs from 'node:fs';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

for (const f of ['game.js', 'combat.js', 'visuals.js', 'style.css']) {
    fs.cpSync(f, `${out}/${f}`);
}

fs.cpSync('node_modules/three/build', `${out}/vendor/three/build`, { recursive: true });
fs.cpSync('node_modules/three/examples/jsm', `${out}/vendor/three/examples/jsm`, { recursive: true });

let html = fs.readFileSync('index.html', 'utf8');
html = html.replaceAll('/node_modules/three/', '/vendor/three/');
html = html.replace(/\s*<script src="\/socket\.io\/socket\.io\.js"><\/script>/, '');
fs.writeFileSync(`${out}/index.html`, html);

console.log('Build listo en dist/');
