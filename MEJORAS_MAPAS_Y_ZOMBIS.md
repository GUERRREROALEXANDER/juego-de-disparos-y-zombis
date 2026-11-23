# Última Guardia — mapas interactivos y sincronización de zombis

## Mapas

- **Bosque nocturno:** se añadió un campamento de exploradores con tienda, fogata, leños y señalización. Se reservó un área libre alrededor para que la vegetación no tape el punto de interés.
- **Pueblo abandonado:** se añadieron marcas de carretera instanciadas, faroles, un vehículo abandonado y suministros.
- Se corrigió la construcción del pueblo: barriles, barricadas y cajas ahora se crean una sola vez, fuera del bucle de contenedores. Esto evita duplicar objetos, colisiones y trabajo de renderizado.
- El minimapa muestra las cajas de suministros disponibles y añade una leyenda para jugador, zombis y suministros.

## Interacciones

- Las puertas se siguen abriendo y cerrando con **E**.
- Las cajas de suministros también se abren con **E** cuando el jugador está cerca.
- Cada caja se utiliza una sola vez, restaura hasta 25 puntos de salud y completa el cargador del arma actual.
- El minimapa marca las cajas disponibles con un rombo dorado.

## Corrección de zombis

- El servidor separa las sesiones por mapa (`forest` y `village`) para evitar que un jugador reciba enemigos de otro escenario.
- Una desconexión breve ya no elimina de inmediato los zombis del jugador. Se conserva el estado durante una ventana de reconexión de 120 segundos.
- Los zombis locales que aparecieron antes de que Socket.IO conectara se registran cuando llega la instantánea inicial del servidor.
- Los reintentos de creación usan `clientSpawnId` para no duplicar una misma aparición.
- El daño no letal se sincroniza con el servidor; la eliminación se comunica a todos los jugadores del mismo mapa.
- Los enemigos remotos que alcanzan el límite visible se mantienen en una cola y se incorporan cuando hay espacio, en vez de descartarse definitivamente.

## Pruebas

Se ejecutaron `node --check game.js`, `node --check server.js` y `npm test`. Las **23 pruebas automáticas** pasaron correctamente.

La comprobación automatizada no sustituye la prueba visual en navegador. Antes de la entrega, inicia el juego, recorre ambos mapas, abre las cajas con E y, si usas multijugador, prueba dos ventanas en el mismo mapa y una en cada mapa.
