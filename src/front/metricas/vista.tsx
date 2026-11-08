"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Metricas } from "@/server/metricas/calculo";
import { ErrorApi, pedirApi } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { useApp } from "../contexto";
import { capitalizar, fechaCorta, horasTexto, hoy, porcentaje, sumarDias } from "../formato";

const PRESETS = [
  { id: "4", etiqueta: "Últimas 4 semanas", dias: 28 },
  { id: "8", etiqueta: "Últimas 8 semanas", dias: 56 },
] as const;

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DIAS_CORTOS = ["", "Lun", "Mar", "Mié", "Jue", "Vie"];
const sinDiaSemana = (fecha: string) => fechaCorta(fecha).replace(/^\S+\s/, "");
const rangoDeFechas = (desde: string, hasta: string) => `${sinDiaSemana(desde)} al ${sinDiaSemana(hasta)}`;

/** Escala secuencial de un solo tono (azul de la línea C), de claro a oscuro. */
const tonoOcupacion = (valor: number) =>
  `color-mix(in oklab, var(--linea-c) ${Math.round(8 + Math.min(valor, 1) * 92)}%, var(--superficie))`;

export function VistaMetricas() {
  const { actor } = useApp();
  const [rango, setRango] = useState(() => ({ desde: sumarDias(hoy(), -27), hasta: hoy() }));
  const [datos, setDatos] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const esAdmin = actor?.tipo === "admin";

  const cargar = useCallback(async () => {
    if (!esAdmin) return;
    setCargando(true);
    try {
      const respuesta = await pedirApi<Metricas>(actor, `/api/metricas?desde=${rango.desde}&hasta=${rango.hasta}`);
      setDatos(respuesta);
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos calcular las métricas.");
    } finally {
      setCargando(false);
    }
  }, [actor, esAdmin, rango]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  if (!esAdmin) {
    return (
      <div>
        <h1 className="titulo-cartel text-[40px]">Métricas de uso</h1>
        <p className="mt-3 max-w-[65ch] text-tinta-2">
          Las métricas de uso son solo para la administración del edificio. Desde{" "}
          <Link href="/disponibilidad" className="font-medium text-tinta underline underline-offset-4">
            Disponibilidad
          </Link>{" "}
          podés reservar una sala.
        </p>
      </div>
    );
  }

  const presetActivo = PRESETS.find((p) => rango.hasta === hoy() && rango.desde === sumarDias(hoy(), -(p.dias - 1)))?.id;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="titulo-cartel text-[40px]">Métricas de uso</h1>
          {datos && (
            <p className="numeros mt-2 text-tinta-2">
              Del {rangoDeFechas(datos.rango.desde, datos.rango.hasta)} · {datos.rango.diasHabiles} días hábiles
            </p>
          )}
        </div>
        <SelectorRango
          rango={rango}
          presetActivo={presetActivo}
          onCambiar={(r) => setRango(r)}
        />
      </div>

      {error && (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md bg-error-suelo px-4 py-3 text-[15px] text-error">
          <span>{capitalizar(error)}</span>
          <button type="button" onClick={cargar} className="text-sm font-medium underline underline-offset-4">
            Reintentar
          </button>
        </div>
      )}

      {!datos ? (
        !error && <Esqueleto />
      ) : (
        <div className={`transition-opacity duration-200 ${cargando ? "opacity-60" : ""}`} aria-busy={cargando}>
          <Resumen datos={datos} />

          <div className="mt-12 grid items-start gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-12">
              <MapaCalor datos={datos} />
              <OcupacionPorSala datos={datos} />
              <Tendencia datos={datos} />
            </div>
            <Oportunidades datos={datos} />
          </div>

          <TablaEmpresas datos={datos} />
        </div>
      )}
    </div>
  );
}

// --- Rango -----------------------------------------------------------------

function SelectorRango({
  rango,
  presetActivo,
  onCambiar,
}: {
  rango: { desde: string; hasta: string };
  presetActivo: string | undefined;
  onCambiar: (r: { desde: string; hasta: string }) => void;
}) {
  const campo = "h-9 rounded-md border border-borde bg-superficie px-2.5 font-medium text-tinta hover:border-borde-fuerte";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Períodos rápidos" className="inline-flex rounded-md border border-borde bg-superficie p-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={presetActivo === p.id}
            onClick={() => onCambiar({ desde: sumarDias(hoy(), -(p.dias - 1)), hasta: hoy() })}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors duration-150 ${
              presetActivo === p.id ? "bg-banda text-banda-tinta" : "text-tinta-2 hover:text-tinta"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-2">
        <label className="flex items-center gap-2">
          Desde
          <input
            type="date"
            value={rango.desde}
            max={rango.hasta}
            onChange={(e) => e.target.value && onCambiar({ ...rango, desde: e.target.value })}
            className={campo}
          />
        </label>
        <label className="flex items-center gap-2">
          hasta
          <input
            type="date"
            value={rango.hasta}
            min={rango.desde}
            onChange={(e) => e.target.value && onCambiar({ ...rango, hasta: e.target.value })}
            className={campo}
          />
        </label>
      </div>
    </div>
  );
}

// --- Piezas comunes ----------------------------------------------------------

function Seccion({
  titulo,
  descripcion,
  accion,
  children,
  className = "",
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`canto relative min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 pt-3">
        <div>
          <h2 className="titulo-cartel text-2xl">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-sm text-tinta-2">{descripcion}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function BotonVista({ comoTabla, onCambiar }: { comoTabla: boolean; onCambiar: () => void }) {
  return (
    <button
      type="button"
      onClick={onCambiar}
      aria-pressed={comoTabla}
      className="rounded-md border border-borde px-2.5 py-1 text-sm font-medium text-tinta-2 transition-colors duration-150 hover:border-borde-fuerte hover:text-tinta"
    >
      {comoTabla ? "Ver gráfico" : "Ver tabla"}
    </button>
  );
}

/** Globo de ayuda sobre la marca bajo el puntero; se ubica relativo al contenedor con `data-globo`. */
function useGlobo() {
  const [globo, setGlobo] = useState<{ x: number; y: number; contenido: ReactNode } | null>(null);
  const mostrar = (elemento: HTMLElement, contenido: ReactNode) => {
    const caja = elemento.closest("[data-globo]")?.getBoundingClientRect();
    if (!caja) return;
    const r = elemento.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - caja.left + r.width / 2, 90), caja.width - 90);
    setGlobo({ x, y: r.top - caja.top, contenido });
  };
  const nodo = globo && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-x-1/2 -translate-y-full rounded-md bg-banda px-3 py-2 text-sm text-banda-tinta shadow-[0_4px_12px_rgb(0_0_0/0.18)]"
      style={{ left: globo.x, top: globo.y - 8 }}
    >
      {globo.contenido}
    </div>
  );
  return { mostrar, ocultar: () => setGlobo(null), nodo };
}

function TablaSimple({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto pt-3">
      <table className="numeros w-full text-[15px]">
        <thead>
          <tr className="border-b border-borde">
            {columnas.map((c, i) => (
              <th key={c} className={`voz-cartel py-2 text-xs text-tinta-3 ${i === 0 ? "text-left" : "text-right"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td key={j} className={`py-1.5 ${j === 0 ? "text-left text-tinta" : "text-right text-tinta-2"}`}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Resumen -----------------------------------------------------------------

function Resumen({ datos }: { datos: Metricas }) {
  const { resumen, rango } = datos;
  const cifras = [
    {
      nombre: "Ocupación",
      valor: porcentaje(resumen.ocupacion),
      nota: `${horasTexto(resumen.horasReservadas)} de ${horasTexto(rango.horasDisponibles)} disponibles`,
    },
    {
      nombre: "Reservas confirmadas",
      valor: resumen.reservasConfirmadas.toLocaleString("es-AR"),
      nota: `${resumen.empresasActivas} ${resumen.empresasActivas === 1 ? "empresa activa" : "empresas activas"}`,
    },
    {
      nombre: "Cancelaciones",
      valor: porcentaje(resumen.tasaCancelacion),
      nota: `${resumen.reservasCanceladas} canceladas, ${resumen.cancelacionesTardias} con menos de 24 h`,
    },
    {
      nombre: "Uso de capacidad",
      valor: porcentaje(resumen.usoCapacidad),
      nota: "Asistentes sobre la capacidad de la sala, en promedio",
    },
  ];
  return (
    <dl className="canto mt-8 grid grid-cols-2 gap-y-5 pt-4 xl:grid-cols-4">
      {cifras.map((c, i) => (
        <div key={c.nombre} className={`border-borde pr-4 ${i % 2 ? "border-l pl-4" : ""} ${i === 2 ? "xl:border-l xl:pl-4" : ""}`}>
          <dt className="text-sm font-medium text-tinta-2">{c.nombre}</dt>
          <dd className="titulo-cartel numeros mt-1 text-[40px] text-tinta">{c.valor}</dd>
          <dd className="mt-0.5 text-sm text-tinta-3">{c.nota}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- Mapa de calor -------------------------------------------------------------

function MapaCalor({ datos }: { datos: Metricas }) {
  const [comoTabla, setComoTabla] = useState(false);
  const globo = useGlobo();
  const horas = [...new Set(datos.mapaCalor.map((c) => c.hora))].sort((a, b) => a - b);
  const celda = new Map(datos.mapaCalor.map((c) => [`${c.diaSemana}-${c.hora}`, c.ocupacion]));
  const valles = new Set(datos.oportunidades.franjasValle.map((v) => `${v.diaSemana}-${v.hora}`));
  const etiqueta = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <Seccion
      titulo="Ocupación por día y hora"
      descripcion="Promedio de todas las salas, por franja de una hora."
      accion={<BotonVista comoTabla={comoTabla} onCambiar={() => setComoTabla((v) => !v)} />}
    >
      {comoTabla ? (
        <TablaSimple
          columnas={["Hora", ...DIAS_CORTOS.slice(1)]}
          filas={horas.map((h) => [etiqueta(h), ...[1, 2, 3, 4, 5].map((d) => porcentaje(celda.get(`${d}-${h}`) ?? 0))])}
        />
      ) : (
        <div data-globo className="relative pt-4" onMouseLeave={globo.ocultar}>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[560px] gap-[2px]"
              style={{ gridTemplateColumns: `3rem repeat(${horas.length}, minmax(0, 1fr))` }}
              role="img"
              aria-label="Mapa de calor de ocupación por día de la semana y hora. Usá «Ver tabla» para leer los valores."
            >
              <span />
              {horas.map((h) => (
                <span key={h} className="numeros pb-1 text-xs text-tinta-3">
                  {String(h).padStart(2, "0")}
                </span>
              ))}
              {[1, 2, 3, 4, 5].map((d) => (
                <FilaCalor key={d} dia={d} horas={horas} celda={celda} valles={valles} globo={globo} />
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-tinta-2">
            <span className="inline-flex items-center gap-2">
              <span className="numeros text-xs text-tinta-3">0%</span>
              <span
                className="h-2.5 w-28 rounded-full"
                style={{ background: `linear-gradient(to right, ${tonoOcupacion(0)}, ${tonoOcupacion(1)})` }}
              />
              <span className="numeros text-xs text-tinta-3">100%</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <MarcaValle /> Franja valle, candidata a promoción
            </span>
          </div>
          {globo.nodo}
        </div>
      )}
    </Seccion>
  );
}

function FilaCalor({
  dia,
  horas,
  celda,
  valles,
  globo,
}: {
  dia: number;
  horas: number[];
  celda: Map<string, number>;
  valles: Set<string>;
  globo: ReturnType<typeof useGlobo>;
}) {
  return (
    <>
      <span className="self-center text-sm text-tinta-2">{DIAS_CORTOS[dia]}</span>
      {horas.map((h) => {
        const clave = `${dia}-${h}`;
        const valor = celda.get(clave) ?? 0;
        const esValle = valles.has(clave);
        return (
          <span
            key={h}
            className="relative grid h-9 place-items-center rounded-[3px]"
            style={{ background: tonoOcupacion(valor) }}
            onMouseEnter={(e) =>
              globo.mostrar(
                e.currentTarget,
                <>
                  <span className="block font-medium">
                    {DIAS[dia]} {String(h).padStart(2, "0")}:00 a {String(h + 1).padStart(2, "0")}:00
                  </span>
                  <span className="numeros block text-banda-tinta-2">
                    {porcentaje(valor)} de ocupación{esValle && " · franja valle"}
                  </span>
                </>,
              )
            }
          >
            {esValle && <MarcaValle />}
          </span>
        );
      })}
    </>
  );
}

function MarcaValle() {
  return <span aria-hidden className="block h-2.5 w-2.5 rounded-full border-2 border-tinta bg-superficie" />;
}

// --- Ocupación por sala ----------------------------------------------------------

function OcupacionPorSala({ datos }: { datos: Metricas }) {
  const { lineaDe } = useApp();
  return (
    <Seccion titulo="Ocupación por sala">
      <div className="pt-1">
        {datos.porSede.map((sede) => (
          <div key={sede.sede.id} className="mt-3">
            <div className="flex items-baseline justify-between border-b border-borde pb-1.5 text-sm">
              <span className="voz-cartel text-xs text-tinta-3">{sede.sede.nombre}</span>
              <span className="numeros text-tinta-2">{porcentaje(sede.ocupacion)} en total</span>
            </div>
            <ul className="divide-y divide-borde">
              {datos.porSala
                .filter((s) => s.sede.id === sede.sede.id)
                .map((s) => (
                  <li key={s.sala.id} className="grid items-center gap-x-5 gap-y-2 py-3 sm:grid-cols-[13rem_minmax(0,1fr)_9rem]">
                    <NombreSala salaId={s.sala.id} nombre={s.sala.nombre} detalle={`Capacidad ${s.sala.capacidad}`} />
                    <div className="flex items-center gap-3">
                      <div className="relative h-2.5 flex-1 rounded-full bg-ocupado-suelo">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.min(s.ocupacion, 1) * 100}%`, background: `var(--linea-${lineaDe(s.sala.id)})` }}
                        />
                      </div>
                      <span className="numeros w-11 text-right font-semibold text-tinta">{porcentaje(s.ocupacion)}</span>
                    </div>
                    <div className="numeros text-sm leading-tight text-tinta-2">
                      <span className="block">{horasTexto(s.horasReservadas)} reservadas</span>
                      <span className="block text-tinta-3">
                        {s.reservas ? `${porcentaje(s.usoCapacidad)} de su capacidad` : "Sin reservas"}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

// --- Tendencia semanal -------------------------------------------------------------

function Tendencia({ datos }: { datos: Metricas }) {
  const [comoTabla, setComoTabla] = useState(false);
  const globo = useGlobo();
  const semanas = datos.tendenciaSemanal;
  const maximo = Math.max(0.25, Math.ceil(Math.max(0, ...semanas.map((s) => s.ocupacion)) * 4) / 4);
  const marcas = Array.from({ length: Math.round(maximo / 0.25) + 1 }, (_, i) => i * 0.25);
  const semanaActual = useMemo(() => {
    const d = new Date(`${hoy()}T15:00:00Z`).getUTCDay();
    return sumarDias(hoy(), -((d + 6) % 7));
  }, []);

  return (
    <Seccion
      titulo="Ocupación semana a semana"
      accion={<BotonVista comoTabla={comoTabla} onCambiar={() => setComoTabla((v) => !v)} />}
    >
      {comoTabla ? (
        <TablaSimple
          columnas={["Semana del", "Horas reservadas", "Ocupación"]}
          filas={semanas.map((s) => [sinDiaSemana(s.semana), horasTexto(s.horasReservadas), porcentaje(s.ocupacion)])}
        />
      ) : semanas.length === 0 ? (
        <p className="pt-3 text-tinta-2">El período elegido no tiene días hábiles.</p>
      ) : (
        <div data-globo className="relative pt-6" onMouseLeave={globo.ocultar}>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
            <div className="relative h-44">
              {marcas.map((m) => (
                <span
                  key={m}
                  className="numeros absolute right-2 -translate-y-1/2 text-xs text-tinta-3"
                  style={{ bottom: `${(m / maximo) * 100}%` }}
                >
                  {porcentaje(m)}
                </span>
              ))}
            </div>
            <div className="relative h-44">
              {marcas.map((m) => (
                <span
                  key={m}
                  className={`absolute inset-x-0 border-t ${m === 0 ? "border-borde-fuerte" : "border-borde"}`}
                  style={{ bottom: `${(m / maximo) * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {semanas.map((s) => (
                  <div
                    key={s.semana}
                    className="flex h-full flex-1 items-end justify-center"
                    onMouseEnter={(e) =>
                      globo.mostrar(
                        e.currentTarget.firstElementChild as HTMLElement,
                        <>
                          <span className="block font-medium">Semana del {sinDiaSemana(s.semana)}</span>
                          <span className="numeros block text-banda-tinta-2">
                            {porcentaje(s.ocupacion)} · {horasTexto(s.horasReservadas)}
                            {s.semana > semanaActual ? " comprometidas" : s.semana === semanaActual ? " (en curso)" : ""}
                          </span>
                        </>,
                      )
                    }
                  >
                    <div
                      className="w-full max-w-7 rounded-t-[4px]"
                      style={{
                        height: `${(s.ocupacion / maximo) * 100}%`,
                        background: s.semana > semanaActual ? "transparent" : "var(--linea-c)",
                        border: s.semana > semanaActual ? "2px dashed var(--linea-c)" : undefined,
                        borderBottom: "none",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="ml-10 mt-1.5 flex gap-[2px]">
            {semanas.map((s, i) => (
              <span key={s.semana} className="numeros flex-1 text-center text-xs text-tinta-3">
                {i % Math.ceil(semanas.length / 8) === 0 ? sinDiaSemana(s.semana) : ""}
              </span>
            ))}
          </div>
          {semanas.some((s) => s.semana > semanaActual) && (
            <p className="mt-3 flex items-center gap-2 text-sm text-tinta-2">
              <span className="h-3 w-4 rounded-t-[3px] border-2 border-b-0 border-dashed border-linea-c" />
              Semanas futuras: horas ya reservadas
            </p>
          )}
          {globo.nodo}
        </div>
      )}
    </Seccion>
  );
}

// --- Oportunidades ------------------------------------------------------------------

function Oportunidades({ datos }: { datos: Metricas }) {
  const o = datos.oportunidades;
  const grupos: { titulo: string; sugerencia: string; items: ReactNode[] }[] = [
    {
      titulo: "Horarios para promocionar",
      sugerencia: "Las franjas menos ocupadas: candidatas a tarifas reducidas o paquetes.",
      items: o.franjasValle.map((v) => (
        <>
          {v.etiqueta}: <span className="numeros font-medium text-tinta">{porcentaje(v.ocupacion)}</span> de ocupación.
        </>
      )),
    },
    {
      titulo: "Clientes para fidelizar",
      sugerencia: "Los que más usan las salas: candidatos a un plan con beneficios.",
      items: o.clientesTop.map((e) => (
        <>
          <span className="font-medium text-tinta">{e.empresa.nombre}</span>:{" "}
          <span className="numeros">{horasTexto(e.horasReservadas)}</span>, el {porcentaje(e.participacion)} de las horas reservadas.
        </>
      )),
    },
    {
      titulo: "Clientes para reactivar",
      sugerencia: "Sin reservas hace más de 30 días.",
      items: o.clientesInactivos.map((e) => (
        <>
          <span className="font-medium text-tinta">{e.empresa.nombre}</span>:{" "}
          {e.diasDesdeUltimaReserva === null ? "todavía no hizo ninguna reserva." : `última reserva hace ${e.diasDesdeUltimaReserva} días.`}
        </>
      )),
    },
    {
      titulo: "Cancelaciones tardías para revisar",
      sugerencia: "Cancelan con menos de 24 h y la franja queda difícil de volver a vender.",
      items: o.clientesConCancelacionesTardias.map((e) => (
        <>
          <span className="font-medium text-tinta">{e.empresa.nombre}</span>:{" "}
          <span className="numeros">
            {e.cancelacionesTardias} de {e.cancelaciones}
          </span>{" "}
          cancelaciones fueron tardías.
        </>
      )),
    },
    {
      titulo: "Salas subutilizadas",
      sugerencia: "Poca ocupación o grupos mucho más chicos que la sala.",
      items: o.salasSubutilizadas.map((s) => (
        <>
          <span className="font-medium text-tinta">{s.sala.nombre}</span>:{" "}
          <span className="numeros">{porcentaje(s.ocupacion)}</span> de ocupación
          {s.reservas > 0 && (
            <>
              ; los grupos usan el <span className="numeros">{porcentaje(s.usoCapacidad)}</span> de su capacidad
            </>
          )}
          .
        </>
      )),
    },
  ];

  return (
    <section className="canto pt-3 lg:sticky lg:top-6">
      <h2 className="titulo-cartel text-2xl">Oportunidades comerciales</h2>
      <div className="mt-1 divide-y divide-borde">
        {grupos.map((g) => (
          <div key={g.titulo} className="py-4">
            <h3 className="font-semibold text-tinta">{g.titulo}</h3>
            <p className="text-sm text-tinta-3">{g.sugerencia}</p>
            {g.items.length ? (
              <ul className="mt-2 space-y-1.5 text-[15px] text-tinta-2">
                {g.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-tinta-3" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[15px] text-tinta-3">Nada para señalar en este período.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Empresas -------------------------------------------------------------------------

type FilaEmpresa = Metricas["porEmpresa"][number];
type Orden = { clave: keyof typeof COLUMNAS_EMPRESA; descendente: boolean };

const COLUMNAS_EMPRESA = {
  empresa: { etiqueta: "Empresa", valor: (e: FilaEmpresa) => e.empresa.nombre },
  horasReservadas: { etiqueta: "Horas", valor: (e: FilaEmpresa) => e.horasReservadas },
  participacion: { etiqueta: "Participación", valor: (e: FilaEmpresa) => e.participacion },
  reservas: { etiqueta: "Reservas", valor: (e: FilaEmpresa) => e.reservas },
  tasaCancelacion: { etiqueta: "Cancelación", valor: (e: FilaEmpresa) => e.tasaCancelacion },
  cancelacionesTardias: { etiqueta: "Tardías", valor: (e: FilaEmpresa) => e.cancelacionesTardias },
  usoCapacidad: { etiqueta: "Uso de capacidad", valor: (e: FilaEmpresa) => e.usoCapacidad },
  diasDesdeUltimaReserva: {
    etiqueta: "Última reserva",
    valor: (e: FilaEmpresa) => e.diasDesdeUltimaReserva ?? Number.POSITIVE_INFINITY,
  },
} as const;

function TablaEmpresas({ datos }: { datos: Metricas }) {
  const [orden, setOrden] = useState<Orden>({ clave: "horasReservadas", descendente: true });
  const inactivas = new Set(datos.oportunidades.clientesInactivos.map((e) => e.empresa.id));
  const tardias = new Set(datos.oportunidades.clientesConCancelacionesTardias.map((e) => e.empresa.id));

  const filas = useMemo(() => {
    const valor = COLUMNAS_EMPRESA[orden.clave].valor;
    return [...datos.porEmpresa].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const comparacion = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return orden.descendente ? -comparacion : comparacion;
    });
  }, [datos.porEmpresa, orden]);

  const ordenarPor = (clave: Orden["clave"]) =>
    setOrden((o) => (o.clave === clave ? { clave, descendente: !o.descendente } : { clave, descendente: clave !== "empresa" }));

  return (
    <Seccion titulo="Comportamiento por empresa" className="mt-12">
      <div className="mt-3 overflow-x-auto">
        <table className="numeros w-full min-w-[820px] text-[15px]">
          <thead className="border-b border-borde">
            <tr>
              {(Object.keys(COLUMNAS_EMPRESA) as Orden["clave"][]).map((clave, i) => {
                const activa = orden.clave === clave;
                return (
                  <th
                    key={clave}
                    aria-sort={activa ? (orden.descendente ? "descending" : "ascending") : "none"}
                    className={`px-3 py-1.5 first:pl-0 ${i === 0 ? "text-left" : "text-right"}`}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(clave)}
                      className={`voz-cartel inline-flex items-center gap-1 rounded py-1 text-xs transition-colors duration-150 hover:text-tinta ${
                        activa ? "text-tinta" : "text-tinta-3"
                      }`}
                    >
                      {COLUMNAS_EMPRESA[clave].etiqueta}
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={activa ? "" : "opacity-0"}>
                        <path
                          d={orden.descendente ? "M2 3.5 5 6.5 8 3.5" : "M2 6.5 5 3.5 8 6.5"}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.map((e) => (
              <tr key={e.empresa.id} className="hover:bg-superficie-2">
                <td className="py-2.5 pl-0 pr-3 text-left font-medium text-tinta">{e.empresa.nombre}</td>
                <td className="px-3 py-2.5 text-right text-tinta">{horasTexto(e.horasReservadas)}</td>
                <td className="px-3 py-2.5 text-right text-tinta-2">{porcentaje(e.participacion)}</td>
                <td className="px-3 py-2.5 text-right text-tinta-2">{e.reservas}</td>
                <td className="px-3 py-2.5 text-right text-tinta-2">{porcentaje(e.tasaCancelacion)}</td>
                <td className="px-3 py-2.5 text-right">
                  {tardias.has(e.empresa.id) ? (
                    <Etiqueta tono="aviso">{e.cancelacionesTardias}</Etiqueta>
                  ) : (
                    <span className="text-tinta-2">{e.cancelacionesTardias}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-tinta-2">{e.reservas ? porcentaje(e.usoCapacidad) : "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  {inactivas.has(e.empresa.id) ? (
                    <Etiqueta tono="aviso">
                      {e.diasDesdeUltimaReserva === null ? "Nunca" : `Hace ${e.diasDesdeUltimaReserva} días`}
                    </Etiqueta>
                  ) : (
                    <span className="text-tinta-2">
                      {e.diasDesdeUltimaReserva === null
                        ? "Nunca"
                        : e.diasDesdeUltimaReserva === 0
                          ? "Hoy"
                          : `Hace ${e.diasDesdeUltimaReserva} ${e.diasDesdeUltimaReserva === 1 ? "día" : "días"}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pt-3 text-sm text-tinta-3">
        Las cancelaciones hechas por la administración no cuentan contra la empresa. Resaltadas: inactividad de más de 30 días y
        cancelaciones tardías frecuentes.
      </p>
    </Seccion>
  );
}

function Etiqueta({ tono, children }: { tono: "aviso"; children: ReactNode }) {
  const estilos = { aviso: "bg-aviso-suelo text-aviso" }[tono];
  return <span className={`inline-flex rounded px-2 py-0.5 text-sm font-medium ${estilos}`}>{children}</span>;
}

// --- Carga ------------------------------------------------------------------------------

function Esqueleto() {
  return (
    <div aria-hidden className="mt-6">
      <div className="canto mt-8 h-[104px] animate-pulse bg-superficie-2" />
      <div className="mt-12 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-12">
          <div className="canto h-72 animate-pulse bg-superficie-2" />
          <div className="canto h-60 animate-pulse bg-superficie-2" />
        </div>
        <div className="canto h-[34rem] animate-pulse bg-superficie-2" />
      </div>
    </div>
  );
}
