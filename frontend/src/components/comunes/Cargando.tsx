interface Props {
  texto?: string;
}

// Indicador de espera mientras se hace un pedido a la API
export function Cargando({ texto = 'Cargando…' }: Props) {
  return (
    <p className="cargando" role="status" aria-live="polite">
      <span className="cargando-icono" aria-hidden="true" />
      {texto}
    </p>
  );
}
