import { z } from "zod";
import { prisma } from "./db";
import { ErrorNoIdentificado, ErrorProhibido, ErrorValidacion } from "./errores";

/**
 * Quién hace el pedido. Es el ÚNICO lugar donde se resuelve la identidad.
 *
 * v1 (sin autenticación): la identidad llega en headers.
 *   - `x-empresa-id: <uuid>` → actúa como esa empresa cliente.
 *   - `x-rol: admin`         → actúa como la empresa administradora.
 *
 * Limitación conocida: los headers son falsificables. Para producción, esta función
 * se reemplaza por la validación de un token (p. ej. JWT de Entra ID / Azure AD)
 * sin tocar servicios ni endpoints, que solo reciben un `Actor`.
 */
export type Actor = { tipo: "empresa"; empresaId: string } | { tipo: "admin" };

export const HEADER_EMPRESA = "x-empresa-id";
export const HEADER_ROL = "x-rol";

export async function obtenerActor(request: Request): Promise<Actor> {
  const rol = request.headers.get(HEADER_ROL);
  const empresaId = request.headers.get(HEADER_EMPRESA);

  if (rol && empresaId) {
    throw new ErrorValidacion(`Enviá ${HEADER_ROL} o ${HEADER_EMPRESA}, no ambos.`);
  }
  if (rol === "admin") return { tipo: "admin" };
  if (rol) throw new ErrorValidacion(`Rol desconocido: solo se admite "${HEADER_ROL}: admin".`);
  if (!empresaId) throw new ErrorNoIdentificado();

  if (!z.uuid().safeParse(empresaId).success) {
    throw new ErrorNoIdentificado("La empresa indicada no existe.");
  }
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
  if (!empresa) throw new ErrorNoIdentificado("La empresa indicada no existe.");

  return { tipo: "empresa", empresaId: empresa.id };
}

export function exigirAdmin(actor: Actor): asserts actor is { tipo: "admin" } {
  if (actor.tipo !== "admin") {
    throw new ErrorProhibido("Esta operación es solo para la empresa administradora.");
  }
}

export function exigirEmpresa(actor: Actor): asserts actor is { tipo: "empresa"; empresaId: string } {
  if (actor.tipo !== "empresa") {
    throw new ErrorProhibido("Esta operación la realiza una empresa cliente.");
  }
}
