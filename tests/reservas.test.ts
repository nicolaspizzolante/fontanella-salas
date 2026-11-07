/** Crear reservas: reglas de superposición, capacidad, horario e identidad. */
import { beforeEach, describe, expect, it } from "vitest";
import { crearPrismaClient, prisma } from "@/server/db";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;
const fecha = diaHabil(2);

beforeEach(async () => {
  e = await crearEscenario();
});

const reservar = (empresaId: string, salaId: string, desde: string, hasta: string, asistentes = 2) =>
  api.crearReserva({ empresaId }, { salaId, asistentes, ...franja(fecha, desde, hasta) });

describe("crear reserva", () => {
  it("crea una reserva válida y la devuelve con status 201", async () => {
    const { status, cuerpo } = await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");

    expect(status).toBe(201);
    expect(cuerpo.reserva).toMatchObject({
      estado: "CONFIRMADA",
      asistentes: 2,
      sala: { id: e.salaChica.id },
      empresa: { id: e.empresaA.id },
      ...franja(fecha, "10:00", "11:00"),
    });
  });

  it("rechaza con 409 una reserva que se superpone, aunque sea de otra empresa", async () => {
    await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");

    const { status, cuerpo } = await reservar(e.empresaB.id, e.salaChica.id, "10:30", "11:30");

    expect(status).toBe(409);
    expect(cuerpo.error.codigo).toBe("SALA_OCUPADA");
    expect(cuerpo.error.detalles.conflictos).toEqual([franja(fecha, "10:00", "11:00")]);
  });

  it("el 409 no revela qué empresa tiene la reserva", async () => {
    await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");
    const { cuerpo } = await reservar(e.empresaB.id, e.salaChica.id, "10:00", "11:00");

    const texto = JSON.stringify(cuerpo);
    expect(texto).not.toContain(e.empresaA.id);
    expect(texto).not.toContain(e.empresaA.nombre);
  });

  it.each([
    ["contiene a la existente", "09:30", "11:30"],
    ["está contenida en la existente", "10:00", "10:30"],
    ["es idéntica", "10:00", "11:00"],
    ["empieza antes y termina adentro", "09:00", "10:30"],
  ])("rechaza una reserva que %s", async (_caso, desde, hasta) => {
    await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");
    expect((await reservar(e.empresaB.id, e.salaChica.id, desde, hasta)).status).toBe(409);
  });

  it("acepta reservas contiguas: 10–11 y 11–12 no se superponen", async () => {
    expect((await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00")).status).toBe(201);
    expect((await reservar(e.empresaB.id, e.salaChica.id, "11:00", "12:00")).status).toBe(201);
    expect((await reservar(e.empresaB.id, e.salaChica.id, "09:00", "10:00")).status).toBe(201);
  });

  it("acepta el mismo horario en otra sala", async () => {
    await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");
    expect((await reservar(e.empresaB.id, e.salaGrande.id, "10:00", "11:00")).status).toBe(201);
  });

  it("rechaza con 422 si los asistentes superan la capacidad de la sala", async () => {
    const { status, cuerpo } = await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00", 5);
    expect(status).toBe(422);
    expect(cuerpo.error.codigo).toBe("CAPACIDAD_EXCEDIDA");
  });

  it("rechaza con 422 un horario inválido y explica cada problema", async () => {
    const { status, cuerpo } = await reservar(e.empresaA.id, e.salaChica.id, "07:15", "08:00");
    expect(status).toBe(422);
    expect(cuerpo.error.codigo).toBe("HORARIO_INVALIDO");
    expect(cuerpo.error.detalles.map((d: { codigo: string }) => d.codigo)).toEqual(
      expect.arrayContaining(["FUERA_DE_BLOQUE", "FUERA_DE_HORARIO"]),
    );
  });

  it("rechaza con 404 una sala que no existe o está inactiva", async () => {
    await prisma.sala.update({ where: { id: e.salaGrande.id }, data: { activa: false } });
    const inexistente = "00000000-0000-4000-8000-000000000000";
    expect((await reservar(e.empresaA.id, inexistente, "10:00", "11:00")).status).toBe(404);
    expect((await reservar(e.empresaA.id, e.salaGrande.id, "10:00", "11:00")).status).toBe(404);
  });

  it("la reserva persiste: una conexión nueva a la base la encuentra", async () => {
    const { cuerpo } = await reservar(e.empresaA.id, e.salaChica.id, "10:00", "11:00");

    const otraConexion = crearPrismaClient();
    try {
      const guardada = await otraConexion.reserva.findUnique({ where: { id: cuerpo.reserva.id } });
      expect(guardada?.estado).toBe("CONFIRMADA");
    } finally {
      await otraConexion.$disconnect();
    }
  });
});

describe("identidad al crear", () => {
  const cuerpo = () => ({ salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, "10:00", "11:00") });

  it("responde 401 si no se identifica ninguna empresa", async () => {
    expect((await api.crearReserva("anonimo", cuerpo())).status).toBe(401);
  });

  it("responde 401 si la empresa no existe", async () => {
    const { status } = await api.crearReserva({ empresaId: "00000000-0000-4000-8000-000000000000" }, cuerpo());
    expect(status).toBe(401);
  });

  it("el administrador no reserva en nombre de clientes (403)", async () => {
    expect((await api.crearReserva("admin", cuerpo())).status).toBe(403);
  });

  it("la reserva queda a nombre de quien la pide, aunque el cuerpo intente otra empresa", async () => {
    const { status } = await api.crearReserva(
      { empresaId: e.empresaA.id },
      { ...cuerpo(), empresaId: e.empresaB.id },
    );
    // El campo extra se rechaza: nadie puede elegir a nombre de quién reserva.
    expect(status).toBe(400);
    expect(await prisma.reserva.count({ where: { empresaId: e.empresaB.id } })).toBe(0);
  });
});
