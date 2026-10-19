import { PoolClient } from 'pg';
import { config } from '../config/env';
import { pool, transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { CambiosReserva, Reserva } from '../models/reserva';
import { listarHistorial, registrarHistorial } from '../repositories/historial.repository';
import { actualizarDatosReserva, buscarReservaPorId, cancelarReservaEnBase } from '../repositories/reserva.repository';
import {
  resolverUbicacion,
  validarCambios,
  validarOrigenDestinoDistintos,
  validarRutaYEstimarTarifa,
  validarVentana,
} from './reserva.validaciones';

// Origen y destino aceptan texto u objeto con coordenadas, igual que al crear.
async function resolverUbicacionesDelCuerpo(cuerpo: unknown): Promise<unknown> {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return cuerpo;
  const datos = { ...(cuerpo as Record<string, unknown>) };
  for (const campo of ['origen', 'destino'] as const) {
    if (typeof datos[campo] === 'string') datos[campo] = await resolverUbicacion(datos[campo]);
  }
  return datos;
}

async function buscarOFallar(db: PoolClient, id: string): Promise<Reserva> {
  const reserva = await buscarReservaPorId(db, id, true);
  if (!reserva) throw errores.noEncontrada(id);
  return reserva;
}

function asegurarEditable(reserva: Reserva): void {
  if (reserva.estado !== 'PENDIENTE' && reserva.estado !== 'CONFIRMADA') {
    throw errores.conflicto(`No se puede modificar ni cancelar una reserva ${reserva.estado}`);
  }
}

export async function modificarReserva(id: string, cuerpo: unknown, actorId: string, rolActor = 'CLIENTE') {
  const cambios = validarCambios(await resolverUbicacionesDelCuerpo(cuerpo));
  return transaccion(async (db) => {
    const actual = await buscarOFallar(db, id);
    asegurarEditable(actual);
    const ahora = new Date();
    if (actual.fechaHora.getTime() - ahora.getTime() < config.anticipacionMinimaMinutos * 60_000) {
      throw errores.reglaIncumplida('Ya pasó el límite temporal para modificar la reserva', {
        regla: 'LIMITE_MODIFICACION_SUPERADO',
      });
    }
    if (cambios.fechaHora) validarVentana(cambios.fechaHora, ahora);
    if (cambios.origen || cambios.destino || cambios.tipoVehiculo) {
      const origen = cambios.origen ?? actual.origen;
      const destino = cambios.destino ?? actual.destino;
      validarOrigenDestinoDistintos(origen, destino);
      const { tarifaEstimada } = await validarRutaYEstimarTarifa(
        origen, destino, cambios.tipoVehiculo ?? actual.tipoVehiculo,
      );
      cambios.tarifaEstimada = tarifaEstimada;
    }
    const campos = (Object.keys(cambios) as (keyof CambiosReserva)[])
      .filter((campo) => JSON.stringify(actual[campo]) !== JSON.stringify(cambios[campo]));
    if (!campos.length) return actual;
    const actualizada = await actualizarDatosReserva(db, id, cambios);
    if (!actualizada) throw errores.conflicto('La reserva cambió de estado mientras se modificaba');
    for (const campo of campos) {
      await registrarHistorial(db, {
        reservaId: id, tipoCambio: 'MODIFICACION', campoModificado: campo,
        valorAnterior: JSON.stringify(actual[campo]), valorNuevo: JSON.stringify(actualizada[campo]),
        actorId, rolActor,
      });
    }
    return actualizada;
  });
}

export async function cancelarReserva(id: string, cuerpo: unknown, actorId: string, rolActor = 'CLIENTE') {
  const motivo = (cuerpo as { motivo?: unknown } | null)?.motivo;
  if (typeof motivo !== 'string' || motivo.trim().length < 3) {
    throw errores.datosInvalidos(['motivo es obligatorio (mínimo 3 caracteres)']);
  }
  return transaccion(async (db) => {
    const actual = await buscarOFallar(db, id);
    asegurarEditable(actual);
    const cancelada = await cancelarReservaEnBase(db, id, motivo.trim());
    if (!cancelada) throw errores.conflicto('La reserva cambió de estado mientras se cancelaba');
    await registrarHistorial(db, {
      reservaId: id, tipoCambio: 'CANCELACION', campoModificado: 'estado',
      valorAnterior: actual.estado, valorNuevo: 'CANCELADA', motivo: motivo.trim(), actorId, rolActor,
    });
    return cancelada;
  });
}

export async function obtenerHistorial(id: string) {
  if (!await buscarReservaPorId(pool, id)) throw errores.noEncontrada(id);
  return listarHistorial(pool, id);
}
