import type { Reserva } from '../Reserva.js';

/**
 * Puerto de salida para persistir reservas.
 * Implementaciones: ReservaRepositoryEnMemoria y el falso de las pruebas (test/application/falsos.ts).
 */
export interface IReservaRepository {
  /** Inserta la reserva si no existe o la reemplaza si ya existe (mismo id). */
  guardar(reserva: Reserva): Promise<void>;

  /** Devuelve la reserva o `null` si no existe. */
  buscarPorId(id: string): Promise<Reserva | null>;

  /** Todas las reservas de un cliente, de la más próxima a la más lejana. */
  listarPorCliente(clienteId: string): Promise<Reserva[]>;
}
