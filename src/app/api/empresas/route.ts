import { listarEmpresas } from "@/server/catalogo";
import { manejar } from "@/server/http";

/**
 * Lista de empresas para el selector "actuar como" de la v1 (no hay login).
 * Con autenticación real este endpoint desaparece o pasa a ser solo de admin.
 */
export const GET = manejar(async () => Response.json({ empresas: await listarEmpresas() }));
