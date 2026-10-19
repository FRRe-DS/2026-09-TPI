# Integración de reservas

## Servicios (`backend/src/services/`)

- `crearReserva.service.ts`: crear (POST) y consultar (GET por id). Valida, guarda la reserva
  PENDIENTE junto con su CREACION en el historial y después llama a `confirmarReserva`.
  Si la confirmación falla, la reserva queda PENDIENTE (no se pierde).
- `confirmarReserva.service.ts`: `confirmarReserva(id, db?)` pasa de PENDIENTE a CONFIRMADA
  y registra CONFIRMACION en la misma transacción.
- `modificarCancelar.service.ts`: modificar, cancelar y consultar historial.
- `activarReserva.service.ts`: activa una sola vez (UPDATE condicional) y registra ACTIVACION.
- `reserva.validaciones.ts`: reglas compartidas por crear, confirmar y modificar:
  ventana de anticipación, cliente habilitado, origen/destino (texto u objeto con coordenadas),
  cobertura, distancia y tarifa.

## Historial (RF-9.12)

Lo escribe **el backend** con `registrarHistorial(...)` dentro de la misma transacción que el cambio.
La base ya no tiene el trigger `trg_reserva_historial_aut`.

| Evento | Código en la base | Lo registra |
|---|---|---|
| CREACION | C | POST /reservas (rol CLIENTE) |
| CONFIRMACION | Y | confirmarReserva (rol SISTEMA) |
| MODIFICACION | M | PATCH /reservas/:id (una fila por campo cambiado) |
| CANCELACION | X | POST /reservas/:id/cancelar |
| ACTIVACION | A | POST /reservas/:id/activar (rol SISTEMA) |

Para bases existentes, aplicar `db/migrations/001_historial_desde_backend.sql` al integrar:
si el trigger anterior siguiera activo, duplicaría los eventos.

## Simulaciones de otros módulos (`backend/src/stubs/`)

Un solo juego, que usan crear, confirmar y modificar:

- `m2Clientes.stub.ts`: `verificarClienteHabilitado`. Bloquea los clientes cuyo id empieza con `bloqueado`.
- `m4Ubicacion.stub.ts`: `consultarRuta`. Distancia real entre coordenadas; fuera de cobertura
  si la dirección contiene `FUERA DE ZONA`.
- `m7Tarifas.stub.ts`: `estimarTarifa`. 1000 + 300 por km (AUTO) o 200 por km (MOTO).
- `m5Despacho.stub.ts`: `crearSolicitudDespacho`.

La geocodificación simulada (`geocodificacion.service.ts`) reconoce `UTN`, `Aeropuerto` y
`Terminal de Ómnibus` cuando origen o destino llegan como texto.

## Errores (RNF-03)

Todos los endpoints responden `{ codigo, mensaje, detalle }`:

| HTTP | codigo | Cuándo |
|---|---|---|
| 400 | DATOS_INCOMPLETOS, DATOS_INVALIDOS, TIPO_VEHICULO_INVALIDO, FECHA_INVALIDA, ZONA_HORARIA_INVALIDA, CLAVE_IDEMPOTENCIA_INVALIDA, ID_INVALIDO, COORDENADAS_NO_DISPONIBLES, ORIGEN_DESTINO_IGUALES, CLIENTE_ID_REQUERIDO, JSON_INVALIDO | Datos mal enviados |
| 404 | NO_ENCONTRADA, RUTA_NO_ENCONTRADA | La reserva no existe, o la ruta no existe |
| 409 | CONFLICTO, CONFLICTO_IDEMPOTENCIA | Ya activada/cancelada, o clave reutilizada con otros datos |
| 422 | REGLA_INCUMPLIDA | Regla de negocio. `detalle.regla`: FECHA_PASADA, ANTICIPACION_INSUFICIENTE, ANTICIPACION_EXCEDIDA, CLIENTE_NO_HABILITADO, FUERA_DE_COBERTURA o LIMITE_MODIFICACION_SUPERADO |
| 500 | ERROR_INTERNO | Error inesperado (queda en el log del servidor) |
| 503 | SERVICIO_NO_DISPONIBLE | M5 no pudo crear la solicitud de despacho |

`GET /health` es la excepción: responde `{ estado, servicio, baseDeDatos }` (503 si no llega a la base).

## Pruebas

Desde `backend`, `npm test -- tests/reservas.test.ts tests/stubsModulos.test.ts` corre las pruebas
que no necesitan base de datos. La suite completa (`npm test`) necesita `db-test` encendida
(`docker compose --profile test up -d db-test`).
