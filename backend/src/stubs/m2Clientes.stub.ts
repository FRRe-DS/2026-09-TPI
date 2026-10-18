export async function verificarClienteHabilitado(clienteId: string): Promise<boolean> {
  return !clienteId.trim().toLowerCase().startsWith('bloqueado');
}
