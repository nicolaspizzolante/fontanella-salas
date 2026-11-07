/** Tests unitarios de las reglas de horario: funciones puras, sin base de datos. */
import { describe, expect, it } from "vitest";
import { instanteLocal, partesLocales, problemasDeFranja } from "@/server/reservas/horario";

// "Ahora" fijo: lunes 2 de noviembre de 2026, 09:00 en Buenos Aires.
const AHORA = new Date("2026-11-02T12:00:00Z");
const local = (fechaHora: string) => new Date(`${fechaHora}:00-03:00`);
const codigos = (inicio: string, fin: string) =>
  problemasDeFranja(local(inicio), local(fin), AHORA).map((p) => p.codigo);

describe("conversión de zona horaria", () => {
  it("interpreta las fechas en hora de Buenos Aires aunque se guarden en UTC", () => {
    expect(instanteLocal("2026-11-10", 10 * 60).toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(partesLocales(new Date("2026-11-10T13:00:00Z"))).toMatchObject({
      fecha: "2026-11-10",
      diaSemana: 2,
      minutos: 600,
    });
  });

  it("una hora de la noche en UTC sigue siendo el día anterior en Argentina", () => {
    expect(partesLocales(new Date("2026-11-11T01:00:00Z")).fecha).toBe("2026-11-10");
  });
});

describe("problemasDeFranja", () => {
  it("acepta una franja válida", () => {
    expect(codigos("2026-11-10T10:00", "2026-11-10T11:30")).toEqual([]);
  });

  it("acepta franjas que tocan exactamente la apertura y el cierre", () => {
    expect(codigos("2026-11-10T08:00", "2026-11-10T09:00")).toEqual([]);
    expect(codigos("2026-11-10T19:00", "2026-11-10T20:00")).toEqual([]);
  });

  it("rechaza un fin anterior o igual al inicio", () => {
    expect(codigos("2026-11-10T11:00", "2026-11-10T10:00")).toEqual(["RANGO_INVALIDO"]);
    expect(codigos("2026-11-10T10:00", "2026-11-10T10:00")).toEqual(["RANGO_INVALIDO"]);
  });

  it("rechaza horarios que no son múltiplos de 30 minutos", () => {
    expect(codigos("2026-11-10T10:15", "2026-11-10T11:00")).toContain("FUERA_DE_BLOQUE");
    expect(codigos("2026-11-10T10:00", "2026-11-10T10:45")).toContain("FUERA_DE_BLOQUE");
  });

  it("rechaza horarios fuera del horario de atención", () => {
    expect(codigos("2026-11-10T07:30", "2026-11-10T09:00")).toContain("FUERA_DE_HORARIO");
    expect(codigos("2026-11-10T19:00", "2026-11-10T20:30")).toContain("FUERA_DE_HORARIO");
  });

  it("rechaza fines de semana", () => {
    expect(codigos("2026-11-14T10:00", "2026-11-14T11:00")).toContain("DIA_NO_HABIL"); // sábado
  });

  it("rechaza reservas que cruzan de un día a otro", () => {
    expect(codigos("2026-11-10T19:00", "2026-11-11T09:00")).toContain("DISTINTO_DIA");
  });

  it("rechaza duraciones mayores a 8 horas", () => {
    expect(codigos("2026-11-10T08:00", "2026-11-10T16:30")).toContain("DURACION_INVALIDA");
  });

  it("rechaza horarios pasados, incluida una franja que ya empezó hoy", () => {
    expect(codigos("2026-10-30T10:00", "2026-10-30T11:00")).toContain("EN_EL_PASADO");
    expect(codigos("2026-11-02T08:30", "2026-11-02T10:00")).toContain("EN_EL_PASADO");
  });

  it("rechaza reservas con más de 90 días de anticipación", () => {
    expect(codigos("2027-02-15T10:00", "2027-02-15T11:00")).toContain("DEMASIADO_ANTICIPADA");
  });

  it("informa todos los problemas juntos", () => {
    // Sábado, 07:15 a 21:00: fuera de bloque, de horario, día no hábil y demasiado larga.
    expect(codigos("2026-11-14T07:15", "2026-11-14T21:00")).toEqual(
      expect.arrayContaining(["FUERA_DE_BLOQUE", "DIA_NO_HABIL", "FUERA_DE_HORARIO", "DURACION_INVALIDA"]),
    );
  });
});
