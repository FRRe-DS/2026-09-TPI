import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificadorHttp, type FetchLike } from '../../src/infrastructure/NotificadorHttp.js';
import { ErrorDeNotificacion, type Notificacion } from '../../src/domain/index.js';

const notificacion: Notificacion = {
  reservaId: 'r-1',
  destinatario: 'cliente-1',
  tipo: 'RESERVA_CREADA',
  mensaje: 'Tu reserva fue creada',
};

describe('NotificadorHttp', () => {
  it('envía la notificación como JSON por POST cuando el servicio responde bien', async () => {
    let urlUsada = '';
    let initUsado: Parameters<FetchLike>[1] | undefined;
    const fetchFalso: FetchLike = async (url, init) => {
      urlUsada = url;
      initUsado = init;
      return { ok: true, status: 201 };
    };

    const notificador = new NotificadorHttp('http://notificaciones:3001', 2000, fetchFalso);
    await notificador.notificar(notificacion);

    assert.equal(urlUsada, 'http://notificaciones:3001/notificaciones');
    assert.equal(initUsado?.method, 'POST');
    assert.deepEqual(JSON.parse(initUsado!.body), notificacion);
  });

  it('rechaza con ErrorDeNotificacion si el servicio responde con error', async () => {
    const fetchFalso: FetchLike = async () => ({ ok: false, status: 500 });
    const notificador = new NotificadorHttp('http://x', 2000, fetchFalso);

    await assert.rejects(notificador.notificar(notificacion), ErrorDeNotificacion);
  });

  it('rechaza con ErrorDeNotificacion si el servicio está caído', async () => {
    const fetchFalso: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const notificador = new NotificadorHttp('http://x', 2000, fetchFalso);

    await assert.rejects(notificador.notificar(notificacion), ErrorDeNotificacion);
  });

  it('rechaza con ErrorDeNotificacion si se pasa el timeout', async () => {
    // fetch falso que nunca responde y rechaza recién cuando se aborta la señal
    const fetchFalso: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('abortado')));
      });
    const notificador = new NotificadorHttp('http://x', 20, fetchFalso);
    await assert.rejects(
      notificador.notificar(notificacion),
      (error: unknown) =>
        error instanceof ErrorDeNotificacion && /Timeout/.test(error.message),
    );
  });
});
