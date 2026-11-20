import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('m9-reservas-grupo-09', '0.1.0');

// Métrica 1: Tasa de creación de reservas y resultado
export const reservasCreadasCounter = meter.createCounter('reservas_creadas_total', {
  description: 'Total de reservas creadas discriminadas por resultado y tipo de vehículo',
});

// Métrica 2: Activaciones de reservas hacia M5 y duración
export const reservasActivacionesCounter = meter.createCounter('reservas_activaciones_total', {
  description: 'Total de activaciones hacia M5 discriminadas por resultado',
});

export const reservasActivacionDuracionHistogram = meter.createHistogram('reservas_activacion_duracion_ms', {
  description: 'Duración de la activación hacia M5 en milisegundos',
  unit: 'ms',
});

// Métrica 3: Cancelaciones y modificaciones/reprogramaciones
export const reservasCancelacionesCounter = meter.createCounter('reservas_cancelaciones_total', {
  description: 'Total de reservas canceladas',
});

export const reservasModificacionesCounter = meter.createCounter('reservas_modificaciones_total', {
  description: 'Total de reservas modificadas o reprogramadas',
});
