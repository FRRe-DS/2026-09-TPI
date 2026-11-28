import { pool, transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { Reserva } from '../models/reserva';
import { registrarHistorial } from '../repositories/historial.repository';
import { buscarReservaPorId, confirmarReservaEnBase } from '../repositories/reserva.repository';
import {
  validarCambios,
  validarClienteHabilitado,
  validarRutaYEstimarTarifa,
  validarVentana,
} from './reserva.validaciones';

// RF-9.5: pasa una reserva de PENDIENTE a CONFIRMADA y deja la 'Y' en el historial (RF-9.12).
// - Con tarifaYaEstimada (la usa crearReserva): los datos ya se validaron al crear, así que
//   no se vuelve a llamar a M2, M4 ni M7.
// - Sin tarifa: lee la reserva SIN bloquearla y valida con M2, M4 y M7 FUERA de la transacción.
// Al final, una transacción corta guarda el cambio con un UPDATE condicionado por el estado
// (solo si sigue PENDIENTE) y el historial. Si el estado cambió en el medio: 409.
export async function confirmarReserva(id: string, tarifaYaEstimada?: number): Promise<Reserva> {
  let tarifaEstimada = tarifaYaEstimada;
  if (tarifaEstimada === undefined) {
    const reserva = await buscarReservaPorId(pool, id);
    if (!reserva) throw errores.noEncontrada(id);
    if (reserva.estado !== 'PENDIENTE') throw errores.conflicto('Solo se puede confirmar una reserva PENDIENTE');
    const { origen, destino, tipoVehiculo, fechaHora, zonaHoraria } = reserva;
    validarCambios({ origen, destino, tipoVehiculo, fechaHora, zonaHoraria });
    validarVentana(fechaHora);
    await validarClienteHabilitado(reserva.clienteId);
    ({ tarifaEstimada } = await validarRutaYEstimarTarifa(origen, destino, tipoVehiculo, fechaHora));
  }
  const tarifa = tarifaEstimada;

  return transaccion(async (db) => {
    const confirmada = await confirmarReservaEnBase(db, id, tarifa);
    if (!confirmada) {
      if (!await buscarReservaPorId(db, id)) throw errores.noEncontrada(id);
      throw errores.conflicto('La reserva cambió de estado mientras se confirmaba');
    }
    await registrarHistorial(db, {
      reservaId: id, tipoCambio: 'CONFIRMACION', campoModificado: 'estado',
      valorAnterior: 'PENDIENTE', valorNuevo: 'CONFIRMADA', rolActor: 'SISTEMA',
    });
    return confirmada;
  });
}
