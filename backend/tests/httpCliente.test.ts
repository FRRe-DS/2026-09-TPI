import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/integraciones/tokenServicio', () => ({
  obtenerTokenServicio: vi.fn(async () => 'token-de-prueba'),
}));

import express from 'express';
import request from 'supertest';
import { llamarModulo, ejecutarConRequestId } from '../src/integraciones/httpCliente';
import { AppError } from '../src/errors/AppError';
import { config } from '../src/config/env';

const URL_M2 = 'http://m2.test/api/v1/clientes/cli-1/estado-cuenta';

function respuestaJson(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorDeRed(): Error {
  return new TypeError('fetch failed');
}

function errorDeTiempo(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

// Respuesta que entrega los encabezados pero falla al leer el cuerpo.
function respuestaCortada(error: Error): Response {
  return new Response(new ReadableStream({ start: (control) => control.error(error) }), { status: 200 });
}

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSimulado = vi.fn();
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function capturarError(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba un error y no hubo');
}

describe('httpCliente.llamarModulo', () => {
  it('respuesta correcta: devuelve estado y datos, con token y X-Request-Id', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaJson(200, { estado: 'ACTIVO' }));

    const resultado = await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2, requestId: 'req-123' });

    expect(resultado).toEqual({ status: 200, datos: { estado: 'ACTIVO' } });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe(URL_M2);
    expect(opciones.method).toBe('GET');
    expect(opciones.headers.Authorization).toBe('Bearer token-de-prueba');
    expect(opciones.headers['X-Request-Id']).toBe('req-123');
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it('envía el cuerpo en JSON y la clave de idempotencia como Idempotency-Key', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaJson(201, { id: 'cargo-1' }));

    await llamarModulo({
      modulo: 'M7',
      metodo: 'POST',
      url: 'http://m7.test/api/v1/cargos-cancelacion',
      cuerpo: { reserva_id: 'r-1' },
      claveIdempotencia: 'r-1',
    });

    const [, opciones] = fetchSimulado.mock.calls[0];
    expect(opciones.headers['Content-Type']).toBe('application/json');
    expect(opciones.headers['Idempotency-Key']).toBe('r-1');
    expect(JSON.parse(opciones.body)).toEqual({ reserva_id: 'r-1' });
  });

  it('respuesta sin cuerpo (204): datos queda vacío', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaJson(204));

    const resultado = await llamarModulo({ modulo: 'M5', metodo: 'GET', url: 'http://m5.test/x' });

    expect(resultado).toEqual({ status: 204, datos: undefined });
  });

  it('devuelve el texto tal cual si la respuesta no es JSON', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response('hola', { status: 200 }));

    const resultado = await llamarModulo({ modulo: 'M4', metodo: 'GET', url: 'http://m4.test/x' });

    expect(resultado.datos).toBe('hola');
  });

  it('4xx: no reintenta y devuelve la respuesta para que decida quien llama', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaJson(404, { codigo: 'NO_ENCONTRADO' }));

    const resultado = await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 });

    expect(resultado.status).toBe(404);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('5xx en un GET: reintenta 2 veces y si sigue fallando lanza 503', async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(500));

    const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));

    expect(fetchSimulado).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(503);
    expect(error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    expect(error.detalle).toEqual({ modulo: 'M2' });
  });

  it('5xx y después respuesta correcta: devuelve la respuesta del reintento', async () => {
    fetchSimulado
      .mockResolvedValueOnce(respuestaJson(503))
      .mockResolvedValueOnce(respuestaJson(200, { estado: 'ACTIVO' }));

    const resultado = await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 });

    expect(resultado.status).toBe(200);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it('5xx en un POST sin clave de idempotencia: no reintenta', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(500));

    const error = await capturarError(
      llamarModulo({ modulo: 'M7', metodo: 'POST', url: 'http://m7.test/api/v1/tarifas/estimaciones', cuerpo: {} }),
    );

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(503);
    expect(error.detalle).toEqual({ modulo: 'M7' });
  });

  it('servicio caído: reintenta 2 veces y lanza 503', async () => {
    fetchSimulado.mockRejectedValue(errorDeRed());

    const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));

    expect(fetchSimulado).toHaveBeenCalledTimes(3);
    expect(error.status).toBe(503);
    expect(error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it('conexión cortada mientras llega el cuerpo en un GET: reintenta', async () => {
    fetchSimulado
      .mockResolvedValueOnce(respuestaCortada(errorDeRed()))
      .mockResolvedValueOnce(respuestaJson(200, { estado: 'ACTIVO' }));

    const resultado = await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 });

    expect(resultado.datos).toEqual({ estado: 'ACTIVO' });
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it('tiempo agotado mientras llega el cuerpo: lanza 503', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaCortada(errorDeTiempo()));

    const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));

    expect(error.status).toBe(503);
    expect(error.detalle).toEqual({ modulo: 'M2' });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('tiempo agotado: lanza 503 sin reintentar', async () => {
    fetchSimulado.mockRejectedValue(errorDeTiempo());

    const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(503);
    expect(error.message).toContain(`${config.timeoutModulosMs} ms`);
  });

  it('tiempo agotado de verdad: corta el pedido según TIMEOUT_MODULOS_MS', async () => {
    const original = config.timeoutModulosMs;
    config.timeoutModulosMs = 50;
    fetchSimulado.mockImplementation(
      (_url: string, opciones: RequestInit) =>
        new Promise((_resolver, rechazar) => {
          opciones.signal?.addEventListener('abort', () => rechazar(opciones.signal?.reason));
        }),
    );

    try {
      const inicio = Date.now();
      const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));
      expect(error.status).toBe(503);
      expect(Date.now() - inicio).toBeLessThan(1000);
    } finally {
      config.timeoutModulosMs = original;
    }
  });

  it('toma el X-Request-Id del pedido original sin pasarlo a mano (middleware + ruta async)', async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(200, { estado: 'ACTIVO' }));
    const app = express();
    app.use((req, _res, next) => ejecutarConRequestId(req.get('X-Request-Id') ?? 'sin-id', next));
    app.get('/prueba', async (_req, res) => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      const resultado = await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 });
      res.json(resultado);
    });

    await request(app).get('/prueba').set('X-Request-Id', 'pedido-A').expect(200);
    await request(app).get('/prueba').set('X-Request-Id', 'pedido-B').expect(200);

    expect(fetchSimulado.mock.calls[0][1].headers['X-Request-Id']).toBe('pedido-A');
    expect(fetchSimulado.mock.calls[1][1].headers['X-Request-Id']).toBe('pedido-B');
  });

  it('el requestId pasado a mano tiene prioridad; sin ninguno no se manda el encabezado', async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(200));

    await ejecutarConRequestId('del-contexto', () =>
      llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2, requestId: 'explicito' }),
    );
    await llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 });

    expect(fetchSimulado.mock.calls[0][1].headers['X-Request-Id']).toBe('explicito');
    expect(fetchSimulado.mock.calls[1][1].headers['X-Request-Id']).toBeUndefined();
  });

  it('el tiempo máximo es para el llamado completo: los reintentos no lo estiran', async () => {
    const original = config.timeoutModulosMs;
    config.timeoutModulosMs = 120;
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controlador = new AbortController();
      setTimeout(() => controlador.abort(new DOMException('Tiempo agotado', 'TimeoutError')), ms);
      return controlador.signal;
    });
    // Cada intento tarda 50 ms y responde 500: el tercero ya no entra en los 120 ms.
    fetchSimulado.mockImplementation(
      (_url: string, opciones: RequestInit) =>
        new Promise((resolver, rechazar) => {
          const espera = setTimeout(() => resolver(respuestaJson(500)), 50);
          opciones.signal?.addEventListener('abort', () => {
            clearTimeout(espera);
            rechazar(opciones.signal?.reason);
          });
        }),
    );

    try {
      const resultado = capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));
      await vi.advanceTimersByTimeAsync(120);
      const error = await resultado;
      expect(error.status).toBe(503);
      expect(fetchSimulado).toHaveBeenCalledTimes(3);
      expect(timeout.mock.calls).toEqual([[120], [70], [20]]);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
      config.timeoutModulosMs = original;
    }
  });

  it('si el tiempo ya se terminó, no hace otro intento', async () => {
    const original = config.timeoutModulosMs;
    config.timeoutModulosMs = 30;
    // El módulo tarda más que el tiempo total y responde 500: no queda tiempo para reintentar.
    fetchSimulado.mockImplementation(
      () => new Promise((resolver) => setTimeout(() => resolver(respuestaJson(500)), 60)),
    );

    try {
      const error = await capturarError(llamarModulo({ modulo: 'M2', metodo: 'GET', url: URL_M2 }));
      expect(error.status).toBe(503);
      expect(fetchSimulado).toHaveBeenCalledTimes(1);
    } finally {
      config.timeoutModulosMs = original;
    }
  });
});
