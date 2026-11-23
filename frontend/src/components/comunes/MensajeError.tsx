interface Props {
  mensaje: string;
  // Si se pasa, aparece el botón Reintentar
  onReintentar?: () => void;
}

export function MensajeError({ mensaje, onReintentar }: Props) {
  return (
    <div className="mensaje-error" role="alert">
      <p className="mensaje error">{mensaje}</p>
      {onReintentar && (
        <button type="button" className="secundario" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}
