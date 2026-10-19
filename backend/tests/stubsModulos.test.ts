import { describe, it, expect } from 'vitest';
import { verificarClienteHabilitado } from '../src/stubs/m2Clientes.stub';
import { consultarRuta } from '../src/stubs/m4Ubicacion.stub';
import { estimarTarifa } from '../src/stubs/m7Tarifas.stub';

// Simulaciones de los otros módulos: las MISMAS para crear, confirmar y modificar.
const UTN = { direccion: 'UTN', latitud: -27.45, longitud: -58.98 };
const AEROPUERTO = { direccion: 'Aeropuerto', latitud: -27.44, longitud: -59.05 };

describe('Simulación de M2 - Clientes', () => {
  it('habilita a un cliente común', async () => {
    expect(await verificarClienteHabilitado('cli-001')).toBe(true);
  });

  it('bloquea a los clientes cuyo id empieza con "bloqueado"', async () => {
    expect(await verificarClienteHabilitado('bloqueado-001')).toBe(false);
  });
});

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

describe('Simulación de M7 - Tarifas', () => {
  it('calcula la tarifa según el tipo de vehículo y los km', async () => {
    expect(await estimarTarifa('AUTO', 7)).toBe(3100);
    expect(await estimarTarifa('MOTO', 7)).toBe(2400);
  });
});
