// Base común para llamar a otros módulos (RNF-13).
// - Tiempo máximo de espera: TIMEOUT_MODULOS_MS.
// - Reintenta hasta 2 veces solo si falla la red o la respuesta es 5xx,
//   y además la operación es GET o lleva clave de idempotencia.
// - Reenvía X-Request-Id del pedido original y agrega el token de servicio.
// - Si el módulo no responde a tiempo o está caído: AppError 503 SERVICIO_NO_DISPONIBLE.
// Las respuestas 2xx y 4xx se devuelven tal cual: decide quien llama.
// (Las redirecciones 3xx las sigue fetch automáticamente.)
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config/env';
import { AppError } from '../errors/AppError';
import { obtenerTokenServicio } from './tokenServicio';

export type Modulo = 'M2' | 'M4' | 'M5' | 'M7' | 'M8';

export interface PedidoModulo {
  modulo: Modulo;
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  cuerpo?: unknown;
  requestId?: string;
  claveIdempotencia?: string;
}

export interface RespuestaModulo<T = unknown> {
  status: number;
  datos: T | undefined;
}

export const MAX_REINTENTOS = 2;

// X-Request-Id del pedido original. El middleware requestId lo guarda con
// ejecutarConRequestId(id, next) y llamarModulo lo toma de acá, sin que haga falta
// pasarlo a mano por controladores y servicios.
const pedidoActual = new AsyncLocalStorage<string>();

export function ejecutarConRequestId<T>(requestId: string, funcion: () => T): T {
  return pedidoActual.run(requestId, funcion);
}

function noDisponible(modulo: Modulo, mensaje: string): AppError {
  return new AppError(503, 'SERVICIO_NO_DISPONIBLE', mensaje, { modulo });
}

async function leerCuerpo(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text();
  if (texto === '') return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export async function llamarModulo<T = unknown>(pedido: PedidoModulo): Promise<RespuestaModulo<T>> {
  const { modulo, metodo, url, cuerpo, claveIdempotencia } = pedido;
  const requestId = pedido.requestId ?? pedidoActual.getStore();

  const encabezados: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${await obtenerTokenServicio()}`,
  };
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
  if (requestId) encabezados['X-Request-Id'] = requestId;
  if (claveIdempotencia) encabezados['Idempotency-Key'] = claveIdempotencia;

  const sePuedeReintentar = metodo === 'GET' || Boolean(claveIdempotencia);
  const intentos = sePuedeReintentar ? 1 + MAX_REINTENTOS : 1;

  for (let intento = 1; intento <= intentos; intento++) {
    let falla: string;

    // La lectura del cuerpo va dentro del try: la conexión también puede cortarse
    // o agotar el tiempo después de que llegan los encabezados.
    try {
      const respuesta = await fetch(url, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(config.timeoutModulosMs),
      });
      if (respuesta.status < 500) {
        return { status: respuesta.status, datos: (await leerCuerpo(respuesta)) as T };
      }
      falla = `${modulo} respondió con error ${respuesta.status}`;
      // Se descarta el cuerpo del error para liberar la conexión antes de reintentar.
      await respuesta.body?.cancel().catch(() => undefined);
    } catch (error) {
      // Tiempo agotado: no se reintenta, para no pasar el tiempo total de respuesta.
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw noDisponible(modulo, `${modulo} no respondió en ${config.timeoutModulosMs} ms`);
      }
      falla = `${modulo} no está disponible`;
    }

    if (intento === intentos) throw noDisponible(modulo, falla);
  }

  /* v8 ignore next */
  throw noDisponible(modulo, `${modulo} no está disponible`);
}
