"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  ahora: Date;
  onCancelar: (reservaId: string) => Promise<void>;
}) {
  const { sala, interactiva, primerBloqueLibre, seleccion, onSeleccionar, esAdmin, minutoAhora, ahora, onCancelar } = props;
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

  // Arrastre con el mouse: se aprieta en el inicio, se suelta en el fin.
  // El clic suelto sigue funcionando como antes (un clic para el inicio y otro para el fin).
  // desdeInicio: el arrastre arrancó con un inicio ya marcado por un clic anterior.
  const arrastre = useRef<{ ancla: number; extremo: number; movido: boolean; desdeInicio: boolean; bloque: number } | null>(null);
  const ignorarClic = useRef(false);
  const [arrastrando, setArrastrando] = useState(false);
  const traza = useRef<HTMLDivElement>(null);

  function alApretar(e: React.PointerEvent, b: number) {
    if (e.pointerType !== "mouse" || e.button !== 0) return; // en pantallas táctiles queda el doble toque
    e.preventDefault(); // evita seleccionar texto y que el bloque quede con foco
    ignorarClic.current = true;
    setArrastrando(true);
    escucharSoltar();
    if (seleccion && !seleccion.completa) {
      // Ya hay un inicio marcado: se puede arrastrar desde ahí, o soltar sin moverse (segundo clic).
      arrastre.current = { ancla: seleccion.ancla, extremo: seleccion.extremo, movido: false, desdeInicio: true, bloque: b };
      return;
    }
    arrastre.current = { ancla: b, extremo: b, movido: false, desdeInicio: false, bloque: b };
    onSeleccionar({ salaId: sala.id, ancla: b, extremo: b, completa: false });
  }

  function alPasar(b: number) {
    const a = arrastre.current;
    if (!a) return;
    // Se estira hasta donde se pueda en esa dirección: frena antes de una reserva o al llegar a 8 h.
    const paso = b >= a.ancla ? 1 : -1;
    let hasta = a.ancla;
    while (hasta !== b && libre(hasta + paso) && Math.abs(hasta + paso - a.ancla) + 1 <= MAX_BLOQUES) hasta += paso;
    if (hasta === a.extremo) return;
    b = hasta;
    a.extremo = b;
    a.movido = true;
    onSeleccionar({ salaId: sala.id, ancla: a.ancla, extremo: b, completa: false });
  }

  // El bloque bajo el mouse se calcula por posición sobre la línea, así el arrastre
  // sigue aunque el puntero pase por encima de una reserva o salte varios bloques.
  function alSoltar() {
    const a = arrastre.current;
    arrastre.current = null;
    setArrastrando(false);
    if (!a) return;
    // Si se arrastró, el tramo queda listo. Si no, fue un clic: el primero marca el inicio
    // (ya hecho al apretar) y el segundo, el fin.
    if (a.movido) onSeleccionar({ salaId: sala.id, ancla: a.ancla, extremo: a.extremo, completa: true });
    else if (a.desdeInicio) alHacerClic(a.bloque);
  }

  // Los listeners de ventana llaman siempre a la versión más reciente de cada función.
  const alPasarActual = useRef(alPasar);
  const alSoltarActual = useRef(alSoltar);
  useEffect(() => {
    alPasarActual.current = alPasar;
    alSoltarActual.current = alSoltar;
  });

  // El fin del arrastre se escucha desde el momento de apretar (un clic rápido suelta
  // antes de que React vuelva a renderizar).
  function escucharSoltar() {
    const fin = () => {
      window.removeEventListener("pointerup", fin);
      window.removeEventListener("pointercancel", fin);
      alSoltarActual.current();
    };
    window.addEventListener("pointerup", fin);
    window.addEventListener("pointercancel", fin);
  }

  useEffect(() => {
    if (!arrastrando) return;
    const alMover = (e: PointerEvent) => {
      const caja = traza.current?.getBoundingClientRect();
      if (!caja) return;
      const b = Math.floor(((e.clientX - caja.left) / caja.width) * BLOQUES);
      alPasarActual.current(Math.min(BLOQUES - 1, Math.max(0, b)));
    };
    window.addEventListener("pointermove", alMover);
    // Mano cerrada en toda la página mientras dura el arrastre.
    document.documentElement.classList.add("arrastrando");
    return () => {
      window.removeEventListener("pointermove", alMover);
      document.documentElement.classList.remove("arrastrando");
    };
  }, [arrastrando]);

  const selDesde = seleccion ? Math.min(seleccion.ancla, seleccion.extremo) : 0;
  const selHasta = seleccion ? Math.max(seleccion.ancla, seleccion.extremo) + 1 : 0;

  return (
    <div className="grid border-b border-borde" style={{ gridTemplateColumns: `${ANCHO_ETIQUETA} 1fr` }}>
      <div className="flex items-center py-3 pr-3">
        <NombreSala salaId={sala.id} nombre={sala.nombre} detalle={`${sala.sede.nombre} · ${sala.capacidad} personas`} grande />
      </div>

      <div ref={traza} data-linea-sala className="relative ml-3 mr-5 h-[88px]">
        {/* Traza: tramo ya transcurrido apagado, el resto en el color de la línea. */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ocupado-suelo" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ left: pct(primerBloqueLibre), right: 0, background: color, opacity: 0.5 }}
        />

        {/* Estaciones: una por hora. */}
        {Array.from({ length: 13 }, (_, i) => {
          const pasada = i * 2 < primerBloqueLibre;
          return (
            <span
              key={i}
              aria-hidden
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] bg-superficie"
              style={{ left: `${(i / 12) * 100}%`, borderColor: pasada ? "var(--borde-fuerte)" : color }}
            />
          );
        })}

        {/* Tramos reservados: los propios (o todos, para la administración) que todavía no empezaron se pueden cancelar. */}
        {tramos.map((t) => {
          const propia = t.propia;
          const etiqueta = (esAdmin ? t.empresa?.nombre : propia ? "Tu reserva" : "Ocupada") ?? "Ocupada";
          const horario = `${textoHora(minutoDeBloque(t.desde))} a ${textoHora(minutoDeBloque(t.hasta))}`;
          const posicion = { left: pct(t.desde), width: pct(t.hasta - t.desde) };
          const contenido = (
            <>
              <span
                className={`mx-[2px] block h-4 rounded-full ${propia ? "" : "trama-ocupado"}`}
                style={propia ? { background: color } : esAdmin ? { background: color, opacity: 0.85 } : undefined}
              />
              {t.hasta - t.desde >= 2 && (
                <span
                  className="absolute left-1 top-[-16px] max-w-full truncate text-[13px] font-semibold"
                  style={{ color: propia || esAdmin ? colorTexto : "var(--tinta-3)" }}
                >
                  {etiqueta}
                </span>
              )}
            </>
          );

          if (t.reservaId && new Date(t.inicio) > ahora) {
            return (
              <TramoCancelable
                key={t.inicio}
                reservaId={t.reservaId}
                etiqueta={etiqueta}
                horario={horario}
                sala={sala.nombre}
                esAdmin={esAdmin}
                posicion={posicion}
                onCancelar={onCancelar}
              >
                {contenido}
              </TramoCancelable>
            );
          }

          return (
            <Tooltip key={t.inicio}>
              <TooltipTrigger asChild>
                <div className="absolute top-1/2 z-10 -translate-y-1/2 py-2" style={posicion}>
                  {contenido}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-sm">
                <span className="font-medium">{etiqueta}</span>
                <span className="numeros">{horario}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Selección en curso. */}
        {seleccion && (
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2"
            style={{ left: pct(selDesde), width: pct(selHasta - selDesde) }}
          >
            <div
              className="mx-[2px] h-5 rounded-full border-2 border-dashed"
              style={{ borderColor: color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
            />
            <span className="numeros absolute left-1 top-[-26px] whitespace-nowrap text-[13px] font-semibold" style={{ color: colorTexto }}>
              {textoHora(minutoDeBloque(selDesde))} a {textoHora(minutoDeBloque(selHasta))}
              {!seleccion.completa && !arrastrando && " · elegí el fin"}
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
          <div className="pointer-events-none absolute inset-0 grid select-none" style={{ gridTemplateColumns: `repeat(${BLOQUES}, 1fr)` }}>
            {Array.from({ length: BLOQUES }, (_, b) =>
              libre(b) ? (
                <Button
                  key={b}
                  variant="ghost"
                  onPointerDown={(e) => alApretar(e, b)}
                  onClick={() => {
                    // El clic que sigue a apretar el mouse ya se resolvió en el arrastre.
                    if (ignorarClic.current) {
                      ignorarClic.current = false;
                      return;
                    }
                    alHacerClic(b);
                  }}
                  aria-label={`${sala.nombre}, ${textoHora(minutoDeBloque(b))} a ${textoHora(minutoDeBloque(b) + BLOQUE)}, libre`}
                  aria-pressed={seleccion ? b >= selDesde && b < selHasta : false}
                  className="group pointer-events-auto relative h-full w-auto min-w-0 cursor-pointer rounded-none p-0 hover:bg-transparent focus-visible:z-10 aria-expanded:bg-transparent dark:hover:bg-transparent active:not-aria-[haspopup]:translate-y-0"
                >
                  <span
                    className="absolute inset-x-[1px] top-1/2 h-5 -translate-y-1/2 rounded-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}
                  />
                </Button>
              ) : (
                <span key={b} className="pointer-events-none" />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Tramo propio: al tocarlo muestra el horario y la opción de cancelar, con confirmación. */
function TramoCancelable(props: {
  reservaId: string;
  etiqueta: string;
  horario: string;
  sala: string;
  esAdmin: boolean;
  posicion: { left: string; width: string };
  onCancelar: (reservaId: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const { reservaId, etiqueta, horario, sala, esAdmin, posicion, onCancelar, children } = props;
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setConfirmando(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${etiqueta}, ${sala}, ${horario}. Ver opciones`}
          className="absolute top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full py-2 transition-[filter] duration-150 ease-out hover:brightness-110"
          style={posicion}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-64 p-3">
        <p className="font-medium text-tinta">{etiqueta}</p>
        <p className="numeros text-sm text-tinta-2">
          {sala} · {horario}
        </p>
        {confirmando ? (
          <div className="mt-3 border-t border-borde pt-3">
            <p className="text-sm text-tinta">
              {esAdmin ? `¿Cancelar la reserva de ${etiqueta}?` : "¿Cancelar esta reserva?"} La franja queda libre para otros
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={enviando}
                className="bg-error font-medium text-banda-tinta hover:bg-error/90"
                onClick={async () => {
                  setEnviando(true);
                  try {
                    await onCancelar(reservaId);
                    setAbierto(false);
                  } finally {
                    setEnviando(false);
                    setConfirmando(false);
                  }
                }}
              >
                {enviando ? "Cancelando…" : "Sí, cancelar"}
              </Button>
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setConfirmando(false)}>
                No
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="mt-3 w-full text-error hover:text-error" onClick={() => setConfirmando(true)}>
            Cancelar reserva
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
