import { Reserva, type IReservaRepository, type ReservaProps } from '../domain/index.js';

export class ReservaRepositoryEnMemoria implements IReservaRepository {
  private readonly datos = new Map<string, ReservaProps>();

  async guardar(reserva: Reserva): Promise<void> {
    this.datos.set(reserva.id, structuredClone(reserva.aProps()));
  }

  async buscarPorId(id: string): Promise<Reserva | null> {
    const props = this.datos.get(id);
    return props ? Reserva.reconstituir(structuredClone(props)) : null;
  }

  async listarPorCliente(clienteId: string): Promise<Reserva[]> {
    return [...this.datos.values()]
      .filter((props) => props.clienteId === clienteId)
      .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime())
      .map((props) => Reserva.reconstituir(structuredClone(props)));
  }
}
