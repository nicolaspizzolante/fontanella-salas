"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorApi, pedirApi, type Reserva } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { useApp } from "../contexto";
import { capitalizar, fechaCorta, fechaDe, hoy, rangoHorario, sumarDias } from "../formato";

type Pestana = "proximas" | "pasadas" | "canceladas";

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "proximas", etiqueta: "Próximas" },
  { id: "pasadas", etiqueta: "Pasadas" },
  { id: "canceladas", etiqueta: "Canceladas" },
];

const DIAS_HISTORIAL = 60;

function consultaDe(pestana: Pestana) {
  const desdeHistorial = sumarDias(hoy(), -DIAS_HISTORIAL);
  if (pestana === "proximas") return "?estado=CONFIRMADA";
  if (pestana === "pasadas") return `?estado=CONFIRMADA&desde=${desdeHistorial}&hasta=${hoy()}`;
  return `?estado=CANCELADA&desde=${desdeHistorial}`;
}

export function VistaReservas() {
  const { actor } = useApp();
  const esAdmin = actor?.tipo === "admin";
  const [pestana, setPestana] = useState<Pestana>("proximas");
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  // Referencia de "ahora" fijada en cada carga, para clasificar próximas, en curso y pasadas.
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setReservas(null);
    setError(null);
    try {
      const { reservas } = await pedirApi<{ reservas: Reserva[] }>(actor, `/api/reservas${consultaDe(pestana)}`);
      setReservas(reservas);
      setAhora(Date.now());
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar las reservas.");
    }
  }, [actor, pestana]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!reservas) return null;
    let lista = reservas;
    if (pestana === "proximas") lista = lista.filter((r) => new Date(r.fin).getTime() > ahora);
    if (pestana === "pasadas") lista = lista.filter((r) => new Date(r.fin).getTime() <= ahora).reverse();
    if (pestana === "canceladas")
      lista = [...lista].sort((a, b) => (b.canceladaEn ?? "").localeCompare(a.canceladaEn ?? ""));
    if (filtroEmpresa) lista = lista.filter((r) => r.empresa.id === filtroEmpresa);
    return lista;
  }, [reservas, pestana, filtroEmpresa, ahora]);

  const empresas = useMemo(() => {
    const mapa = new Map((reservas ?? []).map((r) => [r.empresa.id, r.empresa.nombre]));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reservas]);

  async function cancelar(reserva: Reserva) {
    try {
      const { reserva: actualizada } = await pedirApi<{ reserva: Reserva }>(actor, `/api/reservas/${reserva.id}/cancelar`, {
        method: "POST",
      });
      setReservas((lista) => lista?.filter((r) => r.id !== actualizada.id) ?? null);
      setMensaje({
        tipo: "exito",
        texto: `Cancelaste la reserva de ${actualizada.sala.nombre} del ${fechaCorta(fechaDe(actualizada.inicio))} de ${rangoHorario(actualizada.inicio, actualizada.fin)}. La franja ya está disponible para otros clientes.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof ErrorApi ? e.message : "No pudimos cancelar la reserva." });
      await cargar();
    }
  }

  return (
    <div>
      <h1 className="titulo-cartel text-[40px]">{esAdmin ? "Reservas" : "Mis reservas"}</h1>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Estado de las reservas" className="inline-flex rounded-md border border-borde bg-superficie p-1">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              role="tab"
              type="button"
              aria-selected={pestana === p.id}
              onClick={() => {
                setPestana(p.id);
                setMensaje(null);
              }}
              className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
                pestana === p.id ? "bg-banda text-banda-tinta" : "text-tinta-2 hover:text-tinta"
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        {esAdmin && empresas.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-tinta-2">
            Empresa
            <select
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
              className="rounded-md border border-borde bg-superficie py-1.5 pl-2.5 pr-8 text-tinta hover:border-borde-fuerte"
            >
              <option value="">Todas</option>
              {empresas.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mensaje && (
        <div
          role={mensaje.tipo === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md px-4 py-3 text-[15px] ${mensaje.tipo === "exito" ? "bg-exito-suelo text-exito" : "bg-error-suelo text-error"}`}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="canto mt-4">
        {error ? (
          <div className="py-6">
            <p role="alert" className="text-error">{error}</p>
            <button type="button" onClick={cargar} className="mt-3 text-sm font-medium underline underline-offset-4">
              Reintentar
            </button>
          </div>
        ) : !visibles ? (
          <TablaEsqueleto />
        ) : visibles.length === 0 ? (
          <Vacio pestana={pestana} esAdmin={esAdmin} />
        ) : (
          <TablaReservas reservas={visibles} pestana={pestana} esAdmin={esAdmin} ahora={ahora} onCancelar={cancelar} />
        )}
      </div>
      {pestana !== "proximas" && (
        <p className="mt-3 text-sm text-tinta-3">Se muestran los últimos {DIAS_HISTORIAL} días.</p>
      )}
    </div>
  );
}

function TablaReservas({
  reservas,
  pestana,
  esAdmin,
  ahora,
  onCancelar,
}: {
  reservas: Reserva[];
  pestana: Pestana;
  esAdmin: boolean;
  ahora: number;
  onCancelar: (r: Reserva) => Promise<void>;
}) {
  const th = "voz-cartel px-3 py-2.5 text-left text-xs text-tinta-3 first:pl-0";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[15px]">
        <thead className="border-b border-borde">
          <tr>
            <th className={th}>Día</th>
            <th className={th}>Horario</th>
            <th className={th}>Sala</th>
            {esAdmin && <th className={th}>Empresa</th>}
            <th className={`${th} text-right`}>Asistentes</th>
            <th className={th}>Motivo</th>
            <th className={th}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {reservas.map((r, i) => {
            const fecha = fechaDe(r.inicio);
            const mismaFecha = i > 0 && fechaDe(reservas[i - 1].inicio) === fecha;
            return <FilaReserva key={r.id} reserva={r} mostrarFecha={!mismaFecha} pestana={pestana} esAdmin={esAdmin} ahora={ahora} onCancelar={onCancelar} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilaReserva({
  reserva: r,
  mostrarFecha,
  pestana,
  esAdmin,
  ahora,
  onCancelar,
}: {
  reserva: Reserva;
  mostrarFecha: boolean;
  pestana: Pestana;
  esAdmin: boolean;
  ahora: number;
  onCancelar: (r: Reserva) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fecha = fechaDe(r.inicio);
  const empezo = new Date(r.inicio).getTime() <= ahora;
  const td = "px-3 py-3 align-middle first:pl-0";

  return (
    <tr className={`hover:bg-superficie-2 ${mostrarFecha ? "border-t border-t-borde-fuerte first:border-t-0" : ""}`}>
      <td className={`${td} titulo-cartel whitespace-nowrap text-lg`}>
        {mostrarFecha ? (fecha === hoy() ? "Hoy" : capitalizar(fechaCorta(fecha))) : ""}
      </td>
      <td className={`${td} numeros whitespace-nowrap`}>{rangoHorario(r.inicio, r.fin)}</td>
      <td className={td}>
        <NombreSala salaId={r.sala.id} nombre={r.sala.nombre} />
      </td>
      {esAdmin && <td className={td}>{r.empresa.nombre}</td>}
      <td className={`${td} numeros text-right`}>{r.asistentes}</td>
      <td className={`${td} max-w-[16rem] truncate text-tinta-2`} title={r.motivo ?? undefined}>
        {r.motivo ?? <span className="text-tinta-3">—</span>}
      </td>
      <td className={`${td} whitespace-nowrap text-right`}>
        {pestana === "canceladas" ? (
          <span className="text-sm text-tinta-3">
            Cancelada {r.canceladaEn && `el ${fechaCorta(fechaDe(r.canceladaEn))}`}
            {r.origenCancelacion === "ADMIN" && " por la administración"}
          </span>
        ) : pestana === "proximas" && empezo ? (
          <span className="rounded-sm bg-aviso-suelo px-2 py-1 text-xs font-semibold text-aviso">En curso</span>
        ) : pestana === "proximas" && !confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            aria-label={`Cancelar la reserva de ${r.sala.nombre} del ${fechaCorta(fecha)} de ${rangoHorario(r.inicio, r.fin)}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-error hover:bg-error-suelo"
          >
            Cancelar
          </button>
        ) : pestana === "proximas" ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-sm text-tinta-2">¿Cancelar{esAdmin ? ` la reserva de ${r.empresa.nombre}` : ""}?</span>
            <button
              type="button"
              disabled={enviando}
              onClick={async () => {
                setEnviando(true);
                await onCancelar(r);
                setEnviando(false);
                setConfirmando(false);
              }}
              className="rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-tinta-2 hover:bg-superficie-2"
            >
              No
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function Vacio({ pestana, esAdmin }: { pestana: Pestana; esAdmin: boolean }) {
  const textos: Record<Pestana, string> = {
    proximas: esAdmin ? "No hay reservas próximas." : "No tenés reservas próximas.",
    pasadas: "No hay reservas en los últimos 60 días.",
    canceladas: "No hay reservas canceladas en los últimos 60 días.",
  };
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-tinta-2">{textos[pestana]}</p>
      {pestana === "proximas" && !esAdmin && (
        <Link
          href="/disponibilidad"
          className="mt-4 inline-block rounded-md bg-banda px-4 py-2 font-semibold text-banda-tinta hover:bg-banda-2"
        >
          Ver disponibilidad y reservar
        </Link>
      )}
    </div>
  );
}

function TablaEsqueleto() {
  return (
    <div className="divide-y divide-borde">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-4">
          <div className="h-4 w-20 animate-pulse rounded bg-ocupado-suelo" />
          <div className="h-4 w-24 animate-pulse rounded bg-ocupado-suelo" />
          <div className="h-4 w-40 animate-pulse rounded bg-ocupado-suelo" />
        </div>
      ))}
    </div>
  );
}
