// Ingreso con Keycloak (client público m9-front, flujo con PKCE).
// Los datos de conexión salen de las variables VITE_KEYCLOAK_*.
import Keycloak from 'keycloak-js';

// Segundos de margen: si al token le queda menos que esto, se renueva antes de usarlo
const MARGEN_RENOVACION_SEG = 30;

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

let inicio: Promise<boolean> | null = null;

// Pide usuario y contraseña si no hay sesión. Se llama una sola vez al abrir la app.
export function iniciarSesion(): Promise<boolean> {
  if (!inicio) {
    inicio = keycloak.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
  }
  return inicio;
}

// Devuelve un token vigente; si está por vencer lo renueva, y si no se puede, vuelve a pedir el ingreso.
export async function obtenerToken(): Promise<string> {
  try {
    await keycloak.updateToken(MARGEN_RENOVACION_SEG);
  } catch {
    await pedirIngreso();
  }
  return keycloak.token ?? '';
}

// El clienteId es el "sub" del token
export function obtenerClienteId(): string {
  return keycloak.subject ?? '';
}

export function obtenerNombreUsuario(): string {
  const datos = keycloak.tokenParsed as { preferred_username?: string; name?: string } | undefined;
  return datos?.name ?? datos?.preferred_username ?? '';
}

// El realm de la cátedra manda los roles del usuario en el claim "roles" del token
// (no en realm_access), así que se lee de ahí
export function esOperador(): boolean {
  const datos = keycloak.tokenParsed as { roles?: unknown } | undefined;
  return Array.isArray(datos?.roles) && datos.roles.includes('OPERADOR');
}

// Vuelve a mostrar la pantalla de ingreso de Keycloak (se usa cuando la API responde 401)
export function pedirIngreso(): Promise<void> {
  return keycloak.login();
}

export function cerrarSesion(): Promise<void> {
  return keycloak.logout({ redirectUri: window.location.origin });
}
