import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/env';
import { guardar, obtener } from '../src/integraciones/cache';
import { consultarRuta, obtenerCoordenadas } from '../src/integraciones/m4Ubicacion';

vi.mock('../src/integraciones/cache', () => ({ obtener: vi.fn(), guardar: vi.fn() }));
vi.mock('../src/integraciones/tokenServicio', () => ({ obtenerTokenServicio: async () => 'token-m4' }));

const origen = { latitud: -27.45, longitud: -58.98 };
const destino = { latitud: -27.44, longitud: -59.05 };
const respuestaRuta = { distancia_estimada_km: 7, eta_minutos: 14 };
const fetchM4 = vi.fn<typeof fetch>();

beforeEach(() => {
  config.m4Url = 'http://m4.prueba/';
  fetchM4.mockReset();
  vi.mocked(obtener).mockReset().mockResolvedValue(null);
  vi.mocked(guardar).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchM4);
});

afterEach(() => vi.unstubAllGlobals());

describe('M4 geocodificación', () => {
  it('envía el cuerpo oficial, el token de servicio y toma la primera coincidencia', async () => {
    fetchM4.mockResolvedValue(Response.json({ coincidencias: [origen, destino] }));

    await expect(obtenerCoordenadas('  UTN  ')).resolves.toEqual(origen);
    expect(fetchM4).toHaveBeenCalledWith('http://m4.prueba/api/v1/geocodificaciones', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-m4' }),
      body: JSON.stringify({ direccion: 'UTN', localidad: 'Resistencia', pais: 'AR' }),
    }));
  });

  it('devuelve 422 si M4 no encontró coincidencias', async () => {
    fetchM4.mockResolvedValue(Response.json({ coincidencias: [] }));
    await expect(obtenerCoordenadas('Desconocida')).rejects.toMatchObject({
      status: 422, codigo: 'REGLA_INCUMPLIDA', detalle: { regla: 'FUERA_DE_COBERTURA' },
    });
  });

  it('devuelve 503 ante una caída de M4 y no reintenta el POST', async () => {
    fetchM4.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(obtenerCoordenadas('UTN')).rejects.toMatchObject({
      status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', detalle: { modulo: 'M4' },
    });
    expect(fetchM4).toHaveBeenCalledTimes(1);
  });

  it.each([{ error: 'formato incorrecto' }, { coincidencias: [{ ...origen, latitud: 91 }] }])(
    'devuelve 503 ante una geocodificación inválida',
    async (cuerpo) => {
      fetchM4.mockResolvedValue(Response.json(cuerpo));
      await expect(obtenerCoordenadas('UTN')).rejects.toMatchObject({ status: 503 });
    },
  );

  it.each([400, 422, 429, 403])('traduce el HTTP %i de M4 al formato de error de M9', async (status) => {
    fetchM4.mockResolvedValue(new Response(null, { status }));
    await expect(obtenerCoordenadas('UTN')).rejects.toMatchObject({
      status: status === 403 ? 503 : status, detalle: { modulo: 'M4' },
    });
  });
});

describe('M4 estimación de ruta', () => {
  it('usa Redis en la segunda consulta y distingue el vehículo', async () => {
    const datos = new Map<string, string>();
    vi.mocked(obtener).mockImplementation(async (clave) => datos.get(clave) ?? null);
    vi.mocked(guardar).mockImplementation(async (clave, valor) => { datos.set(clave, valor); });
    fetchM4.mockImplementation(async () => Response.json(respuestaRuta));

    const estimacion = { distanciaKm: 7, duracionMin: 14 };
    await expect(consultarRuta(origen, destino, 'AUTO')).resolves.toEqual(estimacion);
    await expect(consultarRuta(origen, destino, 'AUTO')).resolves.toEqual(estimacion);
    expect(fetchM4).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith(expect.any(String), JSON.stringify(estimacion), 300);

    await consultarRuta(origen, destino, 'MOTO');
    await consultarRuta(destino, origen, 'AUTO');
    expect(fetchM4).toHaveBeenCalledTimes(3);
    expect(String(fetchM4.mock.calls[1][0])).toMatch(/tipo_vehiculo=MOTO$/);
  });

  it('consulta M4 si Redis está caído o si el dato guardado es inválido', async () => {
    vi.mocked(obtener).mockResolvedValueOnce(null).mockResolvedValueOnce('no es JSON');
    fetchM4.mockImplementation(async () => Response.json(respuestaRuta));

    await expect(consultarRuta(origen, destino, 'AUTO')).resolves.toMatchObject({ duracionMin: 14 });
    await expect(consultarRuta(origen, destino, 'AUTO')).resolves.toMatchObject({ duracionMin: 14 });
    expect(fetchM4).toHaveBeenCalledTimes(2);
  });

  it('rechaza una estimación inválida y no la guarda en Redis', async () => {
    fetchM4.mockResolvedValue(Response.json({ distancia_estimada_km: -1 }));
    await expect(consultarRuta(origen, destino, 'AUTO')).rejects.toMatchObject({ status: 503 });
    expect(guardar).not.toHaveBeenCalled();
  });

  it('devuelve 503 si falta configurar la base de M4', async () => {
    config.m4Url = '';
    await expect(obtenerCoordenadas('UTN')).rejects.toMatchObject({ status: 503 });
    expect(fetchM4).not.toHaveBeenCalled();
  });
});
