# Supervivencia Zombi 3D

Prototipo local en primera persona para la presentación de Calidad de Software. El navegador ejecuta el juego y sus mecánicas; Node.js solo sirve los archivos y publica el estado del servidor.

## Requisitos

- Node.js 18 o superior y npm.
- Chrome o Edge actualizado, con WebGL habilitado. Se recomienda jugar en portátil conectado a la corriente.

## Ejecutar en Windows

1. Abre PowerShell en la carpeta del proyecto.
2. Instala las dependencias (solo la primera vez):

  ```powershell
  npm install
  ```

3. Arranca el servidor:

  ```powershell
  npm start
  ```

4. Abre **http://localhost:3000** en Chrome o Edge. Para comprobar el servidor visita **http://localhost:3000/api/health**.
5. Pulsa «Jugar» y permite el bloqueo del puntero. Si el navegador lo deniega, se activa el modo de ratón libre. Pulsa Esc para pausar y Esc o «Continuar» para regresar.

Si el puerto 3000 ya está ocupado, en PowerShell establece otro puerto antes de arrancar:

```powershell
$env:PORT = '3001'
npm start
```

En ese caso abre **http://localhost:3001**. El servidor imprime la dirección elegida al iniciar.

Para detener el servidor, vuelve a PowerShell y pulsa Ctrl+C.

## Controles

| Acción | Control |
| --- | --- |
| Avanzar / retroceder | W / S |
| Desplazarse a izquierda / derecha | A / D |
| Mirar y apuntar | Ratón (modo libre si el navegador deniega el bloqueo) |
| Disparar | Mantener clic izquierdo (fusil automático) |
| Recargar | R (24 balas por cargador, reserva ilimitada) |
| Pausar / continuar | Esc / botón «Continuar» |

## Alcance

**Implementado:** bosque nocturno 3D con terreno texturizado, árboles en capas, rocas, niebla, sombras suaves y linterna; fusil visible con brazos, fogonazo, retroceso y recarga de 1,8 segundos; cámara FPS; movimiento WASD y colisiones con árboles y rocas; zombis articulados; impactos en la cabeza con triple daño; contador de eliminados; daño al jugador, pausa, derrota y reinicio; servidor Express y `GET /api/health`. Los modelos siguen siendo geométricos y estilizados, no fotorrealistas.

### Enemigos y dificultad

| Tipo | Resistencia inicial | Velocidad | Daño | Aparición |
| --- | --- | --- | --- | --- |
| Errante | 3 impactos al cuerpo | Normal | 10 | Desde el inicio |
| Corredor | 2 impactos al cuerpo | Rápida | 8 | Nivel 2 |
| Coloso | 10 impactos al cuerpo | Lenta | 24 | Nivel 3 |

El nivel aumenta cada 35 segundos de juego activo. Aumentan la resistencia y velocidad de los nuevos enemigos y la frecuencia de aparición, hasta un máximo de 24 enemigos simultáneos. Los valores de la tabla son la base antes del incremento por nivel. La pausa detiene la dificultad, recarga y combate. El escenario tiene un límite de movimiento para no salir del terreno.

Ejecuta `npm test` para comprobar las reglas de progresión, desbloqueo de enemigos y daño en la cabeza.

**Previsto para fases posteriores:** multijugador, cuentas, autenticación, persistencia, base de datos, tabla de puntuaciones, modelos 3D detallados y audio. No forman parte de este prototipo.
# juego-de-disparos-y-zombis
