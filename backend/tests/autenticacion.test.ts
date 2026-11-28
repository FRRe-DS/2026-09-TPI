import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { config } from '../src/config/env';
import { autenticacion } from '../src/middlewares/autenticacion';
import { Reserva } from '../src/models/reserva';
import { buscarReservaPorId, listarReservasPorCliente } from '../src/repositories/reserva.repository';
import { cancelarReserva, modificarReserva } from '../src/services/modificarCancelar.service';

vi.mock('../src/db/pool', () => ({ pool: { query: vi.fn().mockResolvedValue({}) } }));
vi.mock('../src/repositories/reserva.repository', () => ({
  buscarReservaPorId: vi.fn(),
  listarReservasPorCliente: vi.fn(),
}));
vi.mock('../src/services/modificarCancelar.service', () => ({
  cancelarReserva: vi.fn(),
  modificarReserva: vi.fn(),
  obtenerHistorial: vi.fn().mockResolvedValue([]),
}));

const id = '03e0cabc-4dcf-4fd1-86a5-03a84631a60d';
const idCliente = 'cliente-dueño';
const urlKeycloak = 'http://keycloak-auth.prueba';
const realm = 'ds-2026-realm';
const emisor = `${urlKeycloak}/realms/${realm}`;
let claves: Awaited<ReturnType<typeof generateKeyPair>>;
let otrasClaves: Awaited<ReturnType<typeof generateKeyPair>>;
let publicarClaves: () => Response;

beforeAll(async () => {
  claves = await generateKeyPair('RS256');
  otrasClaves = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(claves.publicKey), alg: 'RS256', kid: 'realm-key' };
  publicarClaves = () => Response.json({ keys: [jwk] });
});

beforeEach(() => {
  config.authHabilitada = true;
  config.keycloakUrl = urlKeycloak;
  config.keycloakRealm = realm;
  config.frontUrl = 'http://frontend.prueba';
  vi.stubEnv('KEYCLOAK_ISSUER', '');
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(String(url)).toBe(`${emisor}/protocol/openid-connect/certs`);
    return publicarClaves();
  }));
  vi.mocked(buscarReservaPorId).mockResolvedValue({ id, clienteId: idCliente } as Reserva);
  vi.mocked(listarReservasPorCliente).mockResolvedValue([]);
  vi.mocked(cancelarReserva).mockResolvedValue({ id } as Reserva);
  vi.mocked(modificarReserva).mockResolvedValue({ id } as Reserva);
});

afterEach(() => {
  config.authHabilitada = false;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

interface OpcionesToken {
  sujeto?: string;
  vence?: string;
  firmaInvalida?: boolean;
  otroEmisor?: boolean;
  cliente?: string;
  tipo?: string;
  rolesRealm?: string[];
  issuer?: string;
}

async function token(roles: string[], opciones: OpcionesToken = {}) {
  const jwt = await new SignJWT({
    roles,
    typ: opciones.tipo ?? 'Bearer',
    azp: opciones.cliente ?? 'm9-front',
    realm_access: { roles: opciones.rolesRealm ?? [] },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'realm-key' })
    .setIssuer(opciones.issuer ?? (opciones.otroEmisor ? 'http://otro-emisor.prueba' : emisor))
    .setSubject(opciones.sujeto ?? idCliente)
    .setExpirationTime(opciones.vence ?? '5m')
    .sign(opciones.firmaInvalida ? otrasClaves.privateKey : claves.privateKey);
  return `Bearer ${jwt}`;
}

describe('Autenticación y permisos de reservas', () => {
  it('devuelve 401 si no hay Bearer', async () => {
    const res = await request(app).get('/reservas');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ codigo: 'NO_AUTENTICADO', detalle: null });
  });

  it.each([
    { vence: '-2m' },
    { firmaInvalida: true },
    { otroEmisor: true },
    { tipo: 'ID' },
    { sujeto: '' },
  ])('rechaza un token inválido %j', async (opciones) => {
    await request(app).get(`/reservas/${id}`).set('Authorization', await token(['CLIENTE'], opciones)).expect(401);
    expect(buscarReservaPorId).not.toHaveBeenCalled();
  });

  it('devuelve 403 si el rol no puede ver reservas', async () => {
    await request(app).get(`/reservas/${id}`).set('Authorization', await token(['CONDUCTOR'])).expect(403);
    expect(buscarReservaPorId).not.toHaveBeenCalled();
  });

  it('permite un emisor público configurado con JWKS en la URL interna', async () => {
    const issuer = 'http://localhost:8080/realms/ds-2026-realm';
    vi.stubEnv('KEYCLOAK_ISSUER', issuer);
    await request(app).get(`/reservas/${id}`).set('Authorization', await token(['CLIENTE'], { issuer })).expect(200);
    await request(app).get(`/reservas/${id}`).set('Authorization', await token(['CLIENTE'])).expect(401);
  });

  it('compara el cliente de la consulta y de la creación con el sub', async () => {
    const authorization = await token(['CLIENTE']);
    await request(app).get('/reservas?clienteId=otro').set('Authorization', authorization).expect(403);
    await request(app).post('/reservas').set('Authorization', authorization).send({ clienteId: 'otro' }).expect(403);
    await request(app).get('/reservas').query({ clienteId: idCliente }).set('Authorization', authorization).expect(200);
    expect(listarReservasPorCliente).toHaveBeenCalledWith(expect.anything(), idCliente);
  });

  it('protege detalle, historial, modificación y cancelación de reservas ajenas', async () => {
    const authorization = await token(['CLIENTE'], { sujeto: 'otro' });
    await request(app).get(`/reservas/${id}`).set('Authorization', authorization).expect(403);
    await request(app).get(`/reservas/${id}/historial`).set('Authorization', authorization).expect(403);
    await request(app).patch(`/reservas/${id}`).set('Authorization', authorization).send({}).expect(403);
    await request(app).post(`/reservas/${id}/cancelar`).set('Authorization', authorization).send({}).expect(403);
    expect(modificarReserva).not.toHaveBeenCalled();
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  it('permite el acceso a una reserva propia y devuelve 404 si no existe', async () => {
    const authorization = await token(['CLIENTE']);
    await request(app).get(`/reservas/${id}`).set('Authorization', authorization).expect(200);
    await request(app).get(`/reservas/${id}/historial`).set('Authorization', authorization).expect(200);
    vi.mocked(buscarReservaPorId).mockResolvedValueOnce(null);
    await request(app).get(`/reservas/${id}`).set('Authorization', authorization).expect(404);
  });

  it('atribuye los cambios a la identidad autenticada e ignora los encabezados del cliente', async () => {
    const authorization = await token(['CLIENTE']);
    await request(app).patch(`/reservas/${id}`).set('Authorization', authorization)
      .set('X-Actor', 'otro').set('X-Rol', 'OPERADOR').send({ tipoVehiculo: 'MOTO' }).expect(200);
    expect(modificarReserva).toHaveBeenCalledWith(id, { tipoVehiculo: 'MOTO' }, idCliente, 'CLIENTE');
  });

  it('permite que un operador liste y cancele reservas ajenas', async () => {
    const authorization = await token([], { sujeto: 'operador', rolesRealm: ['OPERADOR'] });
    await request(app).get('/reservas?clienteId=otro').set('Authorization', authorization).expect(200);
    await request(app).post(`/reservas/${id}/cancelar`).set('Authorization', authorization)
      .send({ motivo: 'pedido del cliente' }).expect(200);
    expect(cancelarReserva).toHaveBeenCalledWith(id, { motivo: 'pedido del cliente' }, 'operador', 'OPERADOR');
    expect(buscarReservaPorId).not.toHaveBeenCalled();
  });

  it('deniega activación manual a CLIENTE', async () => {
    await request(app).post(`/reservas/${id}/activar`).set('Authorization', await token(['CLIENTE'])).expect(403);
  });

  it('autoriza el callback al rol de servicio y a la cuenta de M5 del realm local', async () => {
    const ruta = `/reservas/${id}/despacho`;
    await request(app).post(ruta).set('Authorization', await token(['CLIENTE'])).expect(403);
    await request(app).post(ruta).set('Authorization', await token(['solicitud-be'])).expect(403);
    const appConDespacho = express();
    appConDespacho.use('/reservas', autenticacion);
    appConDespacho.post('/reservas/:id/despacho', (_req, res) => res.sendStatus(204));
    await request(appConDespacho).post(ruta).set('Authorization', await token(['SERVICIO'])).expect(204);
    await request(appConDespacho).post(ruta)
      .set('Authorization', await token(['solicitud-be'], { cliente: 'grupo-04' })).expect(204);
  });

  it('permite deshabilitar la autenticación para pruebas locales', async () => {
    config.authHabilitada = false;
    await request(app).get('/reservas?clienteId=otro').expect(200);
  });
});

describe('Controles web', () => {
  it('deja públicos health y docs, y agrega encabezados de Helmet', async () => {
    await request(app).get('/health').expect('X-Content-Type-Options', 'nosniff').expect(200);
    await request(app).get('/docs/').expect(200);
  });

  it('responde al preflight del frontend configurado', async () => {
    await request(app).options('/reservas').set('Origin', config.frontUrl)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect('Access-Control-Allow-Origin', config.frontUrl).expect(204);
    const res = await request(app).get('/health').set('Origin', 'http://otro.origen').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rechaza JSON de más de 100 KB con el formato de error de M9', async () => {
    const res = await request(app).post('/reservas').send({ texto: 'x'.repeat(100 * 1024 + 1) }).expect(413);
    expect(res.body).toMatchObject({ codigo: 'CUERPO_DEMASIADO_GRANDE', detalle: null });
  });
});
