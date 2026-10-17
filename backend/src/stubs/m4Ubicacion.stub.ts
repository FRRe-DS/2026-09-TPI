import { Direccion } from '../models/reserva';

export async function consultarRuta(origen: Direccion, destino: Direccion) {
  const fuera = [origen, destino].some((d) => d.direccion.toUpperCase().includes('FUERA DE ZONA'));
  return { cubierta: !fuera, distanciaKm: 12.5, duracionMin: 25 };
}
