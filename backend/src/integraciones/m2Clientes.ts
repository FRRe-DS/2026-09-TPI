// M2 (Clientes): ¿el cliente puede reservar? (RF-9.3)
// Contrato: GET {M2_URL}/api/v1/clientes/{clienteId}/estado-cuenta -> { estado: ACTIVO | BLOQUEADO }
import { config } from '../config/env';
import { AppError, errores } from '../errors/AppError';
import { llamarModulo } from './httpCliente';

interface EstadoCuenta {
  estado?: string;
}

// true = ACTIVO, false = BLOQUEADO.
// Cliente inexistente: 422 con regla CLIENTE_INEXISTENTE.
// M2 sin respuesta: el 503 de httpCliente.
export async function verificarClienteHabilitado(clienteId: string): Promise<boolean> {
  const { status, datos } = await llamarModulo<EstadoCuenta>({
    modulo: 'M2',
    metodo: 'GET',
    url: `${config.m2Url}/api/v1/clientes/${encodeURIComponent(clienteId)}/estado-cuenta`,
  });

  // 404: no existe. 400: el id no tiene el formato de M2 (UUID), así que tampoco existe ahí.
  if (status === 404 || status === 400) {
    throw errores.reglaIncumplida('El cliente no existe en el módulo de Clientes', {
      regla: 'CLIENTE_INEXISTENTE',
    });
  }
  if (status === 200 && datos?.estado === 'ACTIVO') return true;
  if (status === 200 && datos?.estado === 'BLOQUEADO') return false;

  // 401/403 (token rechazado) o una respuesta que no respeta el contrato: M2 no está disponible para M9.
  throw new AppError(503, 'SERVICIO_NO_DISPONIBLE', `M2 respondió de forma inesperada (HTTP ${status})`, {
    modulo: 'M2',
  });
}
