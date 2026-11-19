import {
  Reserva,
  NotificacionPendiente,
  ErrorDeNotificacion,
  type ReglaAnticipacion,
  type TipoVehiculo,
  type Notificacion,
  type IReservaRepository,
  type INotificador,
  type INotificacionPendienteRepository,
} from '../domain/index.js';

/** Lo que llega desde la API, ya convertido (fechaHora es Date). El id lo genera el caso de uso. */
export interface DatosCrearReserva {
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
}

/**
 * Caso de uso: crear una reserva y avisar al cliente.
 *
 *   1. Crea la reserva (el dominio valida datos y anticipación) y la deja CONFIRMADA.
 *   2. La guarda.
 *   3. Notifica. Si el notificador falla (versión B con Notificaciones caído),
 *      la reserva ya quedó guardada y la notificación se registra como PENDIENTE.
 *
 * No sabe si el notificador es el módulo en memoria (versión A) o el cliente HTTP (versión B):
 * solo conoce el puerto INotificador.
 */
export class CrearReserva {
  constructor(
    private readonly reservas: IReservaRepository,
    private readonly notificador: INotificador,
    private readonly pendientes: INotificacionPendienteRepository,
    private readonly regla: ReglaAnticipacion,
    private readonly reloj: () => Date,
    // crypto global de Node 20: no se importa 'node:crypto' para que application solo dependa de domain.
    private readonly generarId: () => string = () => crypto.randomUUID(),
  ) {}

  async ejecutar(datos: DatosCrearReserva): Promise<Reserva> {
    const ahora = this.reloj();

    const reserva = Reserva.crear({ id: this.generarId(), ...datos }, this.regla, ahora);
    reserva.confirmar(ahora);
    await this.reservas.guardar(reserva);

    const notificacion: Notificacion = {
      reservaId: reserva.id,
      destinatario: reserva.clienteId,
      tipo: 'RESERVA_CREADA',
      mensaje: `Tu reserva ${reserva.id} de ${datos.origen} a ${datos.destino} quedó confirmada`,
    };

    try {
      await this.notificador.notificar(notificacion);
    } catch (error) {
      if (!(error instanceof ErrorDeNotificacion)) throw error;
      const pendiente = NotificacionPendiente.registrar(this.generarId(), notificacion, error.message, ahora);
      await this.pendientes.guardar(pendiente);
    }

    return reserva;
  }
}
