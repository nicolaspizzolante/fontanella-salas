/**
 * Errores de dominio. Cada uno sabe con qué status HTTP se responde y lleva un
 * código estable que el front puede usar para mostrar mensajes claros.
 */
export type DetalleError = { campo?: string; codigo?: string; mensaje: string };

export class ErrorDeDominio extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

export class ErrorValidacion extends ErrorDeDominio {
  constructor(mensaje: string, detalles?: DetalleError[]) {
    super(400, "DATOS_INVALIDOS", mensaje, detalles);
  }
}

export class ErrorNoIdentificado extends ErrorDeDominio {
  constructor(mensaje = "Falta identificar la empresa que hace el pedido.") {
    super(401, "NO_IDENTIFICADO", mensaje);
  }
}

export class ErrorProhibido extends ErrorDeDominio {
  constructor(mensaje: string) {
    super(403, "PROHIBIDO", mensaje);
  }
}

export class ErrorNoEncontrado extends ErrorDeDominio {
  constructor(codigo: string, mensaje: string) {
    super(404, codigo, mensaje);
  }
}

export class ErrorConflicto extends ErrorDeDominio {
  constructor(codigo: string, mensaje: string, detalles?: unknown) {
    super(409, codigo, mensaje, detalles);
  }
}

/** Datos válidos en forma pero que violan una regla de negocio (horario, capacidad...). */
export class ErrorReglaNegocio extends ErrorDeDominio {
  constructor(codigo: string, mensaje: string, detalles?: DetalleError[]) {
    super(422, codigo, mensaje, detalles);
  }
}
