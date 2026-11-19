import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReglaAnticipacion, ErrorDeDominio } from '../../src/domain/index.js';
import { CrearReserva, type DatosCrearReserva } from '../../src/application/CrearReserva.js';
import { ConsultarReserva } from '../../src/application/ConsultarReserva.js';
import { ListarPendientes } from '../../src/application/ListarPendientes.js';
import { ReservaRepositoryFalso, NotificadorFalso, PendientesRepositoryFalso } from './falsos.js';

const ahora = new Date('2026-11-12T10:00:00Z');
const enMinutos = (m: number) => new Date(ahora.getTime() + m * 60_000);

function armar() {
  const reservas = new ReservaRepositoryFalso();
  const notificador = new NotificadorFalso();
  const pendientes = new PendientesRepositoryFalso();
  let n = 0;
  const crearReserva = new CrearReserva(
    reservas, notificador, pendientes, new ReglaAnticipacion(60, 30), () => ahora, () => `id-${++n}`,
  );
  return { reservas, notificador, pendientes, crearReserva };
}

const datos = (cambios: Partial<DatosCrearReserva> = {}): DatosCrearReserva => ({
  clienteId: 'cliente_001',
  origen: 'Av. Sarmiento 1000',
  destino: 'UTN FRRe',
  tipoVehiculo: 'AUTO',
  fechaHora: enMinutos(120),
  ...cambios,
});

test('crea la reserva CONFIRMADA, la guarda y notifica', async () => {
  const { reservas, notificador, pendientes, crearReserva } = armar();

  const reserva = await crearReserva.ejecutar(datos());

  assert.equal(reserva.estado, 'CONFIRMADA');
  assert.equal(reservas.datos.size, 1);
  assert.equal(notificador.enviadas.length, 1);
  assert.equal(notificador.enviadas[0].reservaId, reserva.id);
  assert.equal(notificador.enviadas[0].destinatario, 'cliente_001');
  assert.equal(notificador.enviadas[0].tipo, 'RESERVA_CREADA');
  assert.equal(pendientes.datos.size, 0);
});

test('rechaza una fecha pasada sin guardar ni notificar', async () => {
  const { reservas, notificador, pendientes, crearReserva } = armar();

  await assert.rejects(
    crearReserva.ejecutar(datos({ fechaHora: enMinutos(-5) })),
    (e) => e instanceof ErrorDeDominio && e.codigo === 'FECHA_PASADA',
  );
  assert.equal(reservas.datos.size, 0);
  assert.equal(notificador.enviadas.length, 0);
  assert.equal(pendientes.datos.size, 0);
});

test('si el notificador falla, la reserva queda guardada y la notificación queda PENDIENTE', async () => {
  const { reservas, notificador, pendientes, crearReserva } = armar();
  notificador.fallar = true;

  const reserva = await crearReserva.ejecutar(datos());

  assert.equal(reserva.estado, 'CONFIRMADA');
  assert.equal(reservas.datos.size, 1);
  const lista = await new ListarPendientes(pendientes).ejecutar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].estado, 'PENDIENTE');
  assert.equal(lista[0].notificacion.reservaId, reserva.id);
});

test('consultar devuelve la reserva guardada o null si no existe', async () => {
  const { reservas, crearReserva } = armar();
  const creada = await crearReserva.ejecutar(datos());
  const consultar = new ConsultarReserva(reservas);

  const encontrada = await consultar.ejecutar(creada.id);
  assert.equal(encontrada?.id, creada.id);
  assert.equal(encontrada?.estado, 'CONFIRMADA');
  assert.equal(await consultar.ejecutar('no-existe'), null);
});
