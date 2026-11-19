import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerConfig } from '../../src/main/config.js';

test('sin variables usa la versión A (memoria) y los valores por defecto', () => {
  const c = leerConfig({});
  assert.equal(c.modoNotificaciones, 'memoria');
  assert.equal(c.notificacionesUrl, null);
  assert.equal(c.puerto, 3000);
  assert.equal(c.anticipacionMinimaMinutos, 60);
  assert.equal(c.anticipacionMaximaDias, 30);
  assert.equal(c.notificacionesTimeoutMs, 2000);
});

test('versión B: modo http con URL', () => {
  const c = leerConfig({ MODO_NOTIFICACIONES: 'http', NOTIFICACIONES_URL: 'http://notificaciones:3001' });
  assert.equal(c.modoNotificaciones, 'http');
  assert.equal(c.notificacionesUrl, 'http://notificaciones:3001');
});

test('modo http sin URL es un error de configuración', () => {
  assert.throws(() => leerConfig({ MODO_NOTIFICACIONES: 'http' }), /NOTIFICACIONES_URL/);
});

test('modo desconocido o número inválido son errores', () => {
  assert.throws(() => leerConfig({ MODO_NOTIFICACIONES: 'kafka' }), /MODO_NOTIFICACIONES/);
  assert.throws(() => leerConfig({ PUERTO: 'abc' }), /PUERTO/);
});
