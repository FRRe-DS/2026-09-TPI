import { crearApp } from '../api/app.js';
import { componer } from './composicion.js';
import { leerConfig } from './config.js';

const config = leerConfig(process.env);
const app = crearApp(await componer(config));

app.listen(config.puerto, (error) => {
  if (error) throw error;
  console.log(`API de Reservas en puerto ${config.puerto}`);
});
