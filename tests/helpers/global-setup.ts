import { execSync } from "node:child_process";

/** Aplica las migraciones a la base de tests antes de correr la suite. */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
    stdio: "pipe",
  });
}
