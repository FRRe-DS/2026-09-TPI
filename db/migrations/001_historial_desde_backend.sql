-- Ejecutar una sola vez al integrar la versión que registra historial en los servicios.
-- Conserva las tablas, los datos y los triggers de integridad/fecha.
-- No ejecutar schema.sql sobre una base que ya contiene las tablas.
BEGIN;
DROP TRIGGER IF EXISTS trg_reserva_historial_aut ON public.reserva;
COMMIT;
