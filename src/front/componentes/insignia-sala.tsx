"use client";

import { useApp } from "../contexto";

/** Círculo de color de línea con la inicial de la sala, como los de la señalética del Subte. */
export function InsigniaSala({ salaId, nombre, tamano = 24 }: { salaId: string; nombre: string; tamano?: number }) {
  const { lineaDe } = useApp();
  const linea = lineaDe(salaId);
  const inicial = nombre.replace(/^(Sala|Auditorio)\s+/i, "").charAt(0).toUpperCase() || nombre.charAt(0);
  return (
    <span
      aria-hidden
      className="voz-cartel inline-grid shrink-0 place-items-center rounded-full leading-none"
      style={{
        width: tamano,
        height: tamano,
        fontSize: tamano * 0.56,
        background: `var(--linea-${linea})`,
        color: "#fff",
      }}
    >
      {inicial}
    </span>
  );
}

export function NombreSala({ salaId, nombre, detalle }: { salaId: string; nombre: string; detalle?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <InsigniaSala salaId={salaId} nombre={nombre} />
      <span className="leading-tight">
        <span className="block font-medium text-tinta">{nombre}</span>
        {detalle && <span className="block text-sm text-tinta-3">{detalle}</span>}
      </span>
    </span>
  );
}
