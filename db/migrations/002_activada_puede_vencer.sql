-- db/migrations/002_activada_puede_vencer.sql
-- Permite ACTIVADA -> VENCIDA (cuando M5 avisa SIN_CONDUCTOR o CANCELADA).
-- El resto de las reglas queda igual. Se puede ejecutar más de una vez.
CREATE OR REPLACE FUNCTION public.fn_validar_transiciones_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.clave_idempotencia IS DISTINCT FROM NEW.clave_idempotencia THEN
        RAISE EXCEPTION 'No se permite modificar la clave_idempotencia de una reserva existente.';
    END IF;

    IF OLD.estado IN ('A', 'X', 'V') THEN
        IF OLD.origen IS DISTINCT FROM NEW.origen OR
           OLD.destino IS DISTINCT FROM NEW.destino OR
           OLD.fecha_hora IS DISTINCT FROM NEW.fecha_hora OR
           OLD.tipo_vehiculo IS DISTINCT FROM NEW.tipo_vehiculo THEN
            RAISE EXCEPTION 'No se pueden modificar origen, destino, fecha_hora o tipo_vehiculo de una reserva en estado final o activado (RF-9.6).';
        END IF;
    END IF;

    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        IF OLD.estado = 'P' AND NEW.estado NOT IN ('C', 'X', 'V') THEN
            RAISE EXCEPTION 'Transicion de estado invalida: Desde P (Pendiente) solo se puede pasar a C, X o V.';
        ELSIF OLD.estado = 'C' AND NEW.estado NOT IN ('A', 'X', 'V') THEN
            RAISE EXCEPTION 'Transicion de estado invalida: Desde C (Confirmada) solo se puede pasar a A, X o V.';
        ELSIF OLD.estado = 'A' AND NEW.estado <> 'V' THEN
            RAISE EXCEPTION 'Transicion de estado invalida: Desde A (Activada) solo se puede pasar a V (sin conductor).';
        ELSIF OLD.estado IN ('X', 'V') THEN
            RAISE EXCEPTION 'Transicion de estado invalida: Una reserva cancelada o vencida no puede cambiar de estado.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
