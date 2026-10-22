# Catálogo de eventos — M9 Reservas de Viajes

## 1. Eventos e intercambios asíncronos

### M9 → M8 — Notificaciones, Documentos y Soporte

M9 publica eventos asíncronos para que M8 gestione el envío de avisos al cliente (**RF-8.2**, **RF-8.8**, **RF-9.8** y **RF-9.11**). La publicación no bloquea las transacciones del módulo de reservas.

| Evento | Cuándo se emite | Uso en M8 |
|---|---|---|
| `ReservaCreada` | Se registra una reserva en estado `PENDIENTE`. | Aviso de recepción de la solicitud. |
| `ReservaConfirmada` | La reserva supera las validaciones y pasa a `CONFIRMADA`. | Confirmación con fecha, hora, trayecto y tarifa estimada. |
| `ReservaModificada` | Se modifica o reprograma una reserva (`PATCH /reservas/{id}`). | Aviso de cambios y nueva tarifa estimada. |
| `ReservaCancelada` | Un cliente u operador cancela la reserva (`POST /reservas/{id}/cancelar`). | Aviso de cancelación junto con el motivo registrado. |
| `RecordatorioReservaSolicitado` | Se acerca el horario programado del viaje (**RF-9.8**). | Envío de recordatorio previo al cliente. |
| `ReservaActivada` | Se activa la reserva y se crea la solicitud de despacho en M5 (`POST /reservas/{id}/activar`). | Aviso de inicio de búsqueda de conductor (`solicitud_despacho_id`). |
| `ReservaVencida` | La reserva vence sin activarse o M5 informa falta de conductor (`SIN_CONDUCTOR`). | Aviso de vencimiento por falta de disponibilidad. |

**Estructura general del evento (sobre común):**

| Campo | Tipo | Descripción |
|---|---|---|
| `evento_id` | UUID | Identificador único de la publicación para evitar envíos duplicados en M8. |
| `tipo_evento` | string | Nombre del evento emitido (uno de los siete de la tabla anterior). |
| `ocurrido_en` | string ISO 8601 | Fecha y hora exacta en que se produjo el evento. |
| `datos` | object | Información del estado actual de la reserva. |

**Campos del objeto `datos`:**

| Campo | Tipo | Valores / Descripción |
|---|---|---|
| `reserva_id` | UUID | Identificador único de la reserva en M9. |
| `cliente_id` | string / UUID | Identificador del cliente titular de la reserva. |
| `estado` | string | `PENDIENTE` / `CONFIRMADA` / `CANCELADA` / `ACTIVADA` / `VENCIDA` |
| `tipo_vehiculo` | string | `AUTO` / `MOTO` |
| `fecha_hora` | string ISO 8601 | Fecha y hora programada para el viaje. |
| `zona_horaria` | string | Zona horaria IANA (ej. `America/Argentina/Buenos_Aires`). |
| `origen_direccion` | string | Dirección textual del punto de partida. |
| `destino_direccion` | string | Dirección textual del punto de llegada. |
| `tarifa_estimada` | number / null | Monto estimado informado por M7 al confirmar o modificar. |
| `motivo_cancelacion` | string / null | Motivo registrado cuando el estado es `CANCELADA` (`null` en los demás casos). |
| `solicitud_despacho_id` | string / null | Identificador de la solicitud en M5 cuando el estado es `ACTIVADA` (`null` antes de activar). |

**Ejemplo de carga útil — `ReservaConfirmada`:**

```json
{
  "evento_id": "01a13760-a499-713c-a31b-f3e20258426d",
  "tipo_evento": "ReservaConfirmada",
  "ocurrido_en": "2026-10-19T20:00:00.000Z",
  "datos": {
    "reserva_id": "01a13760-a4ac-72a5-aa07-4c6d5deaecef",
    "cliente_id": "cliente_002",
    "estado": "CONFIRMADA",
    "tipo_vehiculo": "AUTO",
    "fecha_hora": "2026-10-23T19:00:00.000Z",
    "zona_horaria": "America/Argentina/Buenos_Aires",
    "origen_direccion": "Av. 9 de Julio 1200, Resistencia, Chaco",
    "destino_direccion": "Aeropuerto Internacional Resistencia",
    "tarifa_estimada": 4750.00,
    "motivo_cancelacion": null,
    "solicitud_despacho_id": null
  }
}
```

El transporte mediante colas en RabbitMQ está previsto para la segunda entrega (**RNF-10**). Cuando M8 necesita consultar datos vigentes de una reserva para asociarlos a un ticket de soporte (**RF-8.7**), utiliza la operación HTTP síncrona `GET /reservas/{id}`.

### M5 → M9 — Resultado fallido del despacho

Cuando una reserva ya fue activada (`ACTIVADA`) y el proceso de búsqueda en M5 finaliza sin vehículos disponibles o se cancela antes de iniciar el viaje (**RF-5.8** y **RF-9.11**), M5 informa el resultado a M9 mediante un **evento asíncrono o un callback HTTP** con la siguiente estructura acordada entre ambos módulos:

```json
{
  "reserva_id": "550e8400-e29b-41d4-a716-446655440000",
  "solicitud_id": "solicitud_001",
  "estado": "SIN_CONDUCTOR"
}
```

Al recibir el estado `SIN_CONDUCTOR` (o `CANCELADA`), M9 actualiza la reserva de `ACTIVADA` a `VENCIDA`, deja constancia en `historial_reserva` (`tipo_cambio = 'VENCIMIENTO'`, `rol_actor = 'SISTEMA'`) y publica el evento `ReservaVencida` hacia M8 para notificar al cliente.

## 2. Consultas síncronas a otros módulos (API REST)

Las integraciones con M1, M2, M4, M5 (al activar) y M7 se realizan mediante solicitudes HTTP síncronas porque M9 necesita su respuesta en el momento para validar o completar la operación. No se utilizan eventos para estos intercambios:

* **M1 — Identidad y Acceso:** Validación de credenciales y rol del actor (`CLIENTE` u `OPERADOR`) que solicita crear, consultar, modificar o cancelar una reserva.
* **M2 — Clientes (`RF-9.3`):** Antes de confirmar una reserva, M9 consulta la habilitación del cliente enviando `cliente_id` y el encabezado `X-Request-Id`. M2 responde `habilitado` (`boolean`), `estado` y `motivo`.
* **M4 — Ubicación y Disponibilidad (`RF-9.3` y `RF-9.6`):** M9 envía `origen` y `destino` (dirección y coordenadas) para validar que estén dentro de la zona de cobertura y obtener el recorrido. M4 responde `cubierta` (`boolean`), `distancia_km`, `duracion_estimada_min` y las ubicaciones normalizadas.
* **M7 — Tarifas, Pagos y Liquidaciones (`RF-9.4` y `RF-9.6`):** M9 envía `tipo_vehiculo` (`AUTO` / `MOTO`), `distancia_km`, `duracion_estimada_min` y `fecha_hora`. M7 devuelve `tarifa_estimada` y `moneda`.
* **M5 — Solicitud y Despacho (`RF-9.9` y `RF-9.10`):** Al ejecutar `POST /reservas/{id}/activar`, M9 envía una petición HTTP POST a M5 con `reserva_id` (que actúa como clave de idempotencia), `cliente_id`, `origen_latitud`, `origen_longitud`, `destino_latitud`, `destino_longitud` y `tipo_vehiculo`. M5 crea la solicitud sin duplicarla y devuelve `reserva_id`, `solicitud_id` y `estado` (`PENDIENTE`).

## 3. Resumen de comunicaciones del Módulo 9

| Relación | Propósito | Mecanismo |
|---|---|---|
| **M9 ↔ M1** | Validar identidad del usuario y permisos según su rol (`CLIENTE` / `OPERADOR`). | HTTP síncrono, sin eventos |
| **M9 ↔ M2** | Verificar existencia y habilitación de la cuenta del cliente. | HTTP síncrono, sin eventos |
| **M9 ↔ M4** | Validar cobertura geográfica y obtener coordenadas, distancia y tiempo estimado. | HTTP síncrono, sin eventos |
| **M9 → M5** | Activar una reserva confirmada y crear una única solicitud de despacho. | HTTP POST síncrono (idempotente por `reserva_id`) |
| **M5 → M9** | Informar `SIN_CONDUCTOR` o `CANCELADA` para que M9 marque la reserva como `VENCIDA`. | Evento asíncrono o callback HTTP |
| **M9 ↔ M7** | Calcular la tarifa estimada al crear o reprogramar la reserva. | HTTP síncrono, sin eventos |
| **M9 → M8** | Emitir los siete eventos del ciclo de vida de la reserva para notificar al cliente. | Eventos asíncronos |
| **M8 → M9** | Consultar el detalle de una reserva (`GET /reservas/{id}`) para tickets de soporte. | HTTP GET síncrono, sin eventos |
