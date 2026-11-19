import express, { type ErrorRequestHandler } from 'express';
import type { CrearReserva, DatosCrearReserva } from '../application/CrearReserva.js';
import type { ConsultarReserva } from '../application/ConsultarReserva.js';
import type { ListarPendientes } from '../application/ListarPendientes.js';
import { ErrorDeDominio } from '../domain/index.js';

interface CasosDeUso {
  crearReserva: Pick<CrearReserva, 'ejecutar'>;
  consultarReserva: Pick<ConsultarReserva, 'ejecutar'>;
  listarPendientes: Pick<ListarPendientes, 'ejecutar'>;
}

function leerDatosReserva(body: unknown): DatosCrearReserva {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'Se espera un objeto JSON con los datos de la reserva');
  }

  const { clienteId, origen, destino, tipoVehiculo, fechaHora } = body as Record<string, unknown>;
  if (
    typeof clienteId !== 'string' ||
    typeof origen !== 'string' ||
    typeof destino !== 'string' ||
    (tipoVehiculo !== 'AUTO' && tipoVehiculo !== 'MOTO') ||
    typeof fechaHora !== 'string'
  ) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'Indicá clienteId, origen, destino, tipoVehiculo (AUTO o MOTO) y fechaHora como texto',
    );
  }

  return { clienteId, origen, destino, tipoVehiculo, fechaHora: new Date(fechaHora) };
}

const responderError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (!(error instanceof ErrorDeDominio) || res.headersSent) {
    next(error);
    return;
  }

  const estado = error.codigo === 'TRANSICION_INVALIDA' ? 409 : 422;
  res.status(estado).json({ codigo: error.codigo, error: error.message });
};

export function crearApp({ crearReserva, consultarReserva, listarPendientes }: CasosDeUso) {
  const app = express();
  app.use(express.json());

  app.post('/reservas', async (req, res) => {
    const reserva = await crearReserva.ejecutar(leerDatosReserva(req.body));
    res.status(201).json(reserva.aProps());
  });

  app.get('/reservas/:id', async (req, res) => {
    const reserva = await consultarReserva.ejecutar(req.params.id);
    if (!reserva) {
      res.status(404).json({ codigo: 'RESERVA_NO_ENCONTRADA', error: 'La reserva no existe' });
      return;
    }

    res.json(reserva.aProps());
  });

  app.get('/notificaciones-pendientes', async (_req, res) => {
    const pendientes = await listarPendientes.ejecutar();
    res.json(pendientes.map((pendiente) => pendiente.aProps()));
  });

  app.use(responderError);
  return app;
}
