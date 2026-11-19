import express from 'express';
import type { Notificacion } from '../domain/index.js';

const app = express();
const puerto = Number(process.env.PUERTO ?? 3001);

// Permite recibir datos JSON.
app.use(express.json());

// Verifica que los datos tengan la forma de una notificación.
function esNotificacion(datos: unknown): datos is Notificacion {
  if (typeof datos !== 'object' || datos === null) {
    return false;
  }

  const n = datos as Partial<Notificacion>;

  return (
    typeof n.reservaId === 'string' &&
    typeof n.destinatario === 'string' &&
    (n.tipo === 'RESERVA_CREADA' || n.tipo === 'RESERVA_CANCELADA') &&
    typeof n.mensaje === 'string'
  );
}

// Recibe las notificaciones enviadas por Reservas.
app.post('/notificaciones', (req, res) => {
  const datos: unknown = req.body;

  if (!esNotificacion(datos)) {
    res.status(400).json({
      error: 'Datos de notificación inválidos',
    });
    return;
  }

  console.log('=== NOTIFICACIÓN RECIBIDA ===');
  console.log('Reserva:', datos.reservaId);
  console.log('Destinatario:', datos.destinatario);
  console.log('Tipo:', datos.tipo);
  console.log('Mensaje:', datos.mensaje);
  console.log('=============================');

  res.status(201).json({
    mensaje: 'Notificación recibida correctamente',
  });
});

// Inicia el servidor.
app.listen(puerto, () => {
  console.log(`Servicio de Notificaciones en puerto ${puerto}`);
});
