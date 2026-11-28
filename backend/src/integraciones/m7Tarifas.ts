// M7 (Tarifas, Pagos y Liquidaciones).
// RF-9.4: estimación de la tarifa. RF-9.7: cargo de cancelación.
import { config } from '../config/env';
import { AppError } from '../errors/AppError';
import { TipoVehiculo } from '../models/reserva';
import { llamarModulo } from './httpCliente';

interface Estimacion {
  desglose?: { total?: number };
}

function respuestaInesperada(status: number): AppError {
  return new AppError(503, 'SERVICIO_NO_DISPONIBLE', `M7 respondió de forma inesperada (HTTP ${status})`, {
    modulo: 'M7',
  });
}

export interface DatosEstimacion {
  tipoVehiculo: TipoVehiculo;
  distanciaKm: number;
  duracionMin: number;
  fechaHora: Date;
}

// POST {M7_URL}/api/v1/tarifas/estimaciones. Devuelve desglose.total (la tarifa estimada).
export async function estimarTarifa(datos: DatosEstimacion): Promise<number> {
  const { status, datos: estimacion } = await llamarModulo<Estimacion>({
    modulo: 'M7',
    metodo: 'POST',
    url: `${config.m7Url}/api/v1/tarifas/estimaciones`,
    cuerpo: {
      tipo_vehiculo: datos.tipoVehiculo.toLowerCase(), // el contrato de M7 usa auto / moto
      distancia_km: datos.distanciaKm,
      duracion_estimada_min: datos.duracionMin,
      fecha_hora: datos.fechaHora.toISOString(),
    },
  });

  const total = estimacion?.desglose?.total;
  if (status !== 200 || typeof total !== 'number') throw respuestaInesperada(status);
  return total;
}

// Opción por defecto de la tabla de acuerdos (Persona 5): sin cargo hasta 60 minutos antes
// del viaje; después, cargo con metodo "tarjeta".
export const MINUTOS_SIN_CARGO = 60;
export const METODO_CARGO = 'tarjeta'; // el contrato de M7 acepta tarjeta o billetera_virtual (no efectivo)
export const MAX_MOTIVO_M7 = 500;

export function correspondeCargo(fechaHoraViaje: Date, ahora = new Date()): boolean {
  return fechaHoraViaje.getTime() - ahora.getTime() < MINUTOS_SIN_CARGO * 60_000;
}

export interface DatosCargo {
  reservaId: string;
  clienteId: string;
  tipoVehiculo: TipoVehiculo;
  motivo: string;
}

// POST {M7_URL}/api/v1/cargos-cancelacion, con Idempotency-Key = id de la reserva.
// 201: cargo nuevo. 200: ya se había pedido con la misma clave (no cobra de nuevo).
// 409: la reserva ya tiene un cargo. 422: la regla de M7 no tiene cargo. En esos casos se sigue sin error.
export async function registrarCargoCancelacion(datos: DatosCargo): Promise<void> {
  const { status } = await llamarModulo({
    modulo: 'M7',
    metodo: 'POST',
    url: `${config.m7Url}/api/v1/cargos-cancelacion`,
    claveIdempotencia: datos.reservaId,
    cuerpo: {
      reserva_id: datos.reservaId,
      cliente_id: datos.clienteId,
      tipo_vehiculo: datos.tipoVehiculo.toLowerCase(),
      metodo: METODO_CARGO,
      motivo: datos.motivo.slice(0, MAX_MOTIVO_M7), // M7 acepta hasta 500 caracteres
    },
  });

  if (![200, 201, 409, 422].includes(status)) throw respuestaInesperada(status);
}
