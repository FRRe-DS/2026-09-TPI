# Integración de reservas

Los servicios están en `backend/src/services/`:

- `modificarCancelar.service.ts`: modificar, cancelar y consultar historial.
- `confirmarReserva.service.ts`: `confirmarReserva(creada.id, db)`, después de crear una
  reserva PENDIENTE y registrar CREACION, en la misma transacción.
- `reserva.validaciones.ts`: validaciones compartidas; `validarVentana(fecha)` también se usa al crear.

Los stubs están en `backend/src/stubs/`, uno por módulo:

- `m2Clientes.stub.ts`: `verificarClienteHabilitado`.
- `m4Ubicacion.stub.ts`: `consultarRuta`.
- `m7Tarifas.stub.ts`: `estimarTarifa`.
- `m5Despacho.stub.ts`: `crearSolicitudDespacho`.

Desde `backend`, `npm test -- tests/reservas.test.ts` ejecuta las nueve pruebas sin base de datos.
La suite completa (`npm test`) incluye salud y necesita `db-test` encendida.

Para bases existentes, aplicar `db/migrations/001_historial_desde_backend.sql` al integrar:
el historial se registra desde los servicios y el trigger anterior duplicaría los eventos.
