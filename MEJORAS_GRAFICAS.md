# Última Guardia — mejora gráfica y rendimiento

## Cambios
- Selector de calidad en el menú principal: **Rendimiento**, **Equilibrado** (por defecto), **Cinemático**.
- Calidad configurable con la tecla **Q**, y guardada localmente en el navegador.
- **FPS** visibles durante el juego para medir rendimiento real.
- El modo equilibrado usa resolución interna x1, bloom y antialiasing; desactiva rayos de luna de posprocesado.
- El modo rendimiento reduce resolución interna, desactiva AO, bloom, SMAA y rayos; reduce el coste de las sombras de la linterna.
- El modo cinematográfico mantiene los efectos completos, pero limita el pixel ratio a 1,25 para evitar saltos grandes en pantallas HiDPI.
- Reducción de grano y aberración cromática para una imagen más nítida.
- No modifica armas, zombis, skins, vida, puntos ni conexión multijugador.

## Ejecutar en VS Code
1. Abre la carpeta `juego-de-disparos-y-zombis` (donde está `package.json`).
2. Ejecuta `npm install`, después `npm test` y `npm start`.
3. Abre la URL que informe el servidor, normalmente `http://localhost:3000`.
4. Compara los FPS en el mismo escenario y con un número similar de zombis.

## Pruebas de calidad
- Cambiar entre las tres calidades antes de jugar y con la tecla Q.
- Verificar movimientos, skins, enemigos, HUD y modo multijugador.
- Comparar rendimiento en mapa de pueblo y bosque.

*Las pruebas de sintaxis y unitarias no reemplazan una prueba visual y de FPS en el computador del usuario.*
