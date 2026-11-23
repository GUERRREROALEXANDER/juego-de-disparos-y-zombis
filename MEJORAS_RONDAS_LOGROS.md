# Última Guardia — HUD, rondas y logros

## Lo añadido
- **Vida:** ahora se muestra un indicador visible con porcentaje y barra que cambia de color cuando quedan 30 puntos o menos.
- **Munición:** conserva el contador por arma y los indicadores por bala que ya existían.
- **Oleadas:** se mantiene el sistema original de una oleada cada 35 segundos, con aviso visual y cuenta atrás. Las oleadas aumentan la dificultad de manera gradual.
- **Logros:** seis objetivos de eliminación, supervivencia y oleadas; se desbloquean automáticamente y se guardan localmente en el navegador. Presiona **L** para mostrar/ocultar la lista.

## Para ejecutar (Windows, VS Code)
Abre la carpeta que contiene `package.json`. En Terminal ejecuta `npm install`, `npm test` y `npm start`. Abre la URL que muestra Node (normalmente http://localhost:3000).

## Calidad del software
Sin modelos ni efectos 3D nuevos. Reutiliza las skins, gráficos ajustables y sistema de combate anteriores. Las reglas de logros cuentan con pruebas automáticas (`achievements.test.mjs`). El progreso de logros depende del navegador donde juegues, no se sincroniza con otros usuarios. Se recomienda comprobar manualmente el juego en el navegador, incluyendo ronda 2, recarga, botiquines y panel de logros.
