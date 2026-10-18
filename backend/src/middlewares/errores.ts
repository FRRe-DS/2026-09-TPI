import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

function responderError(
  res: Response,
  status: number,
  codigo: string,
  mensaje: string,
  detalle: unknown = null,
) {
  return res.status(status).json({ codigo, mensaje, detalle });
}

export function rutaNoEncontrada(req: Request, res: Response) {
  responderError(res, 404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.path}`);
}

export function manejadorDeErrores(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return responderError(res, err.status, err.codigo, err.message, err.detalle ?? null);
  }
  if (err?.type === 'entity.parse.failed') {
    return responderError(res, 400, 'JSON_INVALIDO', 'El cuerpo no es un JSON válido');
  }
  if (err?.code === '22P02') {
    return responderError(res, 400, 'ID_INVALIDO', 'El identificador no tiene un formato válido');
  }
  // Errores que vienen de la base (PostgreSQL)
  if (err?.code === '23505') {
    // restricción única: por ejemplo, una segunda activación de la misma reserva
    return responderError(res, 409, 'CONFLICTO', 'La operación ya fue realizada o el dato ya existe');
  }
  if (err?.code === 'P0001') {
    // RAISE EXCEPTION de un trigger: por ejemplo, una transición de estado no permitida
    return responderError(res, 409, 'CONFLICTO', err.message);
  }
  if (err?.code === '23514') {
    // restricción CHECK: un dato con formato no permitido (origen, destino, tipo de vehículo)
    return responderError(res, 400, 'DATOS_INVALIDOS', 'Los datos enviados no cumplen las reglas de la base');
  }
  console.error('Error inesperado:', err);
  return responderError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error inesperado');
}