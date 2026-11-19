import {
  ErrorDeNotificacion,
  type INotificador,
  type Notificacion,
} from '../domain/index.js';

/** Lo mínimo que usamos de fetch, para poder inyectar uno falso en las pruebas. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export class NotificadorHttp implements INotificador {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 2000,
    private readonly fetchFn: FetchLike = fetch as FetchLike,
  ) {}

  async notificar(notificacion: Notificacion): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const respuesta = await this.fetchFn(`${this.baseUrl}/notificaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificacion),
        signal: controller.signal,
      });

      if (!respuesta.ok) {
        throw new ErrorDeNotificacion(
          `El servicio de Notificaciones respondió con error HTTP ${respuesta.status}`,
        );
      }
    } catch (error) {
      if (error instanceof ErrorDeNotificacion) throw error;

      if (controller.signal.aborted) {
        throw new ErrorDeNotificacion(
          `Timeout: Notificaciones no respondió en ${this.timeoutMs} ms`,
          { cause: error },
        );
      }

      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorDeNotificacion(`No se pudo contactar a Notificaciones: ${detalle}`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
