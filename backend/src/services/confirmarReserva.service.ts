import { PoolClient } from 'pg';
import { transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { Reserva } from '../models/reserva';
import { registrarHistorial } from '../repositories/historial.repository';
import { buscarReservaPorId, confirmarReservaEnBase } from '../repositories/reserva.repository';
import { verificarClienteHabilitado } from '../stubs/m2Clientes.stub';
import { consultarRuta } from '../stubs/m4Ubicacion.stub';
import { estimarTarifa } from '../stubs/m7Tarifas.stub';
import { validarCambios, validarVentana } from './reserva.validaciones';

// Después de crear: confirmarReserva(creada.id, db). Sin db abre su propia transacción.
export async function confirmarReserva(id: string, db?: PoolClient): Promise<Reserva> {
  const confirmar = async (cliente: PoolClient) => {
    const reserva = await buscarReservaPorId(cliente, id, true);
    if (!reserva) throw errores.noEncontrada(id);
    if (reserva.estado !== 'PENDIENTE') throw errores.conflicto('Solo se puede confirmar una reserva PENDIENTE');
    const { origen, destino, tipoVehiculo, fechaHora, zonaHoraria } = reserva;
    validarCambios({ origen, destino, tipoVehiculo, fechaHora, zonaHoraria });
    validarVentana(fechaHora);
    if (!reserva.clienteId?.trim() || !await verificarClienteHabilitado(reserva.clienteId)) {
      throw errores.reglaIncumplida('El cliente no está habilitado');
    }
    const ruta = await consultarRuta(origen, destino);
    if (!ruta.cubierta) throw errores.reglaIncumplida('El recorrido está fuera de cobertura');
    const tarifa = await estimarTarifa(tipoVehiculo, ruta.distanciaKm);
    const confirmada = await confirmarReservaEnBase(cliente, id, tarifa);
    if (!confirmada) throw errores.conflicto('La reserva cambió de estado mientras se confirmaba');
    await registrarHistorial(cliente, {
      reservaId: id, tipoCambio: 'CONFIRMACION', campoModificado: 'estado',
      valorAnterior: 'PENDIENTE', valorNuevo: 'CONFIRMADA', rolActor: 'SISTEMA',
    });
    return confirmada;
  };
  return db ? confirmar(db) : transaccion(confirmar);
}
