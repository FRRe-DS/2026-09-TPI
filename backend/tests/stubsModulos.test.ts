import { describe, it, expect } from 'vitest';
import { verificarClienteHabilitado } from '../src/stubs/m2Clientes.stub';
import { estimarTarifa } from '../src/stubs/m7Tarifas.stub';

describe('Simulación de M2 - Clientes', () => {
  it('habilita a un cliente común', async () => {
    expect(await verificarClienteHabilitado('cli-001')).toBe(true);
  });

  it('bloquea a los clientes cuyo id empieza con "bloqueado"', async () => {
    expect(await verificarClienteHabilitado('bloqueado-001')).toBe(false);
  });
});

describe('Simulación de M7 - Tarifas', () => {
  it('calcula la tarifa según el tipo de vehículo y los km', async () => {
    expect(await estimarTarifa('AUTO', 7)).toBe(3100);
    expect(await estimarTarifa('MOTO', 7)).toBe(2400);
  });
});
