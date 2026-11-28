import { createHash } from 'node:crypto';
import { config } from '../config/env';
import { AppError, errores } from '../errors/AppError';
import { Direccion, TipoVehiculo } from '../models/reserva';
import { guardar, obtener } from './cache';
import { llamarModulo } from './httpCliente';

type Coordenadas = Pick<Direccion, 'latitud' | 'longitud'>;

interface EstimacionRuta {
  distanciaKm: number;
  duracionMin: number;
}

const TTL_RUTA_SEGUNDOS = 300;

function noDisponible(mensaje: string): AppError {
  return new AppError(503, 'SERVICIO_NO_DISPONIBLE', mensaje, { modulo: 'M4' });
}

function urlM4(ruta: string): string {
  if (!config.m4Url) throw noDisponible('Falta configurar M4_URL');
  return `${config.m4Url.replace(/\/+$/, '')}/api/v1/${ruta}`;
}

function validarRespuesta(status: number): void {
  if (status === 200) return;
  if ([400, 422, 429].includes(status)) {
    throw new AppError(status, 'SOLICITUD_RECHAZADA_POR_M4', 'M4 rechazó la consulta de ubicación', { modulo: 'M4' });
  }
  throw noDisponible(`M4 respondió de forma inesperada (HTTP ${status})`);
}

export async function obtenerCoordenadas(direccion: string, localidad = 'Resistencia'): Promise<Coordenadas> {
  const { status, datos } = await llamarModulo<{ coincidencias?: Coordenadas[] }>({
    modulo: 'M4',
    metodo: 'POST',
    url: urlM4('geocodificaciones'),
    cuerpo: { direccion: direccion.trim(), localidad, pais: 'AR' },
  });
  validarRespuesta(status);
  if (!Array.isArray(datos?.coincidencias)) throw noDisponible('M4 devolvió una geocodificación inválida');
  if (datos.coincidencias.length === 0) {
    throw errores.reglaIncumplida('La dirección está fuera de la zona de cobertura', { regla: 'FUERA_DE_COBERTURA' });
  }
  const primera = datos.coincidencias[0];
  if (!primera || !Number.isFinite(primera.latitud) || Math.abs(primera.latitud) > 90 ||
    !Number.isFinite(primera.longitud) || Math.abs(primera.longitud) > 180) {
    throw noDisponible('M4 devolvió coordenadas inválidas');
  }
  return { latitud: primera.latitud, longitud: primera.longitud };
}

function esEstimacion(datos: Partial<EstimacionRuta> | null): datos is EstimacionRuta {
  return typeof datos?.distanciaKm === 'number' && Number.isFinite(datos.distanciaKm) && datos.distanciaKm >= 0 &&
    typeof datos.duracionMin === 'number' && Number.isInteger(datos.duracionMin) && datos.duracionMin >= 0;
}

export async function consultarRuta(
  origen: Coordenadas,
  destino: Coordenadas,
  tipoVehiculo: TipoVehiculo,
): Promise<EstimacionRuta> {
  const parametros = new URLSearchParams({
    origen_latitud: String(origen.latitud),
    origen_longitud: String(origen.longitud),
    destino_latitud: String(destino.latitud),
    destino_longitud: String(destino.longitud),
    tipo_vehiculo: tipoVehiculo,
  });
  const clave = `m9:m4:ruta:${createHash('sha256').update(parametros.toString()).digest('hex')}`;
  const guardada = await obtener(clave);
  if (guardada !== null) {
    try {
      const estimacion = JSON.parse(guardada) as EstimacionRuta | null;
      if (esEstimacion(estimacion)) return estimacion;
    } catch {
      // Una entrada ilegible se trata como un fallo de caché.
    }
  }

  const { status, datos } = await llamarModulo<{ distancia_estimada_km?: number; eta_minutos?: number }>({
    modulo: 'M4',
    metodo: 'GET',
    url: `${urlM4('rutas/estimacion')}?${parametros}`,
  });
  validarRespuesta(status);
  const estimacion = { distanciaKm: datos?.distancia_estimada_km, duracionMin: datos?.eta_minutos };
  if (!esEstimacion(estimacion)) throw noDisponible('M4 devolvió una estimación de ruta inválida');
  await guardar(clave, JSON.stringify(estimacion), TTL_RUTA_SEGUNDOS);
  return estimacion;
}
