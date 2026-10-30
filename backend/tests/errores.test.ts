// Pruebas unitarias del manejador de errores: no usan la base, llaman a la función directo.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { manejadorDeErrores } from '../src/middlewares/errores';
import { errores } from '../src/errors/AppError';

function manejar(err: unknown) {
  const res = { status: vi.fn(), json: vi.fn() } as any;
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  manejadorDeErrores(err, {} as Request, res as Response, vi.fn());
  return res;
}

describe('manejadorDeErrores', () => {
  it('respeta el estado y el código de un AppError', () => {
    const res = manejar(errores.noEncontrada('abc'));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NO_ENCONTRADA' }));
  });

  it('un JSON mal formado responde 400 JSON_INVALIDO', () => {
    const res = manejar({ type: 'entity.parse.failed' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'JSON_INVALIDO' }));
  });

  it('un id con formato inválido (22P02) responde 400 ID_INVALIDO', () => {
    const res = manejar({ code: '22P02' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'ID_INVALIDO' }));
  });

  it('una restricción única (23505) responde 409 CONFLICTO', () => {
    const res = manejar({ code: '23505' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'CONFLICTO' }));
  });

  it('un trigger que rechaza el cambio (P0001) responde 409 con su mensaje', () => {
    const res = manejar({ code: 'P0001', message: 'Transicion de estado invalida' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'CONFLICTO', mensaje: 'Transicion de estado invalida' }),
    );
  });

  it('un CHECK de la base (23514) responde 400 DATOS_INVALIDOS', () => {
    const res = manejar({ code: '23514' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }));
  });

  it('un error desconocido responde 500 ERROR_INTERNO', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = manejar(new Error('algo raro'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'ERROR_INTERNO' }));
    silenciar.mockRestore();
  });
});

describe('líneas sueltas', () => {
  it('errores.servicioNoDisponible arma un 503', () => {
    const e = errores.servicioNoDisponible('M5 caído');
    expect(e.status).toBe(503);
    expect(e.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it('/health responde 503 si la base no contesta', async () => {
    const espia = vi.spyOn(pool as any, 'query').mockRejectedValueOnce(new Error('sin conexión'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    espia.mockRestore();
  });
});