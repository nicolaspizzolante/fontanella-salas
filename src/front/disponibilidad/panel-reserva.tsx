"use client";

import { useState } from "react";
import { ErrorApi, type DetalleError, type Disponibilidad } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { useApp } from "../contexto";
import { capitalizar, duracionTexto, fechaLarga, textoHora } from "../formato";
import type { Seleccion } from "./linea-sala";
import { BLOQUE, minutoDeBloque } from "./reglas";

type Props = {
  fecha: string;
  sala: Disponibilidad["salas"][number] | null;
  seleccion: Seleccion | null;
  esAdmin: boolean;
  cerrado: boolean;
  onDescartar: () => void;
  onConfirmar: (asistentes: number, motivo: string) => Promise<void>;
};

/** Panel lateral (no modal): resume la franja elegida y confirma la reserva. */
export function PanelReserva({ fecha, sala, seleccion, esAdmin, cerrado, onDescartar, onConfirmar }: Props) {
  const { lineaDe } = useApp();
  const [asistentes, setAsistentes] = useState(() => (sala ? Math.min(2, sala.capacidad) : 2));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalles: DetalleError[] } | null>(null);

  if (esAdmin || cerrado || !sala || !seleccion) {
    return (
      <aside className="canto pt-4 lg:sticky lg:top-6">
        <h2 className="titulo-cartel text-2xl">{esAdmin ? "Vista de administración" : "Reservar una sala"}</h2>
        {esAdmin ? (
          <p className="mt-2 text-[15px] text-tinta-2">
            Ves todas las reservas y de qué empresa es cada una. Las reservas las hacen las empresas clientes; podés
            cancelarlas desde la sección Reservas.
          </p>
        ) : cerrado ? (
          <p className="mt-2 text-[15px] text-tinta-2">Elegí un día de lunes a viernes para ver franjas libres.</p>
        ) : (
          <p className="mt-2 text-[15px] text-tinta-2">
            Sobre la línea de una sala, tocá la hora en que empieza la reunión y después la hora en que termina.
          </p>
        )}
        {!esAdmin && !cerrado && (
          <p className="mt-3 text-sm text-tinta-3">
            De lunes a viernes, de 8 a 20 h, en bloques de 30 minutos y hasta 8 horas por reserva.
          </p>
        )}
      </aside>
    );
  }

  const desde = Math.min(seleccion.ancla, seleccion.extremo);
  const hasta = Math.max(seleccion.ancla, seleccion.extremo) + 1;
  const minutos = (hasta - desde) * BLOQUE;
  const excedeCapacidad = asistentes > sala.capacidad;
  const asistentesInvalidos = !Number.isInteger(asistentes) || asistentes < 1;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (excedeCapacidad || asistentesInvalidos) return;
    setEnviando(true);
    setError(null);
    try {
      await onConfirmar(asistentes, motivo);
    } catch (e) {
      setError({
        mensaje: e instanceof ErrorApi ? e.message : "No pudimos confirmar la reserva. Intentá de nuevo.",
        detalles: e instanceof ErrorApi && Array.isArray(e.detalles) ? (e.detalles as DetalleError[]) : [],
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <aside
      className="pt-4 lg:sticky lg:top-6"
      style={{ borderTop: `3px solid var(--linea-${lineaDe(sala.id)})` }}
      aria-label="Nueva reserva"
    >
      <form onSubmit={enviar}>
        <h2 className="titulo-cartel text-2xl">Nueva reserva</h2>
        <div className="mt-3">
          <NombreSala salaId={sala.id} nombre={sala.nombre} />
          <p className="mt-1 text-sm text-tinta-3">
            {sala.sede.nombre} · hasta {sala.capacidad} personas
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          <dt className="text-tinta-3">Día</dt>
          <dd>{capitalizar(fechaLarga(fecha))}</dd>
          <dt className="text-tinta-3">Horario</dt>
          <dd className="numeros font-semibold">
            {textoHora(minutoDeBloque(desde))} a {textoHora(minutoDeBloque(hasta))}
          </dd>
          <dt className="text-tinta-3">Duración</dt>
          <dd className="numeros">{duracionTexto(minutos)}</dd>
        </dl>
        {!seleccion.completa && (
          <p className="mt-2 text-sm text-tinta-3">Hacé clic en otra franja de la misma sala para extender la reserva.</p>
        )}

        <label className="mt-5 block">
          <span className="text-sm font-medium">Asistentes</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={sala.capacidad}
            value={Number.isNaN(asistentes) ? "" : asistentes}
            onChange={(e) => setAsistentes(e.target.valueAsNumber)}
            aria-invalid={excedeCapacidad || asistentesInvalidos}
            aria-describedby="ayuda-asistentes"
            className="numeros mt-1.5 block w-full rounded-md border border-borde bg-superficie px-3 py-2 hover:border-borde-fuerte aria-[invalid=true]:border-error"
          />
          <span id="ayuda-asistentes" className={`mt-1 block text-sm ${excedeCapacidad ? "text-error" : "text-tinta-3"}`}>
            {excedeCapacidad
              ? `Esta sala admite hasta ${sala.capacidad} personas.`
              : asistentesInvalidos
                ? "Indicá al menos una persona."
                : `Máximo ${sala.capacidad}.`}
          </span>
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium">
            Motivo <span className="font-normal text-tinta-3">(opcional)</span>
          </span>
          <input
            type="text"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: Reunión con cliente"
            className="mt-1.5 block w-full rounded-md border border-borde bg-superficie px-3 py-2 placeholder:text-tinta-3 hover:border-borde-fuerte"
          />
        </label>

        {error && (
          <div role="alert" className="mt-4 rounded-md bg-error-suelo px-3 py-2.5 text-sm text-error">
            <p className="font-medium">{error.mensaje}</p>
            {error.detalles.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {error.detalles.map((d, i) => (
                  <li key={i}>{d.mensaje}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={enviando || excedeCapacidad || asistentesInvalidos}
            className="flex-1 rounded-md bg-banda px-4 py-2.5 font-semibold text-banda-tinta transition-colors duration-150 hover:bg-banda-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Confirmando…" : "Confirmar reserva"}
          </button>
          <button
            type="button"
            onClick={onDescartar}
            className="rounded-md px-3 py-2.5 text-sm font-medium text-tinta-2 hover:bg-superficie-2 hover:text-tinta"
          >
            Descartar
          </button>
        </div>
      </form>
    </aside>
  );
}
