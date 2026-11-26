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
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: TIMEOUT_REDIS_MS,
    retryStrategy: () => null,
  });

  // Evita que ioredis emita eventos 'error' sin listener y tumbe el proceso.
  cliente.on('error', () => {});

  clienteRedis = cliente;
  urlConfigurada = url;
  return clienteRedis;
}

async function conTimeout<T>(operacion: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operacion,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), TIMEOUT_REDIS_MS);
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

  return conTimeout(cliente.get(clave), null);
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

  await conTimeout(cliente.set(clave, valor, 'EX', Math.floor(segundosTTL)), undefined);
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
