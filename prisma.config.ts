import "dotenv/config";
import { defineConfig } from "prisma/config";

// Por defecto apunta a la base de docker-compose.yml, así `npm install`
// (que genera el cliente de Prisma) funciona aunque todavía no exista un .env.
const URL_POR_DEFECTO = "postgresql://salas:salas@localhost:5432/salas";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? URL_POR_DEFECTO,
  },
});
