import type { Reserva, IReservaRepository } from '../domain/index.js';

/** Caso de uso: buscar una reserva por id. Devuelve null si no existe (la API lo traduce a 404). */
export class ConsultarReserva {
  constructor(private readonly reservas: IReservaRepository) {}

  ejecutar(id: string): Promise<Reserva | null> {
    return this.reservas.buscarPorId(id);
  }
}
