import { afterEach, beforeEach, vi } from 'vitest';
import { config } from '../src/config/env';
import { olvidarTokenServicio } from '../src/integraciones/tokenServicio';

const ubicaciones: Record<string, { latitud: number; longitud: number }> = {
  UTN: { latitud: -27.45, longitud: -58.98 },
  Aeropuerto: { latitud: -27.44, longitud: -59.05 },
};

const baseM4 = 'http://m4.prueba';
const baseKeycloak = 'http://keycloak-m4.prueba';

beforeEach(() => {
  const fetchAnterior = globalThis.fetch;
  vi.stubEnv('REDIS_URL', '');
  config.m4Url = baseM4;
  config.keycloakUrl = baseKeycloak;
  config.keycloakRealm ||= 'realm-pruebas';
  config.keycloakClientSecret = 'secreto-de-prueba';
  config.timeoutModulosMs ||= 3000;
  olvidarTokenServicio();

  vi.stubGlobal('fetch', vi.fn(async (entrada: string | URL, opciones?: RequestInit) => {
    const url = new URL(String(entrada));
    if (url.origin === baseKeycloak) {
      return Response.json({ access_token: 'token-m4-prueba', expires_in: 300 });
    }
    if (url.origin === baseM4 && url.pathname === '/api/v1/geocodificaciones') {
      const { direccion } = JSON.parse(String(opciones?.body)) as { direccion: string };
      const coordenadas = ubicaciones[direccion];
      return Response.json({
        coincidencias: coordenadas ? [{ ...coordenadas, etiqueta: direccion }] : [],
      });
    }
    if (url.origin === baseM4 && url.pathname === '/api/v1/rutas/estimacion') {
      return Response.json({ distancia_estimada_km: 7, eta_minutos: 14 });
    }
    return fetchAnterior(entrada, opciones);
  }));
});

afterEach(() => {
  olvidarTokenServicio();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
