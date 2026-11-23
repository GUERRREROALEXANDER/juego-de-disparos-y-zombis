# Skins de personaje — Última Guardia

Se agregaron cuatro skins cosméticas: Explorador, Militar, Médico y Nocturno.

## Uso
1. Instala Node.js (versión 18 o posterior).
2. Abre la carpeta del proyecto en VS Code.
3. En la terminal: `npm install`, luego `npm test` y `npm start`.
4. Abre la dirección anunciada por el servidor, normalmente http://localhost:3000.
5. En el menú principal, selecciona la skin antes de pulsar Jugar.
6. Para comprobar el multijugador, abre otra ventana del juego y selecciona otra skin.

## Calidad de software
- El selector usa botones accesibles y conserva la selección localmente.
- El servidor valida las skins recibidas.
- Las apariencias reutilizan las geometrías existentes: no se descargan modelos ni texturas adicionales.
- Las skins no cambian la velocidad, vida ni daño.
- En primera persona, la skin se ve en los personajes de otros jugadores; no hay un avatar propio delante de la cámara.
- No se altera el funcionamiento de controles, armas ni zombis.

Archivos editados: `index.html`, `style.css`, `game.js`, `server.js`.
