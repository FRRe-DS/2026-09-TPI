import { NextFunction, Request, Response } from 'express';
import { activarReserva } from '../services/activarReserva.service';

export async function activarReservaCtrl(req: Request, res: Response, next: NextFunction) {
  try {
    const reserva = await activarReserva(req.params.id);
    res.status(200).json(reserva);
  } catch (error) {
    next(error); // el manejador de errores del proyecto arma la respuesta {codigo, mensaje, detalle}
  }
}