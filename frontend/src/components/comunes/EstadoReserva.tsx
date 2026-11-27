import type { EstadoReserva as Estado } from '../../types';

interface Props {
  estado: Estado;
}

// Etiqueta de color según el estado de la reserva (los colores están en index.css)
export function EstadoReserva({ estado }: Props) {
  return <span className={`estado ${estado.toLowerCase()}`}>{estado}</span>;
}
