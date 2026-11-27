interface Props {
  texto?: string;
}

// Se muestra cuando una búsqueda o una lista no trae nada
export function SinResultados({ texto = 'No hay resultados.' }: Props) {
  return <p className="sin-resultados">{texto}</p>;
}
