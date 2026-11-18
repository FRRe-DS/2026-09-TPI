# Reservas + Notificaciones con Clean Architecture — Grupo 9

Ejercicio de la exposición (Monolito modular vs Microservicios y Clean Architecture).
Es aparte del TPI: solo toma el concepto del módulo M9 Reservas de Viajes.

- **Versión A:** monolito modular, un contenedor. `INotificador` se resuelve en memoria.
- **Versión B:** Notificaciones como servicio separado. `INotificador` se resuelve con un cliente HTTP.
  Si cae Notificaciones, la reserva se crea igual y la notificación queda `PENDIENTE`.

Solo cambia `infrastructure` y la composición (`main`). `domain` y `application` no se tocan.

## Requisitos

Node 22 o superior (el contenedor usa Node 24). Docker solo para levantar las versiones A y B.

```bash
npm install
npm test          # pruebas
npm run typecheck # verifica tipos
```


## Estructura del proyecto

El proyecto está dividido en capas para separar
la lógica de negocio de las implementaciones técnicas.

### Organización del proyecto

- `src/domain/`: entidades, reglas de negocio y puertos.
- `src/application/`: casos de uso de reservas.
- `src/infrastructure/`: repositorios y notificadores.
- `src/api/`: API de Reservas.
- `src/main/`: configuración y conexión de componentes.
- `src/notificaciones/`: servicio HTTP independiente.
- `test/domain/`: pruebas de la reserva y de la regla de anticipación.
- `test/application/`: pruebas de los casos de uso con implementaciones falsas.
- `test/main/`: pruebas de la configuración.
- `test/infrastructure/`: pruebas del cliente HTTP.
- `test/arquitectura/`: pruebas de dependencias.

El `Dockerfile` y los archivos Compose están en la raíz del proyecto
(ver la sección de Docker, al final).

### Regla de dependencia

Las dependencias deben apuntar hacia las capas internas:

- Domain no puede depender de Application,
  Infrastructure, API, Main ni de Node.js.
- Application puede utilizar Domain y sus propios
  componentes, pero no las capas externas.
- Infrastructure implementa los puertos definidos
  en Domain.
- Main conecta las implementaciones necesarias
  para ejecutar cada versión.

### Verificación automática

La regla se comprueba mediante:

`test/arquitectura/dependencias.test.ts`

Para ejecutar la prueba:

    npx tsx --test test/arquitectura/dependencias.test.ts

Se verificó que la prueba detecta importaciones
prohibidas. Al introducir temporalmente un import
de Express dentro de Domain, la prueba falló
correctamente.


## Contrato de los puertos

Los puertos son interfaces definidas en Domain.
Permiten que los casos de uso trabajen sin depender
directamente de las implementaciones técnicas.

### IReservaRepository

Permite guardar y consultar las reservas.

```ts
interface IReservaRepository {
  guardar(reserva: Reserva): Promise<void>;
  buscarPorId(id: string): Promise<Reserva | null>;
  listarPorCliente(clienteId: string): Promise<Reserva[]>;
}
```

### INotificador

Define cómo se entrega una notificación.

```ts
interface INotificador {
  notificar(notificacion: Notificacion): Promise<void>;
}
```

La notificación contiene:
- reservaId: identificador de la reserva.
- destinatario: cliente que recibe el aviso.
- tipo: RESERVA_CREADA o RESERVA_CANCELADA.
- mensaje: contenido de la notificación.

En la versión A se utiliza NotificadorEnMemoria.
En la versión B se utiliza NotificadorHttp.

Ambas implementaciones cumplen la misma interfaz.

Si la entrega falla, el notificador informa el error
mediante ErrorDeNotificacion.

### INotificacionPendienteRepository

Permite guardar y consultar las notificaciones
que no pudieron entregarse.

```ts
interface INotificacionPendienteRepository {
  guardar(p: NotificacionPendiente): Promise<void>;
  listarPendientes(): Promise<NotificacionPendiente[]>;
}
```

### Funcionamiento de las reservas y notificaciones

1. El cliente solicita la creación de una reserva.
2. El caso de uso valida los datos y guarda la reserva.
3. Se intenta enviar una notificación.
4. Si funciona, la notificación se muestra en consola.
5. Si falla, la reserva permanece guardada y
   se registra la notificación como pendiente.

Los repositorios son en memoria, por lo que los datos
no se conservan cuando se reinicia la aplicación.

Esta versión no incluye cancelación de reservas
ni reintentos automáticos de notificaciones.


## Composición de dependencias (`src/main`)

La composición de dependencias conecta los componentes del proyecto.


En la versión A, Reservas utiliza `NotificadorEnMemoria`
para mostrar las notificaciones dentro de la misma aplicación.

La composición de dependencias se realiza mediante:

```ts
const deps = await componer(leerConfig(process.env));
// deps: { reservas, pendientes, notificador, crearReserva, consultarReserva, listarPendientes }
```


En la versión B, Reservas utiliza `NotificadorHttp`
para comunicarse con el servicio independiente de Notificaciones.

La implementación se elige mediante `MODO_NOTIFICACIONES`,
sin modificar las reglas de negocio.

### Componentes y archivos

| Archivo | Clase / función | Constructor |
|---|---|---|
| `src/application/CrearReserva.ts` | `CrearReserva` | `(reservas, notificador, pendientes, regla, reloj)` |
| `src/application/ConsultarReserva.ts` | `ConsultarReserva` | `(reservas)` |
| `src/application/ListarPendientes.ts` | `ListarPendientes` | `(pendientes)` |
| `src/infrastructure/ReservaRepositoryEnMemoria.ts` | `ReservaRepositoryEnMemoria` | `()` |
| `src/infrastructure/NotificacionPendienteRepositoryEnMemoria.ts` | `NotificacionPendienteRepositoryEnMemoria` | `()` |
| `src/api/app.ts` | `crearApp` | `({ crearReserva, consultarReserva, listarPendientes })` |
| `src/main/server.ts` | Servidor de Reservas | `componer(leerConfig(process.env))` y escucha en `config.puerto` |
| `src/infrastructure/NotificadorEnMemoria.ts` | `NotificadorEnMemoria` | `()` |
| `src/notificaciones/server.ts` | Servicio de Notificaciones | `POST /notificaciones` en el puerto 3001 |
| `src/infrastructure/NotificadorHttp.ts` | `NotificadorHttp` | `(urlBase, timeoutMs)` |
| `Dockerfile`, `docker-compose.a.yml`, `docker-compose.b.yml` | Imagen y despliegues | Versiones A y B |

### Uso de los casos de uso (para la API)

- `crearReserva.ejecutar({ clienteId, origen, destino, tipoVehiculo, fechaHora })` devuelve `Promise<Reserva>` (CONFIRMADA).
  `fechaHora` es `Date`: la API convierte el string del body con `new Date(...)`. Si una regla no se cumple, rechaza con `ErrorDeDominio`.
- `consultarReserva.ejecutar(id)` devuelve `Promise<Reserva | null>` (`null` corresponde a 404).
- `listarPendientes.ejecutar()` devuelve `Promise<NotificacionPendiente[]>`.
- Para responder JSON se utilizan `reserva.aProps()` y `pendiente.aProps()`.
- El body de `POST /notificaciones` es un objeto `Notificacion` del dominio: `{ reservaId, destinatario, tipo, mensaje }`.

### Traducción de errores a HTTP

La API de Reservas traduce los errores del dominio
a los siguientes códigos HTTP:

| Error | Código HTTP |
|---|---|
| `DATOS_INVALIDOS` | 422 |
| `FECHA_PASADA` | 422 |
| `ANTICIPACION_INSUFICIENTE` | 422 |
| `ANTICIPACION_EXCEDIDA` | 422 |
| `MOTIVO_REQUERIDO` | 422 |
| `TRANSICION_INVALIDA` | 409 |
| Reserva inexistente | 404 |

`MOTIVO_REQUERIDO` y `TRANSICION_INVALIDA` corresponden a cambios de estado de la reserva: cancelar, o confirmar una que no está PENDIENTE. En esta versión no hay endpoint para cancelar y `CrearReserva` siempre confirma una reserva recién creada, así que la API todavía no los devuelve. El dominio ya está preparado para cuando se agreguen esos casos de uso.

### Comportamiento ante fallas

Si el servicio de Notificaciones no está disponible,
la reserva se guarda igualmente y la notificación
queda registrada como PENDIENTE.

No se implementan reintentos automáticos.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `ANTICIPACION_MINIMA_MINUTOS` | 60 | Regla de anticipación |
| `ANTICIPACION_MAXIMA_DIAS` | 30 | Regla de anticipación |
| `MODO_NOTIFICACIONES` | `memoria` | `memoria` (versión A) o `http` (versión B) |
| `NOTIFICACIONES_URL` | — | URL del servicio en la versión B (obligatoria si es `http`) |
| `NOTIFICACIONES_TIMEOUT_MS` | 2000 | Timeout del cliente HTTP (versión B) |
| `PUERTO` | 3000 (Reservas) / 3001 (Notificaciones) | Puerto de cada servicio |

## Docker: levantar las versiones A y B

Hace falta Docker Desktop abierto. No hace falta instalar Node: todo corre dentro de los contenedores.

Hay **un solo `Dockerfile`** para los dos servicios (base `node:24-slim`). La misma imagen (`grupo9-clean`) sirve para Reservas y para Notificaciones; qué arranca cada contenedor lo decide el compose.

| | Versión A (`docker-compose.a.yml`) | Versión B (`docker-compose.b.yml`) |
|---|---|---|
| Contenedores | 1: `reservas` (puerto 3000) | 2: `reservas` (3000) y `notificaciones` (3001) |
| `MODO_NOTIFICACIONES` | `memoria` | `http` |
| Notificador | `NotificadorEnMemoria`, en el mismo proceso | `NotificadorHttp`, hacia `http://notificaciones:3001` |

Entre A y B solo cambian variables de entorno: no se modifica el código.

```bash
# Versión A
docker compose -f docker-compose.a.yml up --build

# Versión B
docker compose -f docker-compose.b.yml up --build

# Apagar (Ctrl+C en la terminal del log y después)
docker compose -f docker-compose.a.yml down    # o docker-compose.b.yml
```

Pruebas dentro de la imagen:

```bash
docker build -t grupo9-clean .
docker run --rm grupo9-clean npm test
```

## Escenarios de demostración

Con los contenedores levantados en una terminal (que muestra el log), los pedidos se hacen desde una segunda terminal.

**Crear una reserva** (PowerShell; la fecha queda 3 horas después de ahora, para cumplir la anticipación mínima de 60 minutos):

```powershell
$fecha = (Get-Date).AddHours(3).ToUniversalTime().ToString("s") + "Z"
$body = @{ clienteId="cliente_001"; origen="Av. Sarmiento 1000"; destino="UTN FRRe"; tipoVehiculo="AUTO"; fechaHora=$fecha } | ConvertTo-Json
Invoke-WebRequest -Method Post -Uri http://localhost:3000/reservas -ContentType "application/json" -Body $body -UseBasicParsing
```

**Ver las notificaciones pendientes:**

```powershell
(Invoke-WebRequest http://localhost:3000/notificaciones-pendientes -UseBasicParsing).Content
```

En Linux o Mac, lo mismo con curl (reemplazar `fechaHora` por una fecha y hora UTC entre 1 hora y 30 días después de ahora):

```bash
curl -X POST http://localhost:3000/reservas -H "Content-Type: application/json" \
  -d '{"clienteId":"cliente_001","origen":"Av. Sarmiento 1000","destino":"UTN FRRe","tipoVehiculo":"AUTO","fechaHora":"2026-11-20T15:00:00Z"}'
curl http://localhost:3000/notificaciones-pendientes
```

| # | Escenario | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Pruebas | `npm test` | 24 pruebas en verde, incluida la de la regla de dependencia |
| 2 | Versión A | Levantar A y crear una reserva. Después, repetir con `fechaHora="2020-01-01T10:00:00Z"` | 201 con estado `CONFIRMADA` y la notificación en el log de `reservas-1`. Con fecha pasada: `FECHA_PASADA` (422) y sin notificación |
| 3 | Versión B | Levantar B, crear una reserva y ver las pendientes | 201 y la notificación en el log de `notificaciones-1`, el otro contenedor. Pendientes: `[]` |
| 4 | Falla de Notificaciones | Con B levantada: `docker compose -f docker-compose.b.yml stop notificaciones`, crear una reserva y ver las pendientes | La reserva igual da 201. Pendientes: una notificación con `"estado":"PENDIENTE"` y el error (`Timeout…` o `No se pudo contactar a Notificaciones…`) |

En el escenario 4, al detener Notificaciones el log muestra `npm error signal SIGTERM` y `exited with code 1`: es la señal de apagado que envía Docker, no una falla del servicio.

## Documentación

- [Informe del grupo](docs/Informe_Grupo9.pdf): investigación sobre Monolito modular vs Microservicios y Clean Architecture, la implementación práctica, la relación con el TPI y los criterios de utilización.

