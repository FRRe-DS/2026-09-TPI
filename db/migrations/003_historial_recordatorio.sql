-- db/migrations/003_historial_recordatorio.sql
-- Agrega el tipo de cambio 'R' (recordatorio enviado, RF-9.8 / RF-9.12)
-- al CHECK chk_historial_tipo_cambio. Se puede ejecutar más de una vez.

ALTER TABLE public.historial_reserva
  DROP CONSTRAINT IF EXISTS chk_historial_tipo_cambio;

ALTER TABLE public.historial_reserva
  ADD CONSTRAINT chk_historial_tipo_cambio CHECK (
    tipo_cambio = ANY (
      ARRAY[
        'C'::bpchar,
        'Y'::bpchar,
        'M'::bpchar,
        'X'::bpchar,
        'A'::bpchar,
        'V'::bpchar,
        'R'::bpchar
      ]
    )
  );
