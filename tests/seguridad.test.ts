/**
 * Entradas maliciosas o malformadas: validación estricta, identidad e inyección SQL.
 * (No reemplaza un pentest; cubre los vectores más probables de esta API.)
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;
const fecha = diaHabil(2);
const INYECCION = "'; DROP TABLE reservas; --";

beforeEach(async () => {
  e = await crearEscenario();
});

const valido = () => ({ salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, "10:00", "11:00") });

describe("validación de entrada", () => {
  it.each([
    ["JSON malformado", "{ esto no es json"],
    ["campo desconocido", () => ({ ...valido(), precio: 0 })],
    ["asistentes como texto", () => ({ ...valido(), asistentes: "2" })],
    ["asistentes negativos", () => ({ ...valido(), asistentes: -1 })],
    ["asistentes con decimales", () => ({ ...valido(), asistentes: 2.5 })],
    ["fecha sin zona horaria", () => ({ ...valido(), inicio: `${fecha}T10:00:00` })],
    ["fecha imposible", () => ({ ...valido(), inicio: "2026-02-31T10:00:00Z" })],
    ["salaId que no es uuid", () => ({ ...valido(), salaId: "1" })],
    ["falta un campo obligatorio", () => ({ salaId: e.salaChica.id, asistentes: 2 })],
    ["motivo excesivamente largo", () => ({ ...valido(), motivo: "x".repeat(201) })],
  ])("rechaza con 400: %s", async (_caso, cuerpo) => {
    const payload = typeof cuerpo === "function" ? cuerpo() : cuerpo;
    const { status, cuerpo: respuesta } = await api.crearReserva({ empresaId: e.empresaA.id }, payload);
    expect(status).toBe(400);
    expect(respuesta.error.codigo).toBe("DATOS_INVALIDOS");
    expect(await prisma.reserva.count()).toBe(0);
  });

  it("rechaza parámetros de consulta desconocidos o mal formados", async () => {
    expect((await api.listarReservas({ empresaId: e.empresaA.id }, "?desde=ayer")).status).toBe(400);
    expect((await api.listarReservas({ empresaId: e.empresaA.id }, "?empresaId=otra")).status).toBe(400);
    expect((await api.disponibilidad({ empresaId: e.empresaA.id }, "2026-13-01")).status).toBe(400);
  });
});

describe("identidad", () => {
  it("rechaza headers de identidad ambiguos o desconocidos", async () => {
    expect((await api.salas({ "x-rol": "admin", "x-empresa-id": e.empresaA.id })).status).toBe(400);
    expect((await api.salas({ "x-rol": "superusuario" })).status).toBe(400);
  });

  it("un id de empresa con inyección SQL no identifica a nadie", async () => {
    expect((await api.salas({ "x-empresa-id": `${e.empresaA.id}' OR '1'='1` })).status).toBe(401);
  });

  it("una empresa no accede como administradora mandando otro valor de rol", async () => {
    expect((await api.listarReservas({ "x-rol": "ADMIN" })).status).toBe(400);
  });
});

describe("inyección SQL", () => {
  it("el texto malicioso se guarda como texto literal y no se ejecuta", async () => {
    const { status, cuerpo } = await api.crearReserva(
      { empresaId: e.empresaA.id },
      { ...valido(), motivo: INYECCION },
    );

    expect(status).toBe(201);
    expect(cuerpo.reserva.motivo).toBe(INYECCION);
    expect(await prisma.reserva.count()).toBe(1); // la tabla sigue existiendo
  });

  it("un filtro con inyección SQL es rechazado por la validación", async () => {
    const consulta = `?salaId=${encodeURIComponent(`${e.salaChica.id}' OR '1'='1`)}`;
    expect((await api.listarReservas({ empresaId: e.empresaA.id }, consulta)).status).toBe(400);
  });
});

describe("errores", () => {
  it("las respuestas de error tienen siempre el mismo formato y no exponen detalles internos", async () => {
    await api.crearReserva({ empresaId: e.empresaA.id }, valido());
    const { cuerpo } = await api.crearReserva({ empresaId: e.empresaB.id }, valido());

    expect(cuerpo.error).toEqual({
      codigo: "SALA_OCUPADA",
      mensaje: expect.any(String),
      detalles: expect.any(Object),
    });
    const texto = JSON.stringify(cuerpo);
    expect(texto).not.toMatch(/exclusion|constraint|reservas_sin_superposicion|prisma|stack/i);
  });
});
