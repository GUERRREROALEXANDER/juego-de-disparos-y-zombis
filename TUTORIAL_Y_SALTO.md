# Última Guardia — Tutorial y salto

## Cambios
- Se retiraron los mensajes que mencionaban un computador o tarjeta gráfica concreta. Se mantienen las tres opciones de calidad.
- Al pulsar **Jugar** aparece un tutorial de **3 pasos** (movimiento, combate y progreso). **Siguiente** avanza; **Omitir y jugar** inicia directamente; **Esc** vuelve al menú.
- Durante la partida, **Espacio** permite saltar. Solo se salta desde el suelo, sin dobles saltos. La pausa congela el movimiento vertical.
- Se conservaron skins, HUD, oleadas, logros, escenarios y modos de calidad.

## Cómo iniciar en VS Code
1. Abre la carpeta `juego-de-disparos-y-zombis` (contiene `package.json`).
2. En Terminal, ejecuta `npm install`, después `npm test` y finalmente `npm start`.
3. Abre la dirección que muestre el servidor (normalmente `http://localhost:3000`).
4. Pulsa **Jugar** para abrir el tutorial. Puedes completarlo u omitirlo.

## Controles
`W A S D`: movimiento · `Ratón`: mirar · `Espacio`: saltar · `Clic izquierdo`: disparar · `R`: recargar · `1,2,3`: elegir arma · `Esc`: pausa · `L`: logros · `Q`: calidad gráfica.

## Comprobaciones sugeridas
- El tutorial se abre antes del juego, permite avanzar y omitir.
- Se puede saltar una vez y volver al suelo, sin saltar indefinidamente.
- El salto se detiene al pausar y continúa al reanudar.
- Probar ambos escenarios, skins, armas, oleadas, logros y los tres niveles gráficos.
- Medir fluidez en tu navegador. Las pruebas automáticas no sustituyen la prueba visual.
