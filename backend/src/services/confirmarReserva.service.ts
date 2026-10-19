import { PoolClient } from 'pg';
import { transaccion } from '../db/pool';
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

// RF-9.5: pasa una reserva de PENDIENTE a CONFIRMADA y deja la 'Y' en el historial (RF-9.12),
// las dos cosas en la misma transacción. Sin db abre su propia transacción.
export async function confirmarReserva(id: string, db?: PoolClient): Promise<Reserva> {
  const confirmar = async (cliente: PoolClient) => {
    const reserva = await buscarReservaPorId(cliente, id, true);
    if (!reserva) throw errores.noEncontrada(id);
    if (reserva.estado !== 'PENDIENTE') throw errores.conflicto('Solo se puede confirmar una reserva PENDIENTE');
    const { origen, destino, tipoVehiculo, fechaHora, zonaHoraria } = reserva;
    validarCambios({ origen, destino, tipoVehiculo, fechaHora, zonaHoraria });
    validarVentana(fechaHora);
    await validarClienteHabilitado(reserva.clienteId);
    const { tarifaEstimada } = await validarRutaYEstimarTarifa(origen, destino, tipoVehiculo);
    const confirmada = await confirmarReservaEnBase(cliente, id, tarifaEstimada);
    if (!confirmada) throw errores.conflicto('La reserva cambió de estado mientras se confirmaba');
    await registrarHistorial(cliente, {
      reservaId: id, tipoCambio: 'CONFIRMACION', campoModificado: 'estado',
      valorAnterior: 'PENDIENTE', valorNuevo: 'CONFIRMADA', rolActor: 'SISTEMA',
    });
    return confirmada;
  };
  return db ? confirmar(db) : transaccion(confirmar);
}
