// Simulación de M4 (Ubicación y Disponibilidad): cobertura, distancia y tiempo del recorrido.
// La usan crear, confirmar y modificar: así todos calculan la tarifa con la misma distancia.
import { Direccion } from '../models/reserva';
import { calcularDistancia } from '../services/calculoDistancia.service';

// Para probar el rechazo por cobertura: cualquier dirección que contenga "FUERA DE ZONA".
const PALABRA_FUERA_DE_ZONA = 'FUERA DE ZONA';
const VELOCIDAD_PROMEDIO_KMH = 30;

export async function consultarRuta(origen: Direccion, destino: Direccion) {
  const fuera = [origen, destino].some((d) => d.direccion.toUpperCase().includes(PALABRA_FUERA_DE_ZONA));
  const { distanciaKm } = await calcularDistancia(
    { latitud: origen.latitud, longitud: origen.longitud },
    { latitud: destino.latitud, longitud: destino.longitud },
  );
  const duracionMin = Math.max(1, Math.round((distanciaKm / VELOCIDAD_PROMEDIO_KMH) * 60));
  return { cubierta: !fuera, distanciaKm, duracionMin };
}
