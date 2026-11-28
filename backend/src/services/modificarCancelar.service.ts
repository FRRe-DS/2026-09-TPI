import { config } from '../config/env';
import { pool, transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { CambiosReserva, Reserva } from '../models/reserva';
import { listarHistorial, registrarHistorial } from '../repositories/historial.repository';
import { actualizarDatosReserva, buscarReservaPorId, cancelarReservaEnBase } from '../repositories/reserva.repository';
import { correspondeCargo, registrarCargoCancelacion } from '../integraciones/m7Tarifas';
import {
  reservasCancelacionesCounter,
  reservasModificacionesCounter,
} from '../telemetry/metrics';
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

// Lee la reserva SIN bloquearla: los llamados a otros módulos se hacen fuera de la transacción.
async function buscarOFallar(id: string): Promise<Reserva> {
  const reserva = await buscarReservaPorId(pool, id);
  if (!reserva) throw errores.noEncontrada(id);
  return reserva;
}

function asegurarEditable(reserva: Reserva): void {
  if (reserva.estado !== 'PENDIENTE' && reserva.estado !== 'CONFIRMADA') {
    throw errores.conflicto(`No se puede modificar ni cancelar una reserva ${reserva.estado}`);
  }
}

// RF-9.6. Primero lee y valida (con M4 y M7, fuera de la transacción); al final, una transacción
// corta guarda el cambio con un UPDATE condicionado por el estado y el historial. Si la reserva
// dejó de ser PENDIENTE o CONFIRMADA en el medio: 409.
export async function modificarReserva(id: string, cuerpo: unknown, actorId: string, rolActor = 'CLIENTE') {
  const cambios = validarCambios(await resolverUbicacionesDelCuerpo(cuerpo));
  const actual = await buscarOFallar(id);
  asegurarEditable(actual);
  const ahora = new Date();
  if (actual.fechaHora.getTime() - ahora.getTime() < config.anticipacionMinimaMinutos * 60_000) {
    throw errores.reglaIncumplida('Ya pasó el límite temporal para modificar la reserva', {
      regla: 'LIMITE_MODIFICACION_SUPERADO',
    });
  }
  if (cambios.fechaHora) validarVentana(cambios.fechaHora, ahora);
  // Como en el contrato M9-M7: la tarifa se vuelve a estimar si cambia el origen, el destino o el
  // vehículo. M7 recibe la fecha del viaje (la nueva, si también se reprograma); su contrato aclara
  // que por ahora la fecha no cambia el precio, así que reprogramar solo la fecha no llama a M7.
  if (cambios.origen || cambios.destino || cambios.tipoVehiculo) {
    const origen = cambios.origen ?? actual.origen;
    const destino = cambios.destino ?? actual.destino;
    validarOrigenDestinoDistintos(origen, destino);
    const { tarifaEstimada } = await validarRutaYEstimarTarifa(
      origen, destino, cambios.tipoVehiculo ?? actual.tipoVehiculo, cambios.fechaHora ?? actual.fechaHora,
    );
    cambios.tarifaEstimada = tarifaEstimada;
  }
  const campos = (Object.keys(cambios) as (keyof CambiosReserva)[])
    .filter((campo) => JSON.stringify(actual[campo]) !== JSON.stringify(cambios[campo]));
  if (!campos.length) return actual;

  return transaccion(async (db) => {
    const actualizada = await actualizarDatosReserva(db, id, cambios);
    if (!actualizada) throw errores.conflicto('La reserva cambió de estado mientras se modificaba');
    for (const campo of campos) {
      await registrarHistorial(db, {
        reservaId: id, tipoCambio: 'MODIFICACION', campoModificado: campo,
        valorAnterior: JSON.stringify(actual[campo]), valorNuevo: JSON.stringify(actualizada[campo]),
        actorId, rolActor,
      });
    }
    reservasModificacionesCounter.add(1, { tipoVehiculo: actualizada.tipoVehiculo });
    return actualizada;
  });
}

// RF-9.7. Si corresponde cargo (reserva CONFIRMADA a menos de 60 minutos del viaje), primero se
// registra en M7, fuera de la transacción y con Idempotency-Key = id de la reserva: un reintento no
// cobra dos veces. Si M7 no responde, no se cancela (503) y se puede reintentar.
// Después, una transacción corta cancela con un UPDATE condicionado por el estado y deja el historial.
export async function cancelarReserva(id: string, cuerpo: unknown, actorId: string, rolActor = 'CLIENTE') {
  const motivo = (cuerpo as { motivo?: unknown } | null)?.motivo;
  if (typeof motivo !== 'string' || motivo.trim().length < 3) {
    throw errores.datosInvalidos(['motivo es obligatorio (mínimo 3 caracteres)']);
  }
  const actual = await buscarOFallar(id);
  asegurarEditable(actual);
  if (actual.estado === 'CONFIRMADA' && correspondeCargo(actual.fechaHora)) {
    await registrarCargoCancelacion({
      reservaId: id, clienteId: actual.clienteId, tipoVehiculo: actual.tipoVehiculo, motivo: motivo.trim(),
    });
  }

  return transaccion(async (db) => {
    const cancelada = await cancelarReservaEnBase(db, id, motivo.trim());
    if (!cancelada) throw errores.conflicto('La reserva cambió de estado mientras se cancelaba');
    await registrarHistorial(db, {
      reservaId: id, tipoCambio: 'CANCELACION', campoModificado: 'estado',
      valorAnterior: actual.estado, valorNuevo: 'CANCELADA', motivo: motivo.trim(), actorId, rolActor,
    });
    reservasCancelacionesCounter.add(1, { tipoVehiculo: cancelada.tipoVehiculo });
    return cancelada;
  });
}

export async function obtenerHistorial(id: string) {
  if (!await buscarReservaPorId(pool, id)) throw errores.noEncontrada(id);
  return listarHistorial(pool, id);
}
