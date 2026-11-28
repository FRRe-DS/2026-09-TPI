import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockQuit = vi.fn();
const mockDisconnect = vi.fn();
const mockRedisConstructor = vi.fn();

let estadoInicial = 'ready';
let ultimoClienteMock: (EventEmitter & Record<string, unknown>) | null = null;

vi.mock('ioredis', () => {
  return {
    default: vi.fn(function (
      this: EventEmitter & Record<string, unknown>,
      url: string,
      options: Record<string, unknown>
    ) {
      const emisor = new EventEmitter();
      this.on = emisor.on.bind(emisor);
      this.once = emisor.once.bind(emisor);
      this.off = emisor.off.bind(emisor);
      this.emit = emisor.emit.bind(emisor);
      this.status = estadoInicial;
      this.get = mockGet;
      this.set = mockSet;
      this.quit = mockQuit;
      this.disconnect = mockDisconnect;
      ultimoClienteMock = this;
      mockRedisConstructor(url, options);
    }),
  };
});

describe('integraciones/cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estadoInicial = 'ready';
    ultimoClienteMock = null;
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
    expect(opciones.lazyConnect).toBeUndefined();
    expect(opciones.retryStrategy(1)).toBe(200);
    expect(opciones.retryStrategy(20)).toBe(2000);
    expect(() => ultimoClienteMock?.emit('error', new Error('fallo conexión'))).not.toThrow();
  });

  it('guarda el valor con TTL en segundos y omite TTL <= 0', async () => {
    mockSet.mockResolvedValue('OK');
    const { guardar } = await import('../src/integraciones/cache');

    await guardar('ruta:c', 'valor', 300.9);
    expect(mockSet).toHaveBeenCalledWith('ruta:c', 'valor', 'EX', 300);

    await guardar('ruta:d', 'valor', 0);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('espera a que la conexión inicial pase a ready y luego ejecuta la operación', async () => {
    estadoInicial = 'connecting';
    mockGet.mockResolvedValueOnce('ok-despues-ready');
    const { obtener } = await import('../src/integraciones/cache');

    const promesa = obtener('ruta:inicial');
    expect(mockGet).not.toHaveBeenCalled();

    if (ultimoClienteMock) {
      ultimoClienteMock.status = 'ready';
      ultimoClienteMock.emit('ready');
    }

    await expect(promesa).resolves.toBe('ok-despues-ready');
    expect(mockGet).toHaveBeenCalledWith('ruta:inicial');
  });

  it('devuelve vacío si falla la conexión inicial o si el cliente está reconectando', async () => {
    estadoInicial = 'connecting';
    const { obtener, guardar } = await import('../src/integraciones/cache');

    const promesaError = obtener('ruta:error-inicial');
    ultimoClienteMock?.emit('error', new Error('ECONNREFUSED'));
    await expect(promesaError).resolves.toBeNull();

    if (ultimoClienteMock) {
      ultimoClienteMock.status = 'reconnecting';
    }
    await expect(obtener('ruta:reconectando')).resolves.toBeNull();
    await expect(guardar('ruta:reconectando', 'x', 60)).resolves.toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('corta por timeout si la conexión inicial tarda más de 500 ms', async () => {
    vi.useFakeTimers();
    estadoInicial = 'connecting';
    const { obtener } = await import('../src/integraciones/cache');

    const promesa = obtener('ruta:lenta-conexion');
    await vi.advanceTimersByTimeAsync(500);
    await expect(promesa).resolves.toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
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

  it('corta por timeout a los 500 ms si get o set se quedan colgados', async () => {
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
