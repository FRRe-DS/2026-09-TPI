// Encabezado X-Request-Id (convención acordada con M2, RNF-14).
// Si el pedido trae uno, lo usamos; si no, generamos uno nuevo.
// Lo devolvemos en la respuesta para poder seguir el pedido entre módulos.
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const recibido = req.get('X-Request-Id');
  const id = recibido && recibido.trim() !== '' ? recibido : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
