/**
 * Error de una regla de negocio. Lleva un código estable para que la capa API
 * lo traduzca a HTTP (por ejemplo 422 o 409) sin que el dominio conozca HTTP.
 */
export type CodigoErrorDominio =
  | 'DATOS_INVALIDOS'
  | 'FECHA_PASADA'
  | 'ANTICIPACION_INSUFICIENTE'
  | 'ANTICIPACION_EXCEDIDA'
  | 'TRANSICION_INVALIDA'
  | 'MOTIVO_REQUERIDO';

export class ErrorDeDominio extends Error {
  constructor(
    public readonly codigo: CodigoErrorDominio,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeDominio';
  }
}
