// Simulación de Keycloak, M2 y M7 para las pruebas: reemplaza fetch y responde con el formato
// de sus contratos. No es un stub del código de M9: el código real (httpCliente, tokenServicio,
// m2Clientes y m7Tarifas) se ejecuta completo; solo la red está simulada.
//   - M2: un clienteId que empieza con "bloqueado" está BLOQUEADO; uno que empieza con
//     "inexistente" responde 404; los demás están ACTIVO.
//   - M7: total = 1000 + 300 por km (auto) o 200 por km (moto), redondeado.
//   - M7 cargos de cancelación: responde 201.
import { vi } from 'vitest';
import { config } from '../src/config/env';
import { olvidarTokenServicio } from '../src/integraciones/tokenServicio';

export const URL_KEYCLOAK = 'http://keycloak.prueba';
export const URL_M2 = 'http://m2.prueba';
export const URL_M7 = 'http://m7.prueba';

export interface LlamadoSimulado {
  url: string;
  metodo: string;
  encabezados: Record<string, string>;
  cuerpo: unknown;
}

function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });
}

function responder(url: string, metodo: string, cuerpo: unknown): Response {
  if (url.startsWith(`${URL_KEYCLOAK}/`)) return json({ access_token: 'token-de-prueba', expires_in: 300 });

  const estadoCuenta = url.match(/^http:\/\/m2\.prueba\/api\/v1\/clientes\/([^/]+)\/estado-cuenta$/);
  if (estadoCuenta && metodo === 'GET') {
    const clienteId = decodeURIComponent(estadoCuenta[1]);
    if (clienteId.toLowerCase().startsWith('inexistente')) return json({ codigo: 'NO_ENCONTRADO' }, 404);
    const bloqueado = clienteId.toLowerCase().startsWith('bloqueado');
    return json({ clienteId, estado: bloqueado ? 'BLOQUEADO' : 'ACTIVO', bloqueosVigentes: [] });
  }

  if (url === `${URL_M7}/api/v1/tarifas/estimaciones` && metodo === 'POST') {
    const { tipo_vehiculo, distancia_km } = cuerpo as { tipo_vehiculo: string; distancia_km: number };
    const total = Math.round(1000 + (tipo_vehiculo === 'auto' ? 300 : 200) * distancia_km);
    return json({ regla_id: 'regla-prueba', moneda: 'ARS', desglose: { total } });
  }

  if (url === `${URL_M7}/api/v1/cargos-cancelacion` && metodo === 'POST') {
    return json({ cargo_id: 'cargo-prueba', estado: 'REGISTRADO' }, 201);
  }

  return json({ mensaje: `Ruta no simulada: ${metodo} ${url}` }, 404);
}

// Configura las URLs y el secreto de prueba y reemplaza fetch. Devuelve la lista de llamados
// para poder contar cuántas veces se llamó a cada módulo.
export function activarModulosSimulados(): LlamadoSimulado[] {
  const llamados: LlamadoSimulado[] = [];
  config.keycloakUrl = URL_KEYCLOAK;
  config.keycloakClientSecret = 'secreto-de-prueba';
  config.m2Url = URL_M2;
  config.m7Url = URL_M7;
  olvidarTokenServicio();

  vi.stubGlobal('fetch', vi.fn(async (entrada: string | URL, opciones: RequestInit = {}) => {
    const url = String(entrada);
    const metodo = (opciones.method ?? 'GET').toUpperCase();
    const encabezados = (opciones.headers ?? {}) as Record<string, string>;
    const cuerpo = typeof opciones.body === 'string' ? JSON.parse(opciones.body) : undefined;
    llamados.push({ url, metodo, encabezados, cuerpo });
    return responder(url, metodo, cuerpo);
  }));
  return llamados;
}

// Cuántas veces se llamó a un módulo (por el comienzo de su URL).
export function contarLlamados(llamados: LlamadoSimulado[], urlBase: string): number {
  return llamados.filter((llamado) => llamado.url.startsWith(`${urlBase}/`)).length;
}
