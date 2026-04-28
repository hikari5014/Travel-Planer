import "server-only";
import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-module reloads in dev. In production
// each Next.js worker gets its own; either way, never instantiate per-request.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
