// Caché en Redis para reducir llamadas repetidas a otros módulos (RNF-11).
// Si Redis no está configurado o no responde en 500 ms, degrada en silencio sin lanzar error.
import Redis from 'ioredis';

const TIMEOUT_REDIS_MS = 500;

let clienteRedis: Redis | null = null;
let urlConfigurada: string | undefined;

function obtenerCliente(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === '') {
    return null;
  }

  if (clienteRedis && urlConfigurada === url) {
    return clienteRedis;
  }

  if (clienteRedis) {
    clienteRedis.disconnect();
  }

  const cliente = new Redis(url, {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: TIMEOUT_REDIS_MS,
    retryStrategy: (intentos: number) => Math.min(intentos * 200, 2000),
  });

  // Evita que ioredis emita eventos 'error' sin listener y tumbe el proceso.
  cliente.on('error', () => {});

  clienteRedis = cliente;
  urlConfigurada = url;
  return clienteRedis;
}

function esperarConexionInicial(cliente: Redis, timeoutMs: number): Promise<boolean> {
  if (cliente.status === 'ready') {
    return Promise.resolve(true);
  }
  if (cliente.status !== 'connecting' && cliente.status !== 'connect') {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const limpiar = (listo: boolean) => {
      clearTimeout(timer);
      cliente.off('ready', alEstarListo);
      cliente.off('error', alFallar);
      cliente.off('close', alFallar);
      cliente.off('end', alFallar);
      resolve(listo);
    };

    const alEstarListo = () => limpiar(true);
    const alFallar = () => limpiar(false);
    const timer = setTimeout(() => limpiar(false), timeoutMs);

    cliente.once('ready', alEstarListo);
    cliente.once('error', alFallar);
    cliente.once('close', alFallar);
    cliente.once('end', alFallar);
  });
}

async function ejecutarConCliente<T>(
  cliente: Redis,
  accion: (c: Redis) => Promise<T>,
  fallback: T
): Promise<T> {
  const inicio = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const listo = await esperarConexionInicial(cliente, TIMEOUT_REDIS_MS);
    if (!listo) {
      return fallback;
    }

    const restanteMs = Math.max(1, TIMEOUT_REDIS_MS - (Date.now() - inicio));
    return await Promise.race([
      accion(cliente),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), restanteMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function obtener(clave: string): Promise<string | null> {
  const cliente = obtenerCliente();
  if (!cliente) {
    return null;
  }

  return ejecutarConCliente(cliente, (c) => c.get(clave), null);
}

export async function guardar(
  clave: string,
  valor: string,
  segundosTTL: number
): Promise<void> {
  const cliente = obtenerCliente();
  if (!cliente || segundosTTL <= 0) {
    return;
  }

  await ejecutarConCliente(
    cliente,
    (c) => c.set(clave, valor, 'EX', Math.floor(segundosTTL)),
    undefined
  );
}

export async function cerrarCache(): Promise<void> {
  const cliente = clienteRedis;
  clienteRedis = null;
  urlConfigurada = undefined;
  if (!cliente) {
    return;
  }

  try {
    await cliente.quit();
  } catch {
    cliente.disconnect();
  }
}
