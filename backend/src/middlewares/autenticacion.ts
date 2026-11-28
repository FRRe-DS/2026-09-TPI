import { NextFunction, Request, Response, Router } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/env';
import { pool } from '../db/pool';
import { AppError, errores } from '../errors/AppError';
import { buscarReservaPorId } from '../repositories/reserva.repository';

interface Identidad {
  id: string;
  roles: Set<unknown>;
  clienteAutorizado: unknown;
}

let claves: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

function sinPermiso(): AppError {
  return new AppError(403, 'SIN_PERMISO', 'No tenés permiso para realizar esta operación');
}

async function verificarToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '')?.[1];
  if (!token) throw new AppError(401, 'NO_AUTENTICADO', 'Se requiere un token Bearer');

  try {
    const realm = `${config.keycloakUrl.replace(/\/+$/, '')}/realms/${encodeURIComponent(config.keycloakRealm)}`;
    // Con Docker, el emisor público puede ser distinto de la URL interna para obtener las claves.
    const emisor = process.env.KEYCLOAK_ISSUER || realm;
    const url = `${realm}/protocol/openid-connect/certs`;
    if (claves?.url !== url) {
      claves = { url, jwks: createRemoteJWKSet(new URL(url)) };
    }
    const { payload } = await jwtVerify(token, claves.jwks, {
      issuer: emisor,
      requiredClaims: ['sub', 'exp'],
    });
    if (payload.typ !== 'Bearer' || !payload.sub) throw new Error('Token de acceso inválido');
    const realmRoles = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
    res.locals.identidad = {
      id: payload.sub,
      roles: new Set([
        ...(Array.isArray(payload.roles) ? payload.roles : []),
        ...(Array.isArray(realmRoles) ? realmRoles : []),
      ]),
      clienteAutorizado: payload.azp,
    } satisfies Identidad;
  } catch {
    throw new AppError(401, 'NO_AUTENTICADO', 'El token no es válido o está vencido');
  }
  next();
}

function autorizarUsuarios(req: Request, res: Response, next: NextFunction): void {
  const { id, roles } = res.locals.identidad as Identidad;
  if (!roles.has('CLIENTE') && !roles.has('OPERADOR')) throw sinPermiso();

  // Los controladores existentes usan estos encabezados para el historial.
  // Con autenticación activa, su valor proviene del JWT verificado.
  req.headers['x-actor'] = id;
  req.headers['x-rol'] = roles.has('OPERADOR') ? 'OPERADOR' : 'CLIENTE';
  next();
}

async function autorizarReservaPropia(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  const { id, roles } = res.locals.identidad as Identidad;
  if (!roles.has('OPERADOR')) {
    const reserva = await buscarReservaPorId(pool, req.params.id);
    if (!reserva) throw errores.noEncontrada(req.params.id);
    if (reserva.clienteId !== id) throw sinPermiso();
  }
  next();
}

function autorizarClienteId(req: Request, res: Response, next: NextFunction): void {
  const { id, roles } = res.locals.identidad as Identidad;
  const clienteId = req.method === 'POST' ? req.body?.clienteId : req.query.clienteId;
  if (!roles.has('OPERADOR') && typeof clienteId === 'string' && clienteId.trim() && clienteId !== id) throw sinPermiso();
  next();
}

const seguridad = Router();

seguridad.post('/:id/despacho', verificarToken, (_req, res, next) => {
  const { roles, clienteAutorizado } = res.locals.identidad as Identidad;
  // En el realm de la cátedra, la cuenta de servicio de M5 tiene el rol solicitud-be.
  const esM5 = clienteAutorizado === 'grupo-04' && roles.has('solicitud-be');
  if (!roles.has('SERVICIO') && !esM5) throw sinPermiso();
  next('router');
});

seguridad.use(verificarToken, autorizarUsuarios);

seguridad.route('/').get(autorizarClienteId).post(autorizarClienteId);

seguridad.get('/:id', autorizarReservaPropia);
seguridad.patch('/:id', autorizarReservaPropia);
seguridad.get('/:id/historial', autorizarReservaPropia);
seguridad.post('/:id/cancelar', autorizarReservaPropia);
seguridad.post('/:id/activar', (_req, res, next) => {
  if (!(res.locals.identidad as Identidad).roles.has('OPERADOR')) throw sinPermiso();
  next();
});

export function autenticacion(req: Request, res: Response, next: NextFunction): void {
  if (!config.authHabilitada) return next();
  seguridad(req, res, next);
}
