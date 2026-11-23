# Última Guardia — corrección de zombis y rendimiento

## Correcciones
- Los zombis creados localmente reciben su identificador al contestar el servidor, **sin duplicar la malla**.
- El servidor informa a todos los clientes cuando un zombi es eliminado y limpia los zombis del jugador que sale.
- El cuerpo animado no se descarta erróneamente por límites de visibilidad de la pose inicial.
- La IA de los zombis se calcula hasta 20 veces por segundo, mientras las animaciones siguen a la velocidad de la imagen.
- En pantalla hay un máximo de 10/14/18 zombis según Rendimiento/Equilibrado/Cinemático.
- Minimapa a 6 actualizaciones por segundo y lluvia a 30.

## Ajustes gráficos
- **Rendimiento** (predeterminado para nuevas instalaciones): resolución interna reducida, sin postprocesado ni sombras costosas.
- **Equilibrado**: resolución interna moderada, suavizado de bordes y sin oclusión ambiental ni bloom.
- **Cinemático**: conserva efectos completos; el coste de GPU puede ser mayor.

## Pruebas
Desde la carpeta que contiene `package.json`:

```powershell
npm install
npm test
npm start
```

Prueba una partida en cada mapa y comprueba el contador de FPS, movimiento, daños, saltos, logros y rondas. En multijugador, abre dos navegadores y verifica que no aparezcan dos enemigos superpuestos al generarse. El rendimiento real no puede garantizarse sin medirlo en el equipo final.

**Nota:** Si el navegador recuerda un ajuste anterior, selecciona **Rendimiento** en el menú; se guardará para futuras partidas.
