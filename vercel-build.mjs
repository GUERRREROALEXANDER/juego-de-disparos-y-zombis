// Build estatico para Vercel: copia el cliente del juego, Three.js y Socket.IO a dist/.
// Vercel no ejecuta server.js. El multijugador se conecta al servidor indicado en la
// variable de entorno MULTIPLAYER_URL (por ejemplo, el servicio en Render).
// Sin esa variable, el juego corre en modo un jugador.
import fs from 'node:fs';

const out = 'dist';
const SKIP_FILES = new Set(['server.js', 'vercel-build.mjs']);
const CLIENT_DIRS = ['render', 'assets'];
const multiplayerUrl = (process.env.MULTIPLAYER_URL || '').trim().replace(/\/+$/, '');

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

const socketTag = /<script src="\/socket\.io\/socket\.io\.js"><\/script>/;
if (multiplayerUrl) {
    // El cliente de Socket.IO se sirve desde Vercel (misma version que el servidor),
    // asi la pagina no espera a que el servidor de Render despierte.
    fs.cpSync('node_modules/socket.io/client-dist/socket.io.min.js', `${out}/vendor/socket.io.min.js`);
    html = html.replace(
        socketTag,
        `<script>window.MULTIPLAYER_URL = ${JSON.stringify(multiplayerUrl)};</script>\n` +
        '\t<script src="/vendor/socket.io.min.js"></script>'
    );
} else {
    html = html.replace(new RegExp('\\s*' + socketTag.source), '');
}
fs.writeFileSync(`${out}/index.html`, html);

console.log('Multijugador:', multiplayerUrl || 'desactivado (falta MULTIPLAYER_URL)');
console.log('Build listo en dist/:', fs.readdirSync(out).join(', '));
