// Encabezado X-Request-Id (convención acordada con M2, RNF-14).
// Si el pedido trae uno, lo usamos; si no, generamos uno nuevo.
// Lo devolvemos en la respuesta para poder seguir el pedido entre módulos,
// y lo dejamos disponible para que httpCliente lo reenvíe a los otros módulos.
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { ejecutarConRequestId } from '../integraciones/httpCliente';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const recibido = req.get('X-Request-Id');
  const id = recibido && recibido.trim() !== '' ? recibido : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);

  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttribute('http.request_id', id);
  }

  ejecutarConRequestId(id, next);
}
