/** Endpoint de métricas: permisos, validación del rango y datos reales de la base. */
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;

beforeEach(async () => {
  e = await crearEscenario();
});

describe("GET /api/metricas", () => {
  it("es solo para el administrador: una empresa cliente recibe 403", async () => {
    const { status, cuerpo } = await api.metricas({ empresaId: e.empresaA.id });
    expect(status).toBe(403);
    expect(cuerpo.error.codigo).toBe("PROHIBIDO");
  });

  it("sin identificarse responde 401", async () => {
    expect((await api.metricas("anonimo")).status).toBe(401);
  });

  it("por defecto analiza las últimas 4 semanas", async () => {
    const { status, cuerpo } = await api.metricas("admin");
    expect(status).toBe(200);
    expect(cuerpo.rango.diasHabiles).toBeGreaterThanOrEqual(19);
    expect(cuerpo.rango.diasHabiles).toBeLessThanOrEqual(20);
  });

  it("refleja las reservas guardadas en la base", async () => {
    const fecha = diaHabil(1);
    await api.crearReserva(
      { empresaId: e.empresaA.id },
      { salaId: e.salaGrande.id, asistentes: 10, ...franja(fecha, "10:00", "12:00") },
    );

    const { cuerpo } = await api.metricas("admin", `?desde=${fecha}&hasta=${fecha}`);
    // Un día hábil, 2 salas × 12 h = 24 h disponibles; 2 h reservadas.
    expect(cuerpo.resumen).toMatchObject({ horasReservadas: 2, ocupacion: 0.083, reservasConfirmadas: 1 });
    const empresaA = cuerpo.porEmpresa.find((x: { empresa: { id: string } }) => x.empresa.id === e.empresaA.id);
    expect(empresaA).toMatchObject({ horasReservadas: 2, participacion: 1, usoCapacidad: 0.5 });
  });

  it("rechaza un rango invertido o demasiado amplio", async () => {
    expect((await api.metricas("admin", "?desde=2026-11-10&hasta=2026-11-01")).status).toBe(422);
    expect((await api.metricas("admin", "?desde=2024-01-01&hasta=2026-01-01")).status).toBe(422);
    expect((await api.metricas("admin", "?desde=hoy")).status).toBe(400);
  });
});
