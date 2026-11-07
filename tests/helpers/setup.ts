import { afterAll } from "vitest";
import { prisma } from "@/server/db";

afterAll(async () => {
  await prisma.$disconnect();
});
