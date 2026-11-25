// Token de servicio de M9 para llamar a otros módulos (RNF-12).
// Se pide a Keycloak con client_credentials, se guarda en memoria
// y se renueva 30 segundos antes de que venza.
import { config } from '../config/env';
import { AppError } from '../errors/AppError';

const MARGEN_RENOVACION_MS = 30_000;

let tokenGuardado: { token: string; venceEn: number } | null = null;
let pedidoEnCurso: Promise<string> | null = null;

function keycloakNoDisponible(mensaje: string): AppError {
  return new AppError(503, 'SERVICIO_NO_DISPONIBLE', mensaje, { modulo: 'KEYCLOAK' });
}

async function pedirToken(): Promise<string> {
  if (!config.keycloakUrl || !config.keycloakClientSecret) {
    throw keycloakNoDisponible('Falta configurar KEYCLOAK_URL o KEYCLOAK_CLIENT_SECRET');
  }

  const url = `${config.keycloakUrl}/realms/${config.keycloakRealm}/protocol/openid-connect/token`;
  const cuerpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.keycloakClientId,
    client_secret: config.keycloakClientSecret,
  });

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      signal: AbortSignal.timeout(config.timeoutModulosMs),
    });
  } catch {
    throw keycloakNoDisponible('Keycloak no respondió al pedir el token de servicio');
  }

  if (!respuesta.ok) {
    await respuesta.body?.cancel().catch(() => undefined);
    throw keycloakNoDisponible(`Keycloak rechazó el pedido de token (HTTP ${respuesta.status})`);
  }

  let datos: { access_token?: string; expires_in?: number } | null;
  try {
    datos = (await respuesta.json()) as typeof datos;
  } catch {
    throw keycloakNoDisponible('Keycloak devolvió una respuesta que no se pudo leer');
  }
  if (!datos?.access_token || typeof datos.expires_in !== 'number') {
    throw keycloakNoDisponible('Keycloak devolvió una respuesta sin token');
  }

  tokenGuardado = {
    token: datos.access_token,
    venceEn: Date.now() + datos.expires_in * 1000,
  };
  return datos.access_token;
}

export async function obtenerTokenServicio(): Promise<string> {
  if (tokenGuardado && Date.now() < tokenGuardado.venceEn - MARGEN_RENOVACION_MS) {
    return tokenGuardado.token;
  }
  // Si llegan varios pedidos juntos, se hace un solo pedido a Keycloak.
  if (!pedidoEnCurso) {
    pedidoEnCurso = pedirToken().finally(() => {
      pedidoEnCurso = null;
    });
  }
  return pedidoEnCurso;
}

// Solo para las pruebas: borra el token guardado.
export function olvidarTokenServicio(): void {
  tokenGuardado = null;
  pedidoEnCurso = null;
}
