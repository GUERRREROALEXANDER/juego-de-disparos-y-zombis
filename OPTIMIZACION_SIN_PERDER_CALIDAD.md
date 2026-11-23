# Última Guardia — Optimización sin bajar la calidad visual

Esta versión parte de **Última Guardia — Tutorial y salto** e incorpora optimizaciones internas. Los modelos, texturas, las sombras, el postprocesado y los tres ajustes gráficos se mantienen como estaban.

## Cambios realizados

1. **Colisiones y zombis:** índice espacial que consulta obstáculos próximos sin recorrer todo el mapa por cada zombi y cada fotograma. Se conservan las formas y reglas de colisión. Los estados de puertas abiertas o cerradas continúan funcionando.
2. **Menos objetos temporales:** vectores reutilizados para dirección y movimiento de zombis y orientación del minimapa.
3. **Partículas reutilizables:** los impactos reutilizan mallas y vectores de partículas. Su aspecto, cantidad y duración no cambian.
4. **Cadáveres:** la lista de materiales para desvanecer un zombi se calcula solo una vez por cadáver, en vez de recorrer todas sus mallas en cada fotograma.
5. **Interfaz:** los textos de las puertas solo se reescriben cuando cambian; los logros se guardan cuando realmente se desbloquean, y se redujeron mensajes de depuración durante los disparos.
6. **Disparos:** los obstáculos estáticos que pueden recibir disparos se preparan una vez; los enemigos vivos se añaden en cada disparo.

## Lo que NO cambió

- No se redujo la resolución ni la escala de renderizado.
- No se bajó la calidad de las sombras ni se quitaron efectos de iluminación.
- Se mantienen skins, tutorial, salto, oleadas, logros, armas, mapas y multijugador.
- No se instalaron nuevas dependencias.

## Ejecución (Windows / VS Code)

1. Descomprime el ZIP.
2. Abre la carpeta `juego-de-disparos-y-zombis` que contiene `package.json`.
3. Ejecuta `npm install`, `npm test` y `npm start` por separado en la terminal.
4. Abre la dirección local indicada por el servidor (normalmente `http://localhost:3000`).

## Control de calidad

`npm test` ejecuta las pruebas originales (combate, logros y salto) más cuatro pruebas del índice espacial. Comprueba también manualmente los dos mapas, los choques con árboles, rocas y casas, las puertas, el disparo, las oleadas, la selección de skins y las opciones gráficas.

La optimización reduce cálculos en CPU y asignaciones temporales, pero no garantiza una cantidad fija de FPS: depende de la resolución, el navegador, el hardware y del cuello de botella de la partida. No sustituye una prueba real con el contador de FPS.
