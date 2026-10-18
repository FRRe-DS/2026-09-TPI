import { randomUUID } from 'crypto';
import { Reserva } from '../models/reserva';

// M5 registra cada llamada para que las pruebas de activación puedan detectar duplicados.
const solicitudes: { solicitudId: string; reservaId: string }[] = [];

export async function crearSolicitudDespacho(reserva: Reserva): Promise<{ solicitudId: string }> {
  const solicitudId = `sol-${randomUUID()}`;
  solicitudes.push({ solicitudId, reservaId: reserva.id });
  return { solicitudId };
}

export function solicitudesDeReserva(reservaId: string) {
  return solicitudes.filter((s) => s.reservaId === reservaId);
}

export function reiniciarStubM5(): void {
  solicitudes.length = 0;
}
