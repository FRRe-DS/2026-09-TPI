import { describe, it, expect } from 'vitest';
import { consultarRuta } from '../src/stubs/m4Ubicacion.stub';

// Simulación de M4 (la reemplaza la Persona 2). M2 y M7 ya no son stubs:
// sus pruebas están en m2Clientes.test.ts y m7Tarifas.test.ts.
const UTN = { direccion: 'UTN', latitud: -27.45, longitud: -58.98 };
const AEROPUERTO = { direccion: 'Aeropuerto', latitud: -27.44, longitud: -59.05 };

describe('Simulación de M4 - Ubicación', () => {
  it('calcula la distancia real entre las coordenadas', async () => {
    const ruta = await consultarRuta(UTN, AEROPUERTO);
    expect(ruta.cubierta).toBe(true);
    expect(ruta.distanciaKm).toBe(7);
    expect(ruta.duracionMin).toBeGreaterThan(0);
  });

  it('marca fuera de cobertura las direcciones con "FUERA DE ZONA"', async () => {
    const ruta = await consultarRuta({ ...UTN, direccion: 'Ruta 11 FUERA DE ZONA' }, AEROPUERTO);
    expect(ruta.cubierta).toBe(false);
  });
});
