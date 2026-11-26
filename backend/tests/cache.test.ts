import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockQuit = vi.fn();
const mockDisconnect = vi.fn();
const mockOn = vi.fn();
const mockRedisConstructor = vi.fn();

vi.mock('ioredis', () => {
  return {
    default: vi.fn(function (this: Record<string, unknown>, url: string, options: Record<string, unknown>) {
      mockRedisConstructor(url, options);
      this.get = mockGet;
      this.set = mockSet;
      this.quit = mockQuit;
      this.disconnect = mockDisconnect;
      this.on = mockOn;
    }),
  };
});

describe('integraciones/cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { cerrarCache } = await import('../src/integraciones/cache');
    await cerrarCache();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('devuelve null y no guarda cuando REDIS_URL no está definida', async () => {
    vi.stubEnv('REDIS_URL', '');
    const { obtener, guardar } = await import('../src/integraciones/cache');

    await expect(obtener('ruta:1')).resolves.toBeNull();
    await expect(guardar('ruta:1', '{"km":5}', 300)).resolves.toBeUndefined();
    expect(mockRedisConstructor).not.toHaveBeenCalled();
  });

  it('obtiene un valor guardado cuando hay hit y null cuando hay miss', async () => {
    mockGet.mockResolvedValueOnce('{"distancia":12}').mockResolvedValueOnce(null);
    const { obtener } = await import('../src/integraciones/cache');

    await expect(obtener('ruta:a')).resolves.toBe('{"distancia":12}');
    await expect(obtener('ruta:b')).resolves.toBeNull();
    expect(mockRedisConstructor).toHaveBeenCalledTimes(1);

    const [, opciones] = mockRedisConstructor.mock.calls[0];
    expect(opciones.retryStrategy()).toBeNull();
    const errorHandler = mockOn.mock.calls.find(([ev]) => ev === 'error')?.[1];
    expect(() => errorHandler?.(new Error('fallo conexión'))).not.toThrow();
  });

  it('guarda el valor con TTL en segundos y omite TTL <= 0', async () => {
    mockSet.mockResolvedValue('OK');
    const { guardar } = await import('../src/integraciones/cache');

    await guardar('ruta:c', 'valor', 300.9);
    expect(mockSet).toHaveBeenCalledWith('ruta:c', 'valor', 'EX', 300);

    await guardar('ruta:d', 'valor', 0);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('reemplaza el cliente si cambia REDIS_URL', async () => {
    mockGet.mockResolvedValue('v1');
    const { obtener } = await import('../src/integraciones/cache');

    await obtener('k1');
    vi.stubEnv('REDIS_URL', 'redis://otro-host:6379');
    await obtener('k2');

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockRedisConstructor).toHaveBeenCalledTimes(2);
  });

  it('degrada en silencio si Redis lanza error en get o set', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockSet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { obtener, guardar } = await import('../src/integraciones/cache');

    await expect(obtener('ruta:err')).resolves.toBeNull();
    await expect(guardar('ruta:err', 'x', 60)).resolves.toBeUndefined();
  });

  it('corta por timeout a los 500 ms sin lanzar error', async () => {
    vi.useFakeTimers();
    mockGet.mockImplementation(() => new Promise(() => {}));
    mockSet.mockImplementation(() => new Promise(() => {}));
    const { obtener, guardar } = await import('../src/integraciones/cache');

    const promesaGet = obtener('ruta:lenta');
    await vi.advanceTimersByTimeAsync(500);
    await expect(promesaGet).resolves.toBeNull();

    const promesaSet = guardar('ruta:lenta', 'x', 60);
    await vi.advanceTimersByTimeAsync(500);
    await expect(promesaSet).resolves.toBeUndefined();
  });

  it('cierra la conexión con disconnect si quit falla', async () => {
    mockGet.mockResolvedValueOnce('ok');
    mockQuit.mockRejectedValueOnce(new Error('ya cerrado'));
    const { obtener, cerrarCache } = await import('../src/integraciones/cache');

    await obtener('k');
    await expect(cerrarCache()).resolves.toBeUndefined();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
