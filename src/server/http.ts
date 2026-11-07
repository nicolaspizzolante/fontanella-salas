import { z } from "zod";
import { ErrorDeDominio, ErrorValidacion } from "./errores";

z.config(z.locales.es());

type CuerpoError = { error: { codigo: string; mensaje: string; detalles?: unknown } };

function responderError(error: unknown): Response {
  if (error instanceof ErrorDeDominio) {
    const cuerpo: CuerpoError = { error: { codigo: error.codigo, mensaje: error.message } };
    if (error.detalles !== undefined) cuerpo.error.detalles = error.detalles;
    return Response.json(cuerpo, { status: error.status });
  }
  // Nunca exponemos detalles internos (SQL, stack, datos de otras empresas).
  console.error(error);
  const cuerpo: CuerpoError = {
    error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado. Intentá de nuevo." },
  };
  return Response.json(cuerpo, { status: 500 });
}

/** Envuelve un route handler: traduce cualquier error a una respuesta JSON consistente. */
export function manejar<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return responderError(error);
    }
  };
}

export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new ErrorValidacion(
      "Los datos enviados no son válidos.",
      resultado.error.issues.map((issue) => ({
        campo: issue.path.join(".") || undefined,
        mensaje: issue.message,
      })),
    );
  }
  return resultado.data;
}

export async function leerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ErrorValidacion("El cuerpo del pedido no es un JSON válido.");
  }
}

export function parametrosDeConsulta(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
