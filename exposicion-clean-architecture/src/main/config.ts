/**
 * Lee la configuración desde variables de entorno.
 * Es el único lugar del proyecto que mira `process.env`: el resto recibe los valores ya leídos.
 */
export type ModoNotificaciones = 'memoria' | 'http';

export interface Config {
  puerto: number;
  anticipacionMinimaMinutos: number;
  anticipacionMaximaDias: number;
  modoNotificaciones: ModoNotificaciones;
  notificacionesUrl: string | null;
  notificacionesTimeoutMs: number;
}

type Entorno = Record<string, string | undefined>;

function numero(entorno: Entorno, nombre: string, porDefecto: number): number {
  const valor = entorno[nombre];
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`La variable ${nombre} debe ser un número positivo (vino "${valor}")`);
  }
  return n;
}

export function leerConfig(entorno: Entorno): Config {
  const modo = (entorno.MODO_NOTIFICACIONES ?? 'memoria').toLowerCase();
  if (modo !== 'memoria' && modo !== 'http') {
    throw new Error(`MODO_NOTIFICACIONES debe ser "memoria" o "http" (vino "${modo}")`);
  }

  const url = entorno.NOTIFICACIONES_URL?.trim() || null;
  if (modo === 'http' && !url) {
    throw new Error('Con MODO_NOTIFICACIONES=http hay que indicar NOTIFICACIONES_URL');
  }

  return {
    puerto: numero(entorno, 'PUERTO', 3000),
    anticipacionMinimaMinutos: numero(entorno, 'ANTICIPACION_MINIMA_MINUTOS', 60),
    anticipacionMaximaDias: numero(entorno, 'ANTICIPACION_MAXIMA_DIAS', 30),
    modoNotificaciones: modo,
    notificacionesUrl: url,
    notificacionesTimeoutMs: numero(entorno, 'NOTIFICACIONES_TIMEOUT_MS', 2000),
  };
}
