import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { AppError } from './errors/AppError';
import { healthRouter } from './routes/health.routes';
import { reservasRouter } from './routes/reservas.routes';
import { montarSwagger } from './docs/swagger';
import { manejadorDeErrores, rutaNoEncontrada } from './middlewares/errores';
import { requestId } from './middlewares/requestId';
import { autenticacion } from './middlewares/autenticacion';

export const app = express();

app.use(requestId); // X-Request-Id en cada pedido (RNF-14)
app.use(helmet());
app.use(cors({
  origin: (origen, responder) => responder(null, Boolean(origen && origen === config.frontUrl)),
  exposedHeaders: ['X-Request-Id'],
}));
app.use(express.json({ limit: '100kb' }));
app.use((err: { type?: string }, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return next(new AppError(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo JSON supera los 100 KB'));
  }
  next(err);
});
app.use(healthRouter);
app.use('/reservas', autenticacion, reservasRouter);
montarSwagger(app);
app.use(rutaNoEncontrada); // siempre al final
app.use(manejadorDeErrores); // siempre el último de todos
