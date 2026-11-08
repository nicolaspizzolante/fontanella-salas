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

export function NombreSala({
  salaId,
  nombre,
  detalle,
  grande = false,
}: {
  salaId: string;
  nombre: string;
  detalle?: string;
  grande?: boolean;
}) {
  return (
    <span className={`inline-flex items-center ${grande ? "gap-3" : "gap-2"}`}>
      <InsigniaSala salaId={salaId} nombre={nombre} tamano={grande ? 32 : 24} />
      <span className="leading-tight">
        <span className={`block text-tinta ${grande ? "titulo-cartel text-[22px]" : "font-medium"}`}>{nombre}</span>
        {detalle && <span className="block text-sm text-tinta-3">{detalle}</span>}
      </span>
    </span>
  );
}
