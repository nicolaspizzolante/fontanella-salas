"use client";

import type { Disponibilidad } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { useApp } from "../contexto";
import { minutosLocales, textoHora } from "../formato";
import { ANCHO_ETIQUETA, BLOQUE, BLOQUES, MAX_BLOQUES, APERTURA, CIERRE, bloqueDeMinuto, minutoDeBloque } from "./reglas";

export type Seleccion = { salaId: string; ancla: number; extremo: number; completa: boolean };

type SalaDelDia = Disponibilidad["salas"][number];

const pct = (bloques: number) => `${(bloques / BLOQUES) * 100}%`;

/**
 * Una sala como una línea de Subte: la traza es su día de atención, las horas son
 * estaciones y cada reserva es un tramo grueso sobre la línea.
 */
export function LineaSala(props: {
  sala: SalaDelDia;
  fecha: string;
  esAdmin: boolean;
  interactiva: boolean;
  primerBloqueLibre: number;
  seleccion: Seleccion | null;
  onSeleccionar: (s: Seleccion | null) => void;
  minutoAhora: number | null;
}) {
  const { sala, interactiva, primerBloqueLibre, seleccion, onSeleccionar, esAdmin, minutoAhora } = props;
  const { lineaDe } = useApp();
  const color = `var(--linea-${lineaDe(sala.id)})`;
  const colorTexto = `var(--linea-${lineaDe(sala.id)}-texto)`;

  const tramos = sala.ocupado.map((f) => ({
    ...f,
    desde: Math.max(0, bloqueDeMinuto(Math.max(APERTURA, minutosLocales(f.inicio)))),
    hasta: Math.min(BLOQUES, bloqueDeMinuto(Math.min(CIERRE, minutosLocales(f.fin)))),
  }));
  const ocupado = (b: number) => tramos.some((t) => b >= t.desde && b < t.hasta);
  const libre = (b: number) => b >= primerBloqueLibre && !ocupado(b);
  const rangoLibre = (a: number, b: number) => {
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (!libre(i)) return false;
    return true;
  };

  function alHacerClic(b: number) {
    if (!seleccion || seleccion.completa) {
      onSeleccionar({ salaId: sala.id, ancla: b, extremo: b, completa: false });
      return;
    }
    if (b === seleccion.ancla) {
      onSeleccionar({ ...seleccion, completa: true });
      return;
    }
    const largo = Math.abs(b - seleccion.ancla) + 1;
    if (rangoLibre(seleccion.ancla, b) && largo <= MAX_BLOQUES) {
      onSeleccionar({ ...seleccion, extremo: b, completa: true });
    } else {
      // El tramo atravesaría una reserva o excede 8 h: empieza una selección nueva.
      onSeleccionar({ salaId: sala.id, ancla: b, extremo: b, completa: false });
    }
  }

  const selDesde = seleccion ? Math.min(seleccion.ancla, seleccion.extremo) : 0;
  const selHasta = seleccion ? Math.max(seleccion.ancla, seleccion.extremo) + 1 : 0;

  return (
    <div className="grid border-b border-borde" style={{ gridTemplateColumns: `${ANCHO_ETIQUETA} 1fr` }}>
      <div className="flex items-center px-4 py-3">
        <NombreSala salaId={sala.id} nombre={sala.nombre} detalle={`${sala.sede.nombre} · ${sala.capacidad} personas`} />
      </div>

      <div className="relative ml-3 mr-5 h-[68px]">
        {/* Traza: tramo ya transcurrido apagado, el resto en el color de la línea. */}
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ocupado-suelo" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{ left: pct(primerBloqueLibre), right: 0, background: color, opacity: 0.45 }}
        />

        {/* Estaciones: una por hora. */}
        {Array.from({ length: 13 }, (_, i) => {
          const pasada = i * 2 < primerBloqueLibre;
          return (
            <span
              key={i}
              aria-hidden
              className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-superficie"
              style={{ left: `${(i / 12) * 100}%`, borderColor: pasada ? "var(--borde-fuerte)" : color }}
            />
          );
        })}

        {/* Tramos reservados. */}
        {tramos.map((t) => {
          const propia = t.propia;
          const etiqueta = esAdmin ? t.empresa?.nombre : propia ? "Tu reserva" : "Ocupada";
          return (
            <div
              key={t.inicio}
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: pct(t.desde), width: pct(t.hasta - t.desde) }}
              title={`${etiqueta ?? "Ocupada"} · ${textoHora(minutoDeBloque(t.desde))} a ${textoHora(minutoDeBloque(t.hasta))}`}
            >
              <div
                className={`mx-[2px] h-3 rounded-full ${propia ? "" : "trama-ocupado"}`}
                style={propia ? { background: color } : esAdmin ? { background: color, opacity: 0.85 } : undefined}
              />
              {t.hasta - t.desde >= 2 && (
                <span
                  className="absolute left-1 top-[-22px] max-w-full truncate text-xs font-medium"
                  style={{ color: propia || esAdmin ? colorTexto : "var(--tinta-3)" }}
                >
                  {etiqueta}
                </span>
              )}
            </div>
          );
        })}

        {/* Selección en curso. */}
        {seleccion && (
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2"
            style={{ left: pct(selDesde), width: pct(selHasta - selDesde) }}
          >
            <div
              className="mx-[2px] h-4 rounded-full border-2 border-dashed"
              style={{ borderColor: color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
            />
            <span className="numeros absolute left-1 top-[-22px] whitespace-nowrap text-xs font-semibold" style={{ color: colorTexto }}>
              {textoHora(minutoDeBloque(selDesde))} a {textoHora(minutoDeBloque(selHasta))}
              {!seleccion.completa && " · elegí el fin"}
            </span>
          </div>
        )}

        {/* Línea de "ahora". */}
        {minutoAhora !== null && minutoAhora > APERTURA && minutoAhora < CIERRE && (
          <div
            aria-hidden
            className="absolute inset-y-2 w-px bg-tinta"
            style={{ left: `${((minutoAhora - APERTURA) / (CIERRE - APERTURA)) * 100}%` }}
          />
        )}

        {/* Zonas de clic: un botón por bloque libre de 30 minutos. */}
        {interactiva && (
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${BLOQUES}, 1fr)` }}>
            {Array.from({ length: BLOQUES }, (_, b) =>
              libre(b) ? (
                <button
                  key={b}
                  type="button"
                  onClick={() => alHacerClic(b)}
                  aria-label={`${sala.nombre}, ${textoHora(minutoDeBloque(b))} a ${textoHora(minutoDeBloque(b) + BLOQUE)}, libre`}
                  aria-pressed={seleccion ? b >= selDesde && b < selHasta : false}
                  className="group relative h-full cursor-pointer focus-visible:z-10"
                >
                  <span
                    className="absolute inset-x-[1px] top-1/2 h-4 -translate-y-1/2 rounded-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}
                  />
                </button>
              ) : (
                <span key={b} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
