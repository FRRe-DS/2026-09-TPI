import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reserva, ReglaAnticipacion, ErrorDeDominio, type DatosNuevaReserva } from '../../src/domain/index.js';

const ahora = new Date('2026-11-12T10:00:00Z');
const regla = new ReglaAnticipacion(60, 30);
const enMinutos = (m: number) => new Date(ahora.getTime() + m * 60_000);

const datos = (cambios: Partial<DatosNuevaReserva> = {}): DatosNuevaReserva => ({
  id: 'r-1',
  clienteId: 'cliente_001',
  origen: 'Av. Sarmiento 1000',
  destino: 'UTN FRRe',
  tipoVehiculo: 'AUTO',
  fechaHora: enMinutos(120),
  ...cambios,
});

const conCodigo = (codigo: string) => (e: unknown) =>
  e instanceof ErrorDeDominio && e.codigo === codigo;

test('una reserva nueva queda PENDIENTE', () => {
  const r = Reserva.crear(datos(), regla, ahora);
  assert.equal(r.estado, 'PENDIENTE');
  assert.equal(r.aProps().motivoCancelacion, null);
});

test('rechaza una fecha pasada', () => {
  assert.throws(() => Reserva.crear(datos({ fechaHora: enMinutos(-5) }), regla, ahora), conCodigo('FECHA_PASADA'));
});

test('rechaza menos de la anticipación mínima', () => {
  assert.throws(() => Reserva.crear(datos({ fechaHora: enMinutos(59) }), regla, ahora), conCodigo('ANTICIPACION_INSUFICIENTE'));
});

test('acepta justo la anticipación mínima y justo la máxima', () => {
  assert.doesNotThrow(() => Reserva.crear(datos({ fechaHora: enMinutos(60) }), regla, ahora));
  assert.doesNotThrow(() => Reserva.crear(datos({ fechaHora: enMinutos(30 * 24 * 60) }), regla, ahora));
});

test('rechaza más de la anticipación máxima', () => {
  assert.throws(() => Reserva.crear(datos({ fechaHora: enMinutos(30 * 24 * 60 + 1) }), regla, ahora), conCodigo('ANTICIPACION_EXCEDIDA'));
});

test('rechaza datos obligatorios vacíos o tipo de vehículo inválido', () => {
  assert.throws(() => Reserva.crear(datos({ origen: '  ' }), regla, ahora), conCodigo('DATOS_INVALIDOS'));
  assert.throws(() => Reserva.crear(datos({ tipoVehiculo: 'CAMION' as never }), regla, ahora), conCodigo('DATOS_INVALIDOS'));
});

test('PENDIENTE -> CONFIRMADA -> CANCELADA', () => {
  const r = Reserva.crear(datos(), regla, ahora);
  r.confirmar(ahora);
  assert.equal(r.estado, 'CONFIRMADA');
  r.cancelar('cambio de planes', ahora);
  assert.equal(r.estado, 'CANCELADA');
  assert.equal(r.aProps().motivoCancelacion, 'cambio de planes');
});

test('no se puede confirmar una reserva cancelada ni cancelar dos veces', () => {
  const r = Reserva.crear(datos(), regla, ahora);
  r.cancelar('motivo', ahora);
  assert.throws(() => r.confirmar(ahora), conCodigo('TRANSICION_INVALIDA'));
  assert.throws(() => r.cancelar('otra vez', ahora), conCodigo('TRANSICION_INVALIDA'));
});

test('cancelar exige motivo', () => {
  const r = Reserva.crear(datos(), regla, ahora);
  assert.throws(() => r.cancelar('', ahora), conCodigo('MOTIVO_REQUERIDO'));
  assert.equal(r.estado, 'PENDIENTE');
});

test('reconstituir no revalida la anticipación (para leer reservas ya guardadas)', () => {
  const props = Reserva.crear(datos(), regla, ahora).aProps();
  const masTarde = new Date(ahora.getTime() + 365 * 24 * 60 * 60_000);
  const r = Reserva.reconstituir(props);
  assert.equal(r.id, 'r-1');
  assert.doesNotThrow(() => r.cancelar('viejo', masTarde));
});
