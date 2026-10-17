import { transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { Reserva } from '../models/reserva';
import {
  buscarReservaPorId,
  guardarSolicitudDespacho,
  tomarReservaParaActivar,
} from '../repositories/reserva.repository';
import { crearSolicitudDespacho } from '../stubs/m5Despacho.stub';

// Activa una reserva CONFIRMADA y le pide a M5 UNA sola solicitud de despacho.
export async function activarReserva(id: string): Promise<Reserva> {
  return transaccion(async (db) => {
    // 1. El "cartel": solo un pedido logra pasar de CONFIRMADA a ACTIVADA.
    const activada = await tomarReservaParaActivar(db, id);

    if (!activada) {
      // Perdió: averiguamos por qué para responder bien.
      const actual = await buscarReservaPorId(db, id);
      if (!actual) throw errores.noEncontrada(id);
      throw errores.conflicto(`La reserva está ${actual.estado} y no se puede activar`, {
        estado: actual.estado,
      });
    }

    // 2. Solo el ganador llega hasta acá: llama a M5 una vez.
    let solicitudId: string;
    try {
      ({ solicitudId } = await crearSolicitudDespacho(activada));
    } catch {
      // Al fallar, la transacción se deshace y la reserva vuelve a CONFIRMADA.
      throw errores.servicioNoDisponible(
        'M5 no pudo crear la solicitud de despacho. La reserva sigue CONFIRMADA y se puede reintentar.',
      );
    }

    // 3. Guarda el id de la solicitud en la reserva.
    const final = await guardarSolicitudDespacho(db, id, solicitudId);
    return final ?? activada;
  });
}