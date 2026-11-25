// Lee la configuración del archivo .env (que NUNCA se sube a GitHub).
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });
dotenv.config({ quiet: true });

const esPrueba = process.env.NODE_ENV === 'test';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: esPrueba ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  dbSsl: !esPrueba && process.env.DB_SSL === 'true',
  anticipacionMinimaMinutos: Number(process.env.ANTICIPACION_MINIMA_MINUTOS ?? 60),
  anticipacionMaximaDias: Number(process.env.ANTICIPACION_MAXIMA_DIAS ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // Otros módulos (RNF-06: las URLs se configuran afuera del código).
  // Con || una variable vacía (o un número mal escrito) toma el valor por defecto.
  m2Url: process.env.M2_URL ?? '',
  m4Url: process.env.M4_URL ?? '',
  m5Url: process.env.M5_URL ?? '',
  m7Url: process.env.M7_URL ?? '',
  m8Url: process.env.M8_URL ?? '',
  timeoutModulosMs: Number(process.env.TIMEOUT_MODULOS_MS) || 3000,

  // Keycloak: token de servicio de M9 (client_credentials)
  keycloakUrl: process.env.KEYCLOAK_URL ?? '',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'ds-2026-realm',
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || 'grupo-09',
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',

  // Infraestructura
  rabbitmqUrl: process.env.RABBITMQ_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',

  // Seguridad: la validación de tokens queda prendida salvo que se apague a propósito
  authHabilitada: process.env.AUTH_HABILITADA !== 'false',
  frontUrl: process.env.FRONT_URL ?? '',

  // Tareas automáticas (activación, recordatorios y vencimiento)
  activacionAnticipacionMin: Number(process.env.ACTIVACION_ANTICIPACION_MIN) || 30,
  recordatorioAnticipacionMin: Number(process.env.RECORDATORIO_ANTICIPACION_MIN) || 60,
  intervaloTareasSeg: Number(process.env.INTERVALO_TAREAS_SEG) || 60,
};

if (!config.databaseUrl) {
  const variable = esPrueba ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  throw new Error(`Falta la variable ${variable} en el archivo .env`);
}