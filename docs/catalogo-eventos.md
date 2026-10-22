# Catálogo de eventos — M9 Reservas de Viajes

## 1. Eventos e intercambios asíncronos

### M9 → M8 — Notificaciones, Documentos y Soporte

M9 publica eventos para que M8 notifique al cliente. La publicación no bloquea las operaciones de reserva.

| Evento | Cuándo se emite | Uso en M8 |
|---|---|---|
| `ReservaCreada` | Se registra una reserva `PENDIENTE`. | Aviso de recepción. |
| `ReservaConfirmada` | La reserva pasa a `CONFIRMADA`. | Confirmación con fecha, trayecto y tarifa. |
| `ReservaModificada` | Se modifica o reprograma una reserva. | Aviso de cambios. |
| `ReservaCancelada` | Un cliente u operador cancela la reserva. | Aviso de cancelación y motivo. |
| `RecordatorioReservaSolicitado` | Se acerca el horario del viaje. | Recordatorio previo. |
| `ReservaActivada` | Se crea la solicitud de despacho en M5. | Aviso de búsqueda de conductor. |
| `ReservaVencida` | La reserva vence o M5 informa falta de conductor. | Aviso de vencimiento. |

### Estructura de los eventos

| Campo | Tipo |
|---|---|
| `evento_id` | UUID |
| `tipo_evento` | string |
| `ocurrido_en` | string ISO 8601 |
| `datos` | object |

**Campos de `datos`:**

| Campo | Tipo |
|---|---|
| `reserva_id` | UUID |
| `cliente_id` | string / UUID |
| `estado` | string |
| `tipo_vehiculo` | `AUTO` / `MOTO` |
| `fecha_hora` | string ISO 8601 |
| `zona_horaria` | string |
| `origen_direccion` | string |
| `destino_direccion` | string |
| `tarifa_estimada` | number / null |
| `motivo_cancelacion` | string / null |
| `solicitud_despacho_id` | string / null |

### Ejemplo — ReservaConfirmada

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

`evento_id` identifica cada publicación y permite detectar duplicados. La mensajería con RabbitMQ está prevista para TP2.

M8 también puede consultar `GET /reservas/{id}` para obtener información de una reserva asociada a un ticket de soporte.

### M5 → M9 — Resultado del despacho

M5 informa el resultado posterior de una solicitud mediante un evento asíncrono o un callback HTTP, según el mecanismo implementado.

```json
{
  "reserva_id": "550e8400-e29b-41d4-a716-446655440000",
  "solicitud_id": "solicitud_001",
  "estado": "SIN_CONDUCTOR"
}
```

Si M5 informa `SIN_CONDUCTOR` o `CANCELADA`, M9 realiza las siguientes operaciones:

1. Cambia la reserva de `ACTIVADA` a `VENCIDA`.
2. Registra el cambio en `historial_reserva`.
3. Emite `ReservaVencida` para que M8 notifique al cliente.

## 2. Comunicaciones HTTP con otros módulos

Las integraciones con M2, M4 y M7 utilizan solicitudes HTTP. No se definieron eventos para estos intercambios.

### M2 — Clientes

M9 consulta a M2 para verificar que el cliente exista y esté habilitado antes de crear o confirmar una reserva.

Envía `cliente_id` y el encabezado `X-Request-Id`. Recibe `cliente_id`, `habilitado`, `estado` y `motivo`.

### M4 — Ubicación y Disponibilidad

M9 consulta a M4 para validar el origen, el destino y la cobertura del recorrido.

Envía los objetos `origen` y `destino`, con dirección, latitud y longitud. Recibe `cubierta`, `motivo`, las ubicaciones normalizadas, `distancia_km` y `duracion_estimada_min`.

### M7 — Tarifas, Pagos y Liquidaciones

M9 solicita a M7 una estimación de tarifa al crear o modificar una reserva.

Envía `tipo_vehiculo`, `distancia_km`, `duracion_estimada_min` y `fecha_hora`. Recibe `tarifa_estimada` y `moneda`.

### M5 — Solicitud y Despacho

M9 activa una reserva confirmada mediante una solicitud HTTP POST a M5.

Envía `reserva_id`, `cliente_id`, `origen_latitud`, `origen_longitud`, `destino_latitud`, `destino_longitud` y `tipo_vehiculo`.

M5 devuelve `reserva_id`, `solicitud_id` y `estado`. Los reintentos con el mismo `reserva_id` deben conservar el mismo `solicitud_id`, sin generar solicitudes duplicadas.

Si M5 presenta un error temporal al registrar la solicitud, M9 mantiene la reserva en estado `CONFIRMADA` y permite reintentar la activación.

## 3. Resumen de comunicaciones

| Relación | Función | Comunicación |
|---|---|---|
| **M9 ↔ M2** | Verificar existencia y habilitación del cliente. | HTTP |
| **M9 ↔ M4** | Validar ubicaciones, cobertura, distancia y duración. | HTTP |
| **M9 → M5** | Activar una reserva y solicitar despacho. | HTTP POST |
| **M5 → M9** | Informar resultados del despacho y falta de conductor. | Evento asíncrono o callback HTTP |
| **M9 ↔ M7** | Obtener la tarifa estimada del viaje. | HTTP |
| **M9 → M8** | Emitir eventos para notificar creación, confirmación, modificación, cancelación, recordatorio, activación y vencimiento de reservas. | Eventos asíncronos |
| **M8 → M9** | Consultar información de reservas asociadas a soporte. | HTTP GET |
