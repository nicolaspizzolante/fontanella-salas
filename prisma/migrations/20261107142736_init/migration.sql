-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenCancelacion" AS ENUM ('EMPRESA', 'ADMIN');

-- CreateTable
CREATE TABLE "sedes" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salas" (
    "id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" UUID NOT NULL,
    "sala_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "asistentes" INTEGER NOT NULL,
    "motivo" TEXT,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'CONFIRMADA',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelada_en" TIMESTAMPTZ(3),
    "origen_cancelacion" "OrigenCancelacion",

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sedes_nombre_key" ON "sedes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "salas_sede_id_nombre_key" ON "salas"("sede_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_nombre_key" ON "empresas"("nombre");

-- CreateIndex
CREATE INDEX "reservas_empresa_id_inicio_idx" ON "reservas"("empresa_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_sala_id_inicio_idx" ON "reservas"("sala_id", "inicio");

-- AddForeignKey
ALTER TABLE "salas" ADD CONSTRAINT "salas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Reglas de integridad que Prisma no puede expresar en schema.prisma.
-- Viven en la base para que se cumplan aunque haya concurrencia o un bug en la app.
-- ---------------------------------------------------------------------------

-- Necesaria para combinar igualdad de uuid (sala_id) con rangos en un índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "salas"
  ADD CONSTRAINT "salas_capacidad_positiva" CHECK ("capacidad" > 0);

ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_rango_valido" CHECK ("fin" > "inicio"),
  ADD CONSTRAINT "reservas_asistentes_positivos" CHECK ("asistentes" > 0),
  ADD CONSTRAINT "reservas_cancelacion_consistente" CHECK (
    ("estado" = 'CANCELADA') = ("cancelada_en" IS NOT NULL)
  );

-- Garantía central del negocio: una sala no puede tener dos reservas CONFIRMADAS
-- cuyos intervalos [inicio, fin) se superpongan. Postgres la verifica de forma
-- atómica, así que dos requests simultáneos nunca pueden ganar los dos.
-- Las reservas canceladas quedan fuera, por eso cancelar libera la franja.
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_sin_superposicion"
  EXCLUDE USING gist (
    "sala_id" WITH =,
    tstzrange("inicio", "fin", '[)') WITH &&
  ) WHERE ("estado" = 'CONFIRMADA');
