-- =====================================================================
-- M9 Reservas de Viajes - Esquema de base de datos (PostgreSQL)
-- Copia del esquema real de Supabase. Orden: extension, funciones,
-- tablas, indices, triggers.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_uuidv7()
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_time double precision;
    v_time_ms bigint;
    v_bytes bytea;
BEGIN
    v_time := extract(epoch from clock_timestamp());
    v_time_ms := floor(v_time * 1000)::bigint;

    BEGIN
        v_bytes := decode(
            lpad(to_hex(v_time_ms), 12, '0') || encode(gen_random_bytes(10), 'hex'),
            'hex'
        );
    EXCEPTION WHEN OTHERS THEN
        v_bytes := decode(
            lpad(to_hex(v_time_ms), 12, '0') || encode(extensions.gen_random_bytes(10), 'hex'),
            'hex'
        );
    END;

    v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112); -- Version 7
    v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128); -- Variante RFC 4122

    RETURN encode(v_bytes, 'hex')::uuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_actualizar_modificada_en()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.modificada_en = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_registrar_historial_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_actor_id VARCHAR(64);
    v_rol_actor CHAR(1);
    v_key TEXT;
    v_val_old TEXT;
    v_val_new TEXT;
    v_json_old JSONB;
    v_json_new JSONB;
BEGIN
    v_actor_id := NULLIF(current_setting('app.actor_id', true), '');
    v_rol_actor := COALESCE(NULLIF(current_setting('app.actor_role', true), ''), 'S');
    IF v_rol_actor NOT IN ('C', 'O', 'S') THEN
        v_rol_actor := 'S';
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO historial_reserva (
            reserva_id, tipo_cambio, campo_modificado, valor_anterior, valor_nuevo, actor_id, rol_actor, motivo
        ) VALUES (
            NEW.id, 'C', NULL, NULL, to_jsonb(NEW)::text, v_actor_id, v_rol_actor, 'Creacion inicial de la reserva'
        );
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        v_json_old := to_jsonb(OLD);
        v_json_new := to_jsonb(NEW);

        FOR v_key IN SELECT jsonb_object_keys(v_json_new) LOOP
            IF v_key IN ('modificada_en', 'creada_en', 'clave_idempotencia') THEN
                CONTINUE;
            END IF;

            v_val_old := v_json_old ->> v_key;
            v_val_new := v_json_new ->> v_key;

            IF (v_val_old IS DISTINCT FROM v_val_new) THEN
                INSERT INTO historial_reserva (
                    reserva_id, tipo_cambio, campo_modificado, valor_anterior, valor_nuevo, actor_id, rol_actor, motivo
                ) VALUES (
                    NEW.id,
                    CASE
                        WHEN v_key = 'estado' AND v_val_new = 'C' THEN 'Y'
                        WHEN v_key = 'estado' AND v_val_new = 'A' THEN 'A'
                        WHEN v_key = 'estado' AND v_val_new = 'X' THEN 'X'
                        WHEN v_key = 'estado' AND v_val_new = 'V' THEN 'V'
                        ELSE 'M'
                    END,
                    v_key, v_val_old, v_val_new, v_actor_id, v_rol_actor,
                    CASE WHEN v_key = 'motivo_cancelacion' THEN v_val_new ELSE NULL END
                );
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;

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

-- ---------------------------------------------------------------------
-- Tabla reserva
-- ---------------------------------------------------------------------

create table public.reserva (
  id uuid not null default fn_uuidv7 (),
  cliente_id character varying(64) not null,
  origen jsonb not null,
  destino jsonb not null,
  tipo_vehiculo character(1) not null,
  fecha_hora timestamp with time zone not null,
  zona_horaria text not null default 'America/Argentina/Buenos_Aires'::text,
  estado character(1) not null default 'P'::bpchar,
  tarifa_estimada numeric(12, 2) null,
  motivo_cancelacion text null,
  solicitud_despacho_id character varying(64) null,
  clave_idempotencia uuid not null default fn_uuidv7 (),
  creada_en timestamp with time zone not null default now(),
  modificada_en timestamp with time zone not null default now(),
  constraint reserva_pkey primary key (id),
  constraint reserva_clave_idempotencia_key unique (clave_idempotencia),
  constraint reserva_solicitud_despacho_id_key unique (solicitud_despacho_id),
  constraint chk_reserva_estado check (
    (
      estado = any (
        array[
          'P'::bpchar,
          'C'::bpchar,
          'A'::bpchar,
          'X'::bpchar,
          'V'::bpchar
        ]
      )
    )
  ),
  constraint chk_reserva_origen_json check (
    (
      (jsonb_typeof(origen) = 'object'::text)
      and (
        jsonb_typeof((origen -> 'direccion'::text)) = 'string'::text
      )
      and (
        length(
          TRIM(
            both
            from
              (origen ->> 'direccion'::text)
          )
        ) > 0
      )
      and (
        jsonb_typeof((origen -> 'latitud'::text)) = 'number'::text
      )
      and (
        jsonb_typeof((origen -> 'longitud'::text)) = 'number'::text
      )
      and (
        (
          ((origen ->> 'latitud'::text))::numeric >= ('-90'::integer)::numeric
        )
        and (
          ((origen ->> 'latitud'::text))::numeric <= (90)::numeric
        )
      )
      and (
        (
          ((origen ->> 'longitud'::text))::numeric >= ('-180'::integer)::numeric
        )
        and (
          ((origen ->> 'longitud'::text))::numeric <= (180)::numeric
        )
      )
    )
  ),
  constraint chk_destino_json check (
    (
      (jsonb_typeof(destino) = 'object'::text)
      and (
        jsonb_typeof((destino -> 'direccion'::text)) = 'string'::text
      )
      and (
        jsonb_typeof((destino -> 'latitud'::text)) = 'number'::text
      )
      and (
        jsonb_typeof((destino -> 'longitud'::text)) = 'number'::text
      )
      and (
        (
          ((destino ->> 'latitud'::text))::numeric >= ('-90'::integer)::numeric
        )
        and (
          ((destino ->> 'latitud'::text))::numeric <= (90)::numeric
        )
      )
      and (
        (
          ((destino ->> 'longitud'::text))::numeric >= ('-180'::integer)::numeric
        )
        and (
          ((destino ->> 'longitud'::text))::numeric <= (180)::numeric
        )
      )
      and (
        ((destino -> 'piso'::text) is null)
        or (
          jsonb_typeof((destino -> 'piso'::text)) = any (array['string'::text, 'null'::text])
        )
      )
      and (
        ((destino -> 'alias'::text) is null)
        or (
          jsonb_typeof((destino -> 'alias'::text)) = any (array['string'::text, 'null'::text])
        )
      )
    )
  ),
  constraint chk_reserva_tipo_vehiculo check (
    (
      tipo_vehiculo = any (array['A'::bpchar, 'M'::bpchar])
    )
  ),
  constraint chk_reserva_tarifa_positiva check ((tarifa_estimada >= (0)::numeric)),
  constraint chk_origen_json check (
    (
      (jsonb_typeof(origen) = 'object'::text)
      and (
        jsonb_typeof((origen -> 'direccion'::text)) = 'string'::text
      )
      and (
        jsonb_typeof((origen -> 'latitud'::text)) = 'number'::text
      )
      and (
        jsonb_typeof((origen -> 'longitud'::text)) = 'number'::text
      )
      and (
        (
          ((origen ->> 'latitud'::text))::numeric >= ('-90'::integer)::numeric
        )
        and (
          ((origen ->> 'latitud'::text))::numeric <= (90)::numeric
        )
      )
      and (
        (
          ((origen ->> 'longitud'::text))::numeric >= ('-180'::integer)::numeric
        )
        and (
          ((origen ->> 'longitud'::text))::numeric <= (180)::numeric
        )
      )
      and (
        ((origen -> 'piso'::text) is null)
        or (
          jsonb_typeof((origen -> 'piso'::text)) = any (array['string'::text, 'null'::text])
        )
      )
      and (
        ((origen -> 'alias'::text) is null)
        or (
          jsonb_typeof((origen -> 'alias'::text)) = any (array['string'::text, 'null'::text])
        )
      )
    )
  ),
  constraint chk_reserva_destino_json check (
    (
      (jsonb_typeof(destino) = 'object'::text)
      and (
        jsonb_typeof((destino -> 'direccion'::text)) = 'string'::text
      )
      and (
        length(
          TRIM(
            both
            from
              (destino ->> 'direccion'::text)
          )
        ) > 0
      )
      and (
        jsonb_typeof((destino -> 'latitud'::text)) = 'number'::text
      )
      and (
        jsonb_typeof((destino -> 'longitud'::text)) = 'number'::text
      )
      and (
        (
          ((destino ->> 'latitud'::text))::numeric >= ('-90'::integer)::numeric
        )
        and (
          ((destino ->> 'latitud'::text))::numeric <= (90)::numeric
        )
      )
      and (
        (
          ((destino ->> 'longitud'::text))::numeric >= ('-180'::integer)::numeric
        )
        and (
          ((destino ->> 'longitud'::text))::numeric <= (180)::numeric
        )
      )
    )
  )
);

create index if not exists idx_reserva_cliente on public.reserva using btree (cliente_id);

create index if not exists idx_reserva_estado_fecha on public.reserva using btree (estado, fecha_hora);

-- ---------------------------------------------------------------------
-- Tabla historial_reserva
-- ---------------------------------------------------------------------

create table public.historial_reserva (
  id uuid not null default fn_uuidv7 (),
  reserva_id uuid not null,
  tipo_cambio character(1) not null,
  campo_modificado character varying(50) null,
  valor_anterior text null,
  valor_nuevo text null,
  actor_id character varying(64) null,
  rol_actor character(1) not null,
  motivo text null,
  fecha_cambio timestamp with time zone not null default now(),
  constraint historial_reserva_pkey primary key (id),
  constraint historial_reserva_reserva_id_fkey foreign KEY (reserva_id) references reserva (id) on delete RESTRICT,
  constraint chk_historial_rol_actor check (
    (
      rol_actor = any (array['C'::bpchar, 'O'::bpchar, 'S'::bpchar])
    )
  ),
  constraint chk_historial_tipo_cambio check (
    (
      tipo_cambio = any (
        array[
          'C'::bpchar,
          'Y'::bpchar,
          'M'::bpchar,
          'X'::bpchar,
          'A'::bpchar,
          'V'::bpchar
        ]
      )
    )
  )
);

create index if not exists idx_historial_reserva_id on public.historial_reserva using btree (reserva_id);

-- ---------------------------------------------------------------------
-- Triggers de reserva (se crean al final porque usan las funciones y
-- escriben en historial_reserva)
-- ---------------------------------------------------------------------

create trigger trg_reserva_historial_aut
after INSERT
or
update on reserva for EACH row
execute FUNCTION fn_registrar_historial_reserva ();

create trigger trg_reserva_modificada_en BEFORE
update on reserva for EACH row
execute FUNCTION fn_actualizar_modificada_en ();

create trigger trg_reserva_validar_transicion BEFORE
update on reserva for EACH row
execute FUNCTION fn_validar_transiciones_reserva ();