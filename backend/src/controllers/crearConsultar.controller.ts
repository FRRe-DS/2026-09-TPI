// Controladores de crear, consultar y listar reservas.
// Las reglas están en los servicios; acá solo se recibe el pedido y se arma la respuesta.
// Los errores se tiran como AppError y el middleware errores.ts responde { codigo, mensaje, detalle } (RNF-03).
import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { AppError } from '../errors/AppError';
import { listarReservasPorCliente } from '../repositories/reserva.repository';
import { consultarReserva, crearReserva } from '../services/crearReserva.service';

// RF-9.4: condiciones de confirmación, modificación y cancelación que se le muestran al cliente.
const CONDICIONES = {
  confirmacion: 'La reserva se confirma si el cliente está habilitado, las ubicaciones son válidas y se cumple la anticipación permitida.',
  modificacion: 'Se permite modificar reservas pendientes o confirmadas hasta 60 minutos antes del viaje. La nueva fecha debe respetar la anticipación mínima de 60 minutos y máxima de 30 días.',
  cancelacion: 'Se permite cancelar reservas pendientes o confirmadas hasta 60 minutos antes del viaje.',
  activacion: 'Una reserva activada no puede modificarse ni cancelarse.',
  tarifa: 'La tarifa informada es estimada y no representa un precio definitivo.',
};

// POST /reservas
export async function crearReservaCtrl(req: Request, res: Response) {
  const resultado = await crearReserva(req.body);

  if (resultado.yaExistia) {
    res.status(200).json({
      mensaje: 'Esta solicitud ya tiene una reserva registrada',
      reserva: resultado.reserva,
      condiciones: CONDICIONES,
    });
    return;
  }

  res.status(201).json({
    mensaje: resultado.confirmada
      ? 'Reserva creada y confirmada correctamente'
      : 'Reserva creada, pendiente de confirmación',
    motivo: resultado.motivo,
    reserva: resultado.reserva,
    condiciones: CONDICIONES,
  });
}

// GET /reservas/:id
export async function consultarReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await consultarReserva(String(req.params.id)));
}

// GET /reservas?clienteId=...
export async function listarReservasCtrl(req: Request, res: Response) {
  const clienteId = req.query.clienteId;
  if (typeof clienteId !== 'string' || clienteId.trim() === '') {
    throw new AppError(400, 'CLIENTE_ID_REQUERIDO', 'Debes indicar el identificador del cliente');
  }
  res.status(200).json(await listarReservasPorCliente(pool, clienteId));
}
